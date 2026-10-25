"""Offline Pillow visual matching. No source photographs are ever written.

generate_index(photos, root, cache_path, output_path, *, check=False, stats=None)
accepts [{'path': '/projects/series/photo.jpg', 'project': 'series'}, ...].
Project defaults to the path's parent directory. Returns only the public schema;
optional stats is populated with count/computed/cached/seconds/public_bytes.
--check uses stat signatures and cached features only; never decodes or writes.
Changing features, thresholds or scoring requires bumping CACHE_VERSION.
"""
from __future__ import annotations

import argparse
import colorsys
from contextlib import contextmanager
import json
import math
import os
from pathlib import Path, PurePosixPath
import sys
import tempfile
import time
from types import SimpleNamespace

from PIL import Image, ImageOps, ImageStat

CACHE_VERSION = 1
LIMIT = 48


class VisualIndexError(ValueError):
    """Invalid input, unreadable photograph, or stale check result."""


def _json_bytes(value: dict) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def _read_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def _atomic_write(path: Path, body: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    name = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=path.name + '.', suffix='.tmp', delete=False) as stream:
            name = stream.name
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if name is not None and os.path.exists(name):
            os.unlink(name)


def _fingerprint(path: Path) -> dict:
    try:
        with Image.open(path) as original:
            width, height = original.size
            if original.getexif().get(274) in {5, 6, 7, 8}:
                width, height = height, width
            # JPEG decoder reduces work before EXIF transpose forces loading.
            original.draft('RGB', (128, 128))
            image = ImageOps.exif_transpose(original).convert('RGB').resize((64, 64), Image.Resampling.LANCZOS)
        gray = image.convert('L')
        palette = [0.0] * 16
        saturation = 0.0
        pixels = image.tobytes()
        for r, g, b in zip(pixels[0::3], pixels[1::3], pixels[2::3]):
            hue, sat, value = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            saturation += sat
            # Soft hue assignment avoids a discontinuity at the red wraparound.
            chroma = min(1.0, max(0.0, (sat - 0.08) / 0.22)) * min(1.0, value / 0.15)
            position = hue * 12
            lower = int(position) % 12
            fraction = position - int(position)
            palette[lower] += chroma * (1 - fraction) / 4096
            palette[(lower + 1) % 12] += chroma * fraction / 4096
            palette[12 + min(3, int(value * 4))] += (1 - chroma) / 4096
        histogram = gray.histogram()
        luma = [sum(histogram[i:i + 32]) / 4096 for i in range(0, 256, 32)]
        # BOX averages exact 16x16 pixel regions rather than sampling points.
        composition = [value / 255 for value in gray.resize((4, 4), Image.Resampling.BOX).tobytes()]
        summary = ImageStat.Stat(gray)
        small = gray.resize((9, 8), Image.Resampling.LANCZOS).tobytes()
        dhash = sum(int(small[y * 9 + x] > small[y * 9 + x + 1]) << (y * 8 + x)
                    for y in range(8) for x in range(8))
        return {'palette': palette, 'luma': luma, 'composition': composition,
                'mean': summary.mean[0] / 255, 'contrast': summary.stddev[0] / 255,
                'saturation': saturation / 4096, 'aspect': width / height,
                'dhash': format(dhash, '016x')}
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombError) as exc:
        raise VisualIndexError(f'Cannot fingerprint {path}: {exc}') from exc


def _valid_feature(feature: object) -> bool:
    if not isinstance(feature, dict):
        return False
    try:
        for key, length in [('palette', 16), ('luma', 8), ('composition', 16)]:
            vector = feature[key]
            if not isinstance(vector, list) or len(vector) != length:
                return False
            if any(not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 <= v <= 1 for v in vector):
                return False
        for key in ['palette', 'luma']:
            if abs(sum(feature[key]) - 1) > 0.001:
                return False
        for key in ['mean', 'contrast', 'saturation', 'aspect']:
            value = feature[key]
            if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                return False
            if key != 'aspect' and value > 1:
                return False
        return feature['aspect'] > 0 and len(feature['dhash']) == 16 and 0 <= int(feature['dhash'], 16) < 2**64
    except (KeyError, TypeError, ValueError):
        return False


def _distance(a: dict, b: dict) -> tuple[float, float, float, float, float]:
    palette = sum(abs(x - y) for x, y in zip(a['palette'], b['palette'])) / 2
    luma = sum(abs(x - y) for x, y in zip(a['luma'], b['luma'])) / 2
    raw_grid = sum(abs(x - y) for x, y in zip(a['composition'], b['composition'])) / 16
    # Separate arrangement from exposure; bound contrast normalization in flat images.
    arrangement = sum(abs((x - a['mean']) / max(0.12, a['contrast']) -
                          (y - b['mean']) / max(0.12, b['contrast']))
                      for x, y in zip(a['composition'], b['composition'])) / 64
    aspect = min(1.0, abs(math.log(a['aspect'] / b['aspect'])))
    light = 0.55 * luma + 0.3 * abs(a['mean'] - b['mean']) + 0.15 * abs(a['contrast'] - b['contrast'])
    color = 0.85 * palette + 0.15 * abs(a['saturation'] - b['saturation'])
    structure = 0.60 * arrangement + 0.25 * raw_grid + 0.15 * aspect
    return color, structure, light, raw_grid, aspect


def _rank(paths: list[str], projects: list[str], features: list[dict]) -> dict:
    size = len(paths)
    parents = list(range(size))

    def find(i: int) -> int:
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i

    distances = {}
    for i in range(size):
        for j in range(i + 1, size):
            a, b = features[i], features[j]
            distance = _distance(a, b)
            distances[i, j] = distance
            color, _, light, grid, aspect = distance
            # All gates must agree: dHash alone merges unrelated blank/flat scenes.
            if ((int(a['dhash'], 16) ^ int(b['dhash'], 16)).bit_count() <= 4
                    and color <= 0.075 and light <= 0.065 and grid <= 0.035
                    and aspect <= 0.025 and abs(a['mean'] - b['mean']) <= 0.035
                    and abs(a['contrast'] - b['contrast']) <= 0.035):
                left, right = find(i), find(j)
                parents[max(left, right)] = min(left, right)
    # Every photo has a nonnegative group ID, including singleton clusters.
    labels = {}
    groups = [labels.setdefault(find(i), len(labels)) for i in range(size)]
    matches = []
    for i in range(size):
        rankings: dict[str, list[tuple[float, str, int]]] = {'palette': [], 'structure': [], 'bridge': []}
        for j in range(size):
            if groups[i] == groups[j]:
                continue
            color, structure, light, _, _ = distances[min(i, j), max(i, j)]
            same = projects[i] == projects[j]
            penalty = 0.035 if same else 0.0
            rankings['palette'].append((0.80 * color + 0.20 * light + penalty, paths[j], j))
            rankings['structure'].append((0.80 * structure + 0.20 * light + penalty, paths[j], j))
            if not same:
                rankings['bridge'].append((0.40 * color + 0.40 * structure + 0.20 * light, paths[j], j))
        matches.append({key: [entry[2] for entry in sorted(values)[:LIMIT]] for key, values in rankings.items()})
    return {'version': 1, 'paths': paths, 'groups': groups, 'matches': matches}


def generate_index(photos: list[dict], root: Path, cache_path: Path, output_path: Path,
                   *, check: bool = False, stats: dict | None = None) -> dict:
    """Build (or check) the compact public index. Input order is preserved.

    Cache keys are site-root paths; signatures are [size, mtime_ns]. Changed,
    missing or malformed cache entries rebuild, except in check mode (error).
    Deleted entries are pruned. Fingerprint failures leave prior files intact.
    """
    started = time.perf_counter()
    root, cache_path, output_path = Path(root).resolve(), Path(cache_path), Path(output_path)
    cache = _read_json(cache_path)
    entries = cache.get('entries', {}) if cache.get('version') == CACHE_VERSION else {}
    if not isinstance(entries, dict):
        entries = {}
    paths, projects, features = [], [], []
    fresh = {}
    computed = cached = 0
    for photo in photos:
        path = photo.get('path')
        if not isinstance(path, str) or not path.startswith('/') or '\\' in path:
            raise VisualIndexError(f'Expected site-root image path, got {path!r}')
        posix = PurePosixPath(path)
        if '..' in posix.parts or str(posix) != path or path.startswith('//') or path in fresh:
            raise VisualIndexError(f'Unsafe, noncanonical or repeated image path: {path}')
        source = (root / path.lstrip('/')).resolve()
        if not source.is_relative_to(root):
            raise VisualIndexError(f'Image escapes root: {path}')
        if source in {cache_path.resolve(), output_path.resolve()}:
            raise VisualIndexError(f'Output would overwrite photograph: {path}')
        try:
            stat = source.stat()
        except OSError as exc:
            raise VisualIndexError(f'Cannot stat {path}: {exc}') from exc
        signature = [stat.st_size, stat.st_mtime_ns]
        entry = entries.get(path, {})
        if isinstance(entry, dict) and entry.get('signature') == signature and _valid_feature(entry.get('feature')):
            feature = entry['feature']
            cached += 1
        elif check:
            raise VisualIndexError(f'Stale or missing fingerprint: {path}; rebuild without --check')
        else:
            feature = _fingerprint(source)
            after = source.stat()
            if signature != [after.st_size, after.st_mtime_ns]:
                raise VisualIndexError(f'Photograph changed while reading: {path}; retry')
            computed += 1
        fresh[path] = {'signature': signature, 'feature': feature}
        paths.append(path)
        projects.append(str(photo.get('project', posix.parent.as_posix())))
        features.append(feature)
    result = _rank(paths, projects, features)
    body = _json_bytes(result)
    if check:
        if cache.get('version') != CACHE_VERSION or set(entries) != set(fresh):
            raise VisualIndexError('Stale cache catalog; rebuild without --check')
        try:
            current = output_path.read_bytes()
        except OSError as exc:
            raise VisualIndexError(f'Cannot read public index: {exc}') from exc
        if current != body:
            raise VisualIndexError('Public index is out of date; rebuild without --check')
    else:
        _atomic_write(cache_path, _json_bytes({'version': CACHE_VERSION, 'entries': fresh}))
        _atomic_write(output_path, body)
    if stats is not None:
        stats.update(count=len(paths), computed=computed, cached=cached,
                     seconds=time.perf_counter() - started, public_bytes=len(body))
    return result


def _catalog_photos() -> tuple[list[dict], Path]:
    import preview

    @contextmanager
    def dimensions_not_needed(_path):
        yield SimpleNamespace(size=(0, 0), getexif=lambda: {})

    # catalog()'s discovery/ordering is authoritative, but its dimensions aren't
    # used here. In particular PNG getexif() can decode the entire source. This
    # standalone CLI temporarily bypasses only catalog's image-header reads.
    original = preview.Image
    try:
        preview.Image = SimpleNamespace(open=dimensions_not_needed)
        data = preview.catalog()
    finally:
        preview.Image = original
    return ([dict(image, project=project['id']) for project in data['projects']
             for image in project['images']], preview.ROOT)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Check signatures and exact public output without decoding/writing')
    args = parser.parse_args()
    started = time.perf_counter()
    try:
        photos, root = _catalog_photos()
        stats: dict = {}
        directory = Path(__file__).resolve().parent
        generate_index(photos, root, directory / '.visual-cache.json', directory / 'visual-index.json',
                       check=args.check, stats=stats)
        print(f"{'Checked' if args.check else 'Built'} {stats['count']} photos; "
              f"computed={stats['computed']} cached={stats['cached']}; "
              f"{time.perf_counter() - started:.3f}s; public={stats['public_bytes']} bytes")
        return 0
    except (VisualIndexError, OSError) as exc:
        print(f'Visual index error: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())