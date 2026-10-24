"""Regression checks for the read-only preview catalog."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import preview


class CatalogTests(unittest.TestCase):
    def test_future_project_and_unlisted_images_are_discovered(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            folder = root / 'projects' / 'future-project'
            folder.mkdir(parents=True)
            (folder.parent / 'index.md').write_text('---\nimages: []\n---', encoding='utf-8')
            (folder / 'index.md').write_text('---\nlayout: project\ntitle: A new collection\ndiscovery_tags: [film]\nimages: []\n---', encoding='utf-8')
            for name in ['new.jpg', 'XL_new.jpg']:
                preview.Image.new('RGB', (20, 15)).save(folder / name)
            with patch.object(preview, 'ROOT', root):
                data = preview.catalog()
            self.assertEqual(len(data['projects']), 1)
            project = data['projects'][0]
            self.assertEqual(project['id'], 'future-project')
            self.assertEqual(project['tags'], ['film'])
            self.assertEqual(len(project['images']), 1)
            self.assertEqual(project['images'][0]['path'], '/projects/future-project/new.jpg')

    def test_frontmatter_does_not_split_film_filenames(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'index.md'
            path.write_text('---\ntitle: Film\nimages:\n  - path: /film/---_1995.jpg\n  - path: /film/_13.jpg\n---\nBody', encoding='utf-8')
            data = preview.frontmatter(path)
            self.assertEqual(len(data['images']), 2)
            self.assertEqual(data['images'][0]['path'], '/film/---_1995.jpg')

    def test_catalog_includes_new_photos_preserving_original_order(self):
        data = preview.catalog()
        film = next(project for project in data['projects'] if project['id'] == 'film-revival')
        listed = preview.frontmatter(preview.ROOT / 'projects/film-revival/index.md')['images']
        self.assertEqual([image['path'] for image in film['images'][:len(listed)]], [image['path'] for image in listed])
        self.assertGreaterEqual(len(film['images']), 12)
        self.assertIn('/projects/film-revival/_13_0922.jpg', [image['path'] for image in film['images']])

    def test_all_images_exist_and_are_unique(self):
        for project in preview.catalog()['projects']:
            paths = [image['path'].lower() for image in project['images']]
            self.assertEqual(len(paths), len(set(paths)), project['id'])
            for image in project['images']:
                self.assertTrue((preview.ROOT / image['path'].lstrip('/')).is_file(), image['path'])
                self.assertGreater(image['width'], 0)
                self.assertGreater(image['height'], 0)
                self.assertFalse(Path(image['path']).name.lower().startswith('xl_'))


if __name__ == '__main__':
    unittest.main()