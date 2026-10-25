"""Regression checks for catalog discovery and main-site integration."""
import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen
from unittest.mock import patch

import liquid
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

    def test_descriptions_preserve_authored_markdown_and_line_breaks(self):
        projects = {project['id']: project for project in preview.catalog()['projects']}
        postcard = projects['postcard-one']
        self.assertEqual(postcard['description'], 'January 2026')
        self.assertIn(postcard['blurb'], postcard['blurb_html'])
        cincy = projects['cincy-2020']['blurb_html']
        self.assertIn('<br>', cincy)
        self.assertIn('href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11858458/"', cincy)
        self.assertEqual(projects['golden-hour']['blurb_html'], '')


class DeploymentTests(unittest.TestCase):
    def environment(self, baseurl):
        environment = liquid.Environment()
        environment.add_filter('jsonify', lambda value: json.dumps(value, ensure_ascii=False))
        environment.add_filter('markdownify', preview.markdown.markdown)
        environment.add_filter('relative_url', lambda value: baseurl + '/' + value.lstrip('/'))
        environment.add_filter('absolute_url', lambda value: 'https://santacml.github.io' + value)
        return environment

    def test_liquid_catalog_matches_preview_and_includes_new_scans(self):
        root = preview.ROOT
        config = preview.yaml.safe_load((root / '_config.yml').read_text(encoding='utf-8'))
        pages = []
        for path in sorted((root / 'projects').rglob('index.md')):
            data = preview.frontmatter(path)
            data['url'] = '/' + path.parent.relative_to(root).as_posix() + '/'
            pages.append(data)
        static_files = []
        for path in sorted((root / 'projects').rglob('*')):
            if not path.is_file() or path.suffix.lower() not in preview.IMAGE_EXTENSIONS:
                continue
            relative = path.relative_to(root).as_posix()
            # Jekyll filters nested-directory entries by basename, not full path.
            if path.name.startswith('_') and path.name not in config['include']:
                continue
            static_files.append({'path': '/' + relative, 'name': path.name, 'extname': path.suffix})
        template = (root / 'prototype/data.json').read_text(encoding='utf-8').split('---', 2)[2]
        environment = self.environment('/gallery')
        data = json.loads(environment.from_string(template).render(site={
            'baseurl': '/gallery', 'pages': pages, 'static_files': static_files,
        }))
        self.assertEqual(data['baseurl'], '/gallery')
        expected = {project['id']: project for project in preview.catalog()['projects']}
        self.assertEqual(len(data['projects']), len(expected))
        for project in data['projects']:
            local = expected[project['id']]
            self.assertEqual({image['path'].lower() for image in project['images']}, {image['path'].lower() for image in local['images']}, project['id'])
            self.assertEqual(project['description'], local['description'])
            self.assertEqual(project['blurb_html'], local['blurb_html'])
            self.assertEqual(project['sequence'], local['sequence'])
        self.assertEqual(len(next(p for p in data['projects'] if p['id'] == 'film-revival')['images']), 12)

    def test_legacy_redirects_respect_baseurl(self):
        template = (preview.ROOT / '_includes/gallery-redirect.html').read_text(encoding='utf-8')
        for base in ['', '/gallery']:
            for route in ['/', '/projects', '/project/little-bords', '/not-found']:
                output = self.environment(base).from_string(template).render(
                    site={'title': 'Birds & Buildings'}, page={'title': 'Birds'}, include={'route': route},
                )
                self.assertIn(f'content="0; url={base}/#{route}"', output)
                self.assertIn(f'href="{base}/#{route}"', output)


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.log_patch = patch.object(preview.Handler, 'log_message')
        cls.log_patch.start()
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), preview.Handler)
        cls.origin = 'http://127.0.0.1:' + str(cls.server.server_port)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.log_patch.stop()

    def test_root_and_baseurl_serve_main_site_and_catalog(self):
        for base in ['', '/gallery']:
            with urlopen(self.origin + base + '/') as response:
                self.assertEqual(response.url, self.origin + base + '/')
                html = response.read().decode('utf-8')
            self.assertIn('./prototype/app.js', html)
            self.assertNotIn('noindex', html)
            for asset in ['app.js', 'style.css']:
                with urlopen(self.origin + base + '/prototype/' + asset) as response:
                    self.assertEqual(response.status, 200)
                    response.read()
            with urlopen(self.origin + base + '/prototype/data.json') as response:
                data = json.load(response)
            self.assertEqual(data['baseurl'], base)
            self.assertEqual(len(data['projects']), 10)

    def test_old_urls_redirect_and_photo_paths_still_work(self):
        for base in ['', '/gallery']:
            for old, new in [('projects/', '/projects'), ('projects/film-revival/', '/project/film-revival'), ('about/', '/')]:
                with urlopen(self.origin + base + '/' + old) as response:
                    self.assertEqual(response.url, self.origin + base + '/#' + new)
            with urlopen(self.origin + base + '/projects/film-revival/_13_0922.jpg') as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.headers.get_content_type(), 'image/jpeg')
                response.read()


if __name__ == '__main__':
    unittest.main()