"""Local-only preview: metadata catalog + on-demand, web-sized photo derivatives.

Run from any directory. Does not write or modify source photographs.
Requires PyYAML and Pillow. Jekyll deployments use data.json instead.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

import yaml
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.avif'}


def frontmatter(path: Path) -> dict:
    text = path.read_text(encoding='utf-8-sig')
    if not text.startswith('---'):
        return {}
    # Film scan filenames can contain "---"; only whole-line delimiters count.
    sections = re.split(r'^---\s*$', text, maxsplit=2, flags=re.MULTILINE)
    return yaml.safe_load(sections[1]) or {}


def catalog() -> dict:
    index = frontmatter(ROOT / 'projects' / 'index.md')
    covers = {p['project-folder']: p for p in index.get('images', [])}
    projects = []
    for metadata in sorted((ROOT / 'projects').glob('*/index.md')):
        data = frontmatter(metadata)
        if data.get('layout') != 'project':
            continue
        folder = '/projects/' + metadata.parent.name + '/'
        cover = covers.get(folder, {})
        images = list(data.get('images', []))
        listed = {image['path'].lower() for image in images}
        for path in sorted(metadata.parent.iterdir()):
            if path.suffix.lower() not in IMAGE_EXTENSIONS or path.name.lower().startswith('xl_'):
                continue
            relative = folder + path.name
            if relative.lower() not in listed:
                images.append({'path': relative, 'caption': '', 'unlisted': True})
                listed.add(relative.lower())
        prepared = []
        for image in images:
            source = ROOT / image['path'].lstrip('/')
            if not source.is_file():
                matches = [p for p in metadata.parent.iterdir() if p.name.lower() == source.name.lower()]
                if matches:
                    source = matches[0]
                else:
                    print('Missing image:', image['path'])
                    continue
            relative = '/' + source.relative_to(ROOT).as_posix()
            try:
                with Image.open(source) as photo:
                    width, height = photo.size
                    if photo.getexif().get(274) in {5, 6, 7, 8}:
                        width, height = height, width
            except (OSError, ValueError):
                width, height = 0, 0
            prepared.append({
                'path': relative, 'caption': image.get('caption') or '',
                'xl': image.get('xl_path', ''), 'unlisted': image.get('unlisted', False),
                'width': width, 'height': height,
                'thumbnail': '/prototype/thumb' + relative,
            })
        projects.append({
            'id': metadata.parent.name, 'title': data.get('title', metadata.parent.name),
            'description': data.get('description') or '', 'blurb': data.get('blurb') or '',
            'cover': cover.get('image_path', ''), 'updated': bool(cover.get('updated')),
            'tags': data.get('discovery_tags', []), 'images': prepared,
        })
    return {'baseurl': '', 'projects': projects}


class Handler(SimpleHTTPRequestHandler):
    thumbnails: dict[str, bytes] = {}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path == '/':
            self.send_response(302)
            self.send_header('Location', '/prototype/')
            self.end_headers()
        elif path == '/prototype/data.json':
            body = json.dumps(catalog(), ensure_ascii=False).encode('utf-8')
            self.send_body(body, 'application/json; charset=utf-8')
        elif path.startswith('/prototype/thumb/projects/'):
            source = (ROOT / path.removeprefix('/prototype/thumb/')).resolve()
            if not source.is_relative_to(ROOT / 'projects') or not source.is_file():
                self.send_error(404)
                return
            key = hashlib.sha256((str(source) + str(source.stat().st_mtime_ns)).encode()).hexdigest()
            try:
                if key not in self.thumbnails:
                    with Image.open(source) as original:
                        image = ImageOps.exif_transpose(original).convert('RGB')
                        image.thumbnail((1600, 1600))
                        output = io.BytesIO()
                        image.save(output, 'WEBP', quality=82)
                        self.thumbnails[key] = output.getvalue()
                self.send_body(self.thumbnails[key], 'image/webp', cache=True)
            except (OSError, ValueError):
                self.send_error(404)
        else:
            super().do_GET()

    def send_body(self, body: bytes, content_type: str, cache: bool = False):
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'public, max-age=3600' if cache else 'no-store')
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4173)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Prototype ready: http://127.0.0.1:{args.port}/prototype/', flush=True)
    print('Original site files and photographs are unchanged. Ctrl+C stops preview.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()