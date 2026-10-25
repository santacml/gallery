# Birds & Buildings

The main site now uses the approved photo-first gallery: paper/charcoal themes,
Projects, Wander, and the compact image viewer. The existing project dates and
descriptions appear below each project's photographs, before related projects.

## Preview

Use the existing **Preview photography prototype** VS Code task, then open
http://127.0.0.1:4173/ (main site) or http://127.0.0.1:4173/gallery/
(GitHub Pages baseurl). The original prototype URL still works and shares the
same scripts and styles. Preview dependencies are listed in
[prototype/requirements.txt](prototype/requirements.txt).

## Publishing

The root page is the new entry point. GitHub Pages still builds the catalog with
Jekyll using [_config.yml](_config.yml); no optional config overlay is needed.
Existing project URLs redirect into the new galleries. About is no longer a
separate page. Image paths and original photograph files are unchanged.

GitHub Pages publishes from the `gh-pages` branch. The seven new Film Revival
scans are included in this release. The previous site is preserved by the
annotated `original-site` tag at baseline `f4d8b6f` on GitHub as well as locally.

## Adding work

Continue editing project metadata under [projects](projects/index.md): `title`,
`description` (date/subtitle), `blurb` (Markdown supported), and `images`.
Unlisted non-XL photographs in each project folder are discovered automatically;
new projects with `layout: project` are discovered too. Jekyll ignores filenames
beginning with an underscore unless explicitly added to `include` in the config.

## Checks

The unittest suite under [prototype/test_preview.py](prototype/test_preview.py)
checks catalog discovery, description markup, deployment catalog rendering, and
root/baseurl HTTP routes. Test-only Liquid rendering dependencies are in
[prototype/requirements-test.txt](prototype/requirements-test.txt).