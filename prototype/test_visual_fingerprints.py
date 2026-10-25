"""Synthetic, isolated offline visual-index regression tests (Pillow + stdlib)."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image, ImageDraw, ImageOps

import visual_fingerprints as visual


class VisualFingerprintTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.cache = self.root / '.visual-cache.json'
        self.output = self.root / 'visual-index.json'
        self.photos = []

    def add(self, name, color='red', project='a', image=None):
        path = f'/projects/{project}/{name}.png'
        target = self.root / path.lstrip('/')
        target.parent.mkdir(parents=True, exist_ok=True)
        if image is None:
            image = Image.new('RGB', (96, 64), color)
        image.save(target)
        photo = {'path': path, 'project': project}
        self.photos.append(photo)
        return len(self.photos) - 1

    def build(self, **kwargs):
        return visual.generate_index(self.photos, self.root, self.cache, self.output, **kwargs)

    def arrangement(self, axis='top', colors=('white', 'black')):
        image = Image.new('RGB', (96, 64), colors[0])
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 32, 95, 63) if axis == 'top' else (48, 0, 95, 63), fill=colors[1])
        return image

    def test_palette_prefers_same_color(self):
        source = self.add('source', 'red')
        same = self.add('same', (210, 35, 35), project='b')
        other = self.add('other', 'blue', project='c')
        result = self.build()
        self.assertNotEqual(result['groups'][source], result['groups'][same])
        self.assertLess(result['matches'][source]['palette'].index(same), result['matches'][source]['palette'].index(other))

    def test_structure_prefers_arrangement_over_color(self):
        source = self.add('source', image=self.arrangement())
        same = self.add('same', project='b', image=self.arrangement(colors=('yellow', '#202080')))
        other = self.add('other', project='c', image=self.arrangement('left'))
        ranking = self.build()['matches'][source]['structure']
        self.assertLess(ranking.index(same), ranking.index(other))

    def test_duplicates_near_duplicates_and_aspect_gate(self):
        source_image = self.arrangement(colors=('#c0c0c0', '#303030'))
        first = self.add('first', image=source_image)
        exact = self.add('exact', project='b', image=source_image.copy())
        near = self.add('near', project='c', image=ImageOps.expand(source_image, border=0).point(lambda x: x + 2))
        portrait = self.add('portrait', image=source_image.resize((64, 96)))
        unrelated = self.add('unrelated', 'blue')
        result = self.build()
        self.assertEqual(result['groups'][first], result['groups'][exact])
        self.assertEqual(result['groups'][first], result['groups'][near])
        self.assertNotEqual(result['groups'][first], result['groups'][portrait])
        self.assertNotEqual(result['groups'][first], result['groups'][unrelated])
        for ranking in result['matches'][first].values():
            self.assertNotIn(exact, ranking)
            self.assertNotIn(near, ranking)

    def test_bridge_and_all_candidate_invariants_and_limit(self):
        for i in range(60):
            self.add(str(i), ((i * 41) % 256, (i * 79) % 256, (i * 113) % 256), project=str(i % 3))
        result = self.build()
        self.assertEqual(set(result), {'version', 'paths', 'groups', 'matches'})
        for i, matches in enumerate(result['matches']):
            self.assertEqual(set(matches), {'palette', 'structure', 'bridge'})
            for key, ranking in matches.items():
                self.assertLessEqual(len(ranking), 48)
                self.assertEqual(len(ranking), len(set(ranking)))
                self.assertNotIn(i, ranking)
                for j in ranking:
                    self.assertTrue(0 <= j < len(self.photos))
                    self.assertNotEqual(result['groups'][i], result['groups'][j])
                    if key == 'bridge':
                        self.assertNotEqual(self.photos[i]['project'], self.photos[j]['project'])
        self.assertEqual(len(result['matches'][0]['palette']), 48)

    def test_cache_change_new_deleted_and_unchanged_without_open(self):
        self.add('first')
        self.add('deleted', 'blue')
        original_bytes = (self.root / self.photos[0]['path'].lstrip('/')).read_bytes()
        first = self.build()
        stats = {}
        with patch.object(visual.Image, 'open', side_effect=AssertionError('Must not decode unchanged image')):
            self.assertEqual(first, self.build(stats=stats))
            self.assertEqual(first, self.build(check=True))
        self.assertEqual(stats['computed'], 0)
        self.assertEqual(stats['cached'], 2)
        self.assertEqual(original_bytes, (self.root / self.photos[0]['path'].lstrip('/')).read_bytes())
        removed = self.photos.pop()
        (self.root / removed['path'].lstrip('/')).unlink()
        changed = self.root / self.photos[0]['path'].lstrip('/')
        old_stat = changed.stat()
        Image.new('RGB', (96, 64), 'green').save(changed)
        os.utime(changed, ns=(old_stat.st_atime_ns, old_stat.st_mtime_ns + 10_000_000))
        self.add('new', 'purple', project='b')
        with self.assertRaises(visual.VisualIndexError):
            self.build(check=True)
        result = self.build(stats=stats)
        self.assertEqual(stats['computed'], 2)
        self.assertEqual(stats['cached'], 0)
        self.assertEqual(set(json.loads(self.cache.read_text())['entries']), set(result['paths']))
        self.assertNotIn(removed['path'], result['paths'])
        self.assertEqual(result, self.build(check=True))

    def test_check_no_writes_and_detects_output_and_stale_paths(self):
        self.add('one')
        self.add('two', 'blue')
        self.build()
        with patch.object(visual, '_atomic_write', side_effect=AssertionError('No writes')):
            self.build(check=True)
        self.output.write_text('{}')
        with self.assertRaisesRegex(visual.VisualIndexError, 'Public index'):
            self.build(check=True)
        self.build()
        self.photos.pop()
        with self.assertRaisesRegex(visual.VisualIndexError, 'Stale cache catalog'):
            self.build(check=True)

    def test_empty_singleton_and_same_project_only(self):
        self.assertEqual(self.build(), {'version': 1, 'paths': [], 'groups': [], 'matches': []})
        self.assertEqual(self.build(check=True)['paths'], [])
        self.add('one')
        self.assertEqual(self.build()['matches'], [{'palette': [], 'structure': [], 'bridge': []}])
        self.add('two', 'blue')
        self.assertEqual(self.build()['matches'][0]['bridge'], [])

    def test_corruption_fails_without_replacing_previous_artifacts(self):
        self.add('good')
        self.build()
        old = (self.cache.read_bytes(), self.output.read_bytes())
        bad = self.add('bad')
        (self.root / self.photos[bad]['path'].lstrip('/')).write_bytes(b'not an image')
        with self.assertRaisesRegex(visual.VisualIndexError, 'Cannot fingerprint.*bad'):
            self.build()
        self.assertEqual(old, (self.cache.read_bytes(), self.output.read_bytes()))

    def test_missing_source_invalid_paths_and_duplicate_inputs(self):
        self.add('one')
        (self.root / self.photos[0]['path'].lstrip('/')).unlink()
        with self.assertRaisesRegex(visual.VisualIndexError, 'Cannot stat'):
            self.build()
        for path in ['/../outside.jpg', '//outside.jpg', '/projects/./one.jpg', 'relative.jpg']:
            self.photos = [{'path': path}]
            with self.assertRaises(visual.VisualIndexError):
                self.build()
        self.photos = []
        self.add('fresh')
        self.photos.append(self.photos[0].copy())
        with self.assertRaisesRegex(visual.VisualIndexError, 'repeated'):
            self.build()

    def test_malformed_cache_rebuilds_and_determinism(self):
        self.add('a', 'red')
        self.add('b', 'blue', project='b')
        result = self.build()
        body = self.output.read_bytes()
        self.cache.write_text('{broken')
        stats = {}
        self.assertEqual(result, self.build(stats=stats))
        self.assertEqual(stats['computed'], 2)
        self.assertEqual(body, self.output.read_bytes())
        cache = json.loads(self.cache.read_text())
        cache['entries'][self.photos[0]['path']]['feature']['palette'] = [float('nan')] * 16
        self.cache.write_text(json.dumps(cache))
        with self.assertRaises(visual.VisualIndexError):
            self.build(check=True)
        self.assertEqual(result, self.build(stats=stats))
        self.assertEqual(stats['computed'], 1)

    def test_exif_orientation_and_jpeg_draft(self):
        source = self.root / 'oriented.jpg'
        exif = Image.Exif()
        exif[274] = 6
        self.arrangement().resize((960, 640)).save(source, exif=exif)
        self.photos = [{'path': '/oriented.jpg'}]
        self.build()
        feature = json.loads(self.cache.read_text())['entries']['/oriented.jpg']['feature']
        self.assertAlmostEqual(feature['aspect'], 640 / 960)
        self.assertLess(feature['composition'][0], feature['composition'][3])

    def test_catalog_discovery_never_opens_images_including_png(self):
        import preview

        self.add('png')
        folder = self.root / 'projects' / 'a'
        (folder.parent / 'index.md').write_text('---\nimages: []\n---', encoding='utf-8')
        (folder / 'index.md').write_text('---\nlayout: project\nimages: []\n---', encoding='utf-8')
        original = preview.Image
        with patch.object(preview, 'ROOT', self.root), patch.object(visual.Image, 'open', side_effect=AssertionError('No opens')):
            photos, root = visual._catalog_photos()
        self.assertIs(preview.Image, original)
        self.assertEqual(root, self.root)
        self.assertEqual([p['path'] for p in photos], [p['path'] for p in self.photos])


if __name__ == '__main__':
    unittest.main()