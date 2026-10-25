# Main-site promotion

The approved design now also powers the root homepage. Shared frontend assets
remain here to avoid maintaining two versions. The catalog is resolved relative
to the script, so both the main entry point and this prototype work under the
GitHub Pages baseurl. Earlier isolation notes below describe the prototype phase.

Project dates and authored Markdown blurbs are displayed after the photographs,
before the related-project links. Legacy project/index URLs redirect into the new
gallery. The primary config now includes the two underscore-prefixed Film Revival
scans, so publishing no longer requires the optional config overlay.

Preview the main site at http://127.0.0.1:4173/ or the deployment-path equivalent
at http://127.0.0.1:4173/gallery/. GitHub Pages publishes the main site from
`gh-pages`; the previous site is preserved by the `original-site` backup tag.

# Isolated photography prototype

## Spacing-only repair

Rollback checkpoint before this repair: `7475b71`.

- Project photographs pack into the existing two column widths, eliminating
  row-height holes without cropping. DOM and image-viewer order are preserved.
- Wander batches balance image counts and proportional heights, including
  portrait/landscape differences. Existing images stay put on Load more.
- Each grid uses matching horizontal and vertical gutters: projects 24px,
  Wander 28px, and 16px on phones. Typography, icons, colors, and column counts
  are unchanged from the checkpoint.
- Geometry checked for all ten projects at 1440px and 390px using isolated
  iframes, not shared-browser device emulation. Twelve shuffled batches per
  size checked for even counts and unique photos; append stability verified.
- Perfectly level column bottoms cannot be guaranteed without cropping,
  resizing, or relaxing even image counts. The layout minimizes that remainder.

## Photo-first revision

Removed editorial prose, invented descriptions, Field Notes branding, visible
photo counts, image captions, thematic filter controls, and promotional sections.
Home opens directly on a photograph. Project names and navigation are small;
Wander keeps Shuffle and an arrow to load more. Project context remains available
inside the viewer. Accessibility labels and source metadata are preserved.
The original design notes below describe the first iteration where they differ.

Baseline: `f4d8b6f14d9ea960a606f70d42c75d0a828f4443`  
Branch: `design/field-notes-prototype`

All redesign code lives in this folder, plus a new VS Code preview task and an
optional root-level Jekyll configuration overlay. No existing layouts, styles, navigation,
project metadata, or photographs are modified. Nothing has been committed or pushed.
The seven newly added Film Revival originals belong to the user and are untouched.

## Local preview

Install this folder’s requirements in a Python 3.10+ environment, then run
`python prototype/preview.py` from the repository root. Visit
http://127.0.0.1:4173/prototype/. The running VS Code preview uses the configured
Python environment. Stop its terminal with Ctrl+C to shut it down.
It is also available through VS Code’s Run Task menu as
**Preview photography prototype** in `.vscode/tasks.json`.

This server binds only to localhost. It does not build the original Jekyll site.
Its root redirects to the prototype, while original photographs are served at
their existing paths. The Original site link opens the existing published site
when previewing locally; original Liquid pages are not rendered by this server.

## What to try

- Home: curated opening photograph and selected series.
- Projects: all collections, light thematic filtering, automatic photo counts.
- Wander: shuffled cross-project photography, 18 photos at a time, thematic
  filters, session-persistent order, and explicit reshuffling.
- A project: original-order, uncropped photographs with editorial pacing,
  captions, and related/contrasting destinations.
- Viewer: keyboard arrows, Escape, touch swipes, project source, original image,
  shareable image URL, no surprise jump into a different collection.
- Half-circle button: paper / charcoal, saved between visits.
- Mobile and reduced-motion layouts, keyboard focus, modal focus containment.

## Adding photographs and projects

The catalog reads all `projects/*/index.md` files with `layout: project`.
New project folders appear automatically, even when not in the original project
index. Listed images preserve their order and captions. Unlisted JPG, JPEG, PNG,
WebP, and AVIF files in each project folder are appended automatically; `XL_`
files are excluded as full-resolution duplicates. In the local preview this
includes all seven new Film Revival images (12 photographs total).

For intentional sequencing/captions, add new images to their existing project
frontmatter later. This prototype does not perform that live-site change.
The existing project index remains the source for cover choices and update flags.

Optional `discovery_tags: [birds, film, light]` in a project’s frontmatter can
override the prototype’s defaults. Unknown projects still appear under Everything
and in Wander without requiring a new hardcoded entry. Project-specific short
editorial descriptions and legacy theme defaults live in `app.js`.

The preview generates web-sized WebP derivatives in memory, only when requested;
original files are never recompressed or overwritten. The catalog is regenerated
on refresh, including real image dimensions and corrected filename casing.

## Jekyll / GitHub Pages

`data.json` is a Liquid-generated version of the same catalog. Jekyll can publish
the prototype at `/gallery/prototype/` with existing baseurl settings, without
changing the homepage. The standalone shell has no frontmatter intentionally.
Only the catalog needs Liquid processing. Local preview derivatives are an
optimization, not a requirement: Jekyll uses existing display-sized originals.

Jekyll normally excludes underscore-prefixed files. To include the two new
underscore-prefixed Film Revival scans in a Jekyll preview, merge the optional
`_config.prototype.yml` overlay into the build configuration. The overlay does
not change the live configuration. New underscore-prefixed photographs need
equivalent includes or non-underscore filenames before deployment.

No analytics is added to this prototype. It is marked noindex. Google Fonts is
the only external UI resource; a system-font fallback works offline.

## Undo / compare

The original site is unchanged: compare against the baseline with Git, or switch
back to your original branch once you have saved the prototype work. Untracked
files remain when switching branches until committed, moved, or removed. Do not
use a blanket clean/reset: it would risk the user’s new photo files.

## Intentional prototype limits

- Hash routing keeps all preview navigation under one isolated subpage.
- Full-resolution viewer images can be large; thumbnails are optimized locally.
- The project About copy is a draft and should be approved before publication.
- Related projects use lightweight theme overlap, not AI or visual similarity.
- Existing source captions/metadata are used as provided, not rewritten.
- Metadata-heavy catalogs should eventually be prebuilt once collections become
  much larger; the UI already loads the Wander stream in batches.

## Verification

`python -m unittest discover -s prototype -p test_preview.py -v` checks catalog
integrity, original image order, all new Film Revival scans, filename delimiter
handling, and discovery of a completely new project without index edits.

Browser-tested at desktop and 390px mobile widths: routes, theme persistence,
filters, batch loading, keyboard arrows/Escape, modal focus, shareable photo links,
and loading the new underscore-prefixed scans. Jekyll itself was not run locally
because Ruby/Jekyll is not installed; the local preview is the verified path.