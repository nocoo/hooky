"""Build this repository's tested extension and its versioned submission materials."""
from pathlib import Path
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'materials/source'
package = json.loads((ROOT / 'package.json').read_text())
slug, version = package['name'], package['version']
assert slug in ['hooky', 'r2shot']
assert re.fullmatch(r'\d+\.\d+\.\d+(?:\.\d+)?', version)
manifest_path = ROOT / ('manifest.json' if slug == 'hooky' else 'public/manifest.json')
assert json.loads(manifest_path.read_text())['version'] == version, 'Manifest/package versions differ'
OUT = ROOT / 'materials' / version
for folder in ['verification', 'site', 'store/text', 'store/screenshots', 'store/banners', 'store/marquee']:
    (OUT / folder).mkdir(parents=True, exist_ok=True)
copy = json.loads((SOURCE / 'copy.json').read_text())
assert copy['version'] == version, 'Update the local listing copy for this version first'
assert json.loads((SOURCE / 'captures/provenance.json').read_text())['version'] == version, 'Update UI captures for this version first'
escape = html.escape
env = os.environ.copy()
if 'PUPPETEER_EXECUTABLE_PATH' not in env and Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome').is_file():
    env['PUPPETEER_EXECUTABLE_PATH'] = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

def run(command, log=None):
    result = subprocess.run(command, cwd=ROOT, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if log:
        (OUT / 'verification' / log).write_text('\n'.join(line.rstrip() for line in result.stdout.replace(str(ROOT), '.').splitlines()).strip() + '\n')
    print(result.stdout, end='', flush=True)
    result.check_returncode()
    return result.stdout

def members(path):
    with zipfile.ZipFile(path) as archive:
        names = [name for name in archive.namelist() if not name.endswith('/')]
        assert len(names) == len(set(names)), 'Duplicate ZIP entries'
        assert all(not name.startswith('/') and '..' not in Path(name).parts for name in names)
        assert all(not re.search(r'(^|/)(node_modules|tests|coverage|materials|docs|dev|\.git)(/|$)|\.test\.|\.map$|\.DS_Store|\.tsx?$', name) for name in names)
        return {name: archive.read(name) for name in names}

coverage_log = run(['bun', 'run', 'test:coverage'], 'unit-tests.log')
run(['bun', 'run', 'lint'], 'lint.log')
if slug == 'r2shot':
    run(['bun', 'run', 'test:e2e'], 'workflow-tests.log')
run(['bun', 'run', 'build' if slug == 'hooky' else 'build:zip'], 'build.log')
built = ROOT / 'dist' / f'{slug}-{version}.zip'
archive = OUT / built.name
files = members(built)
# ZIP metadata can differ after a rebuild; retain the already-tested ZIP when all bytes inside match.
if not archive.exists() or members(archive) != files:
    shutil.copyfile(built, archive)
unpacked = OUT / 'unpacked'
if unpacked.exists():
    shutil.rmtree(unpacked)
for name, data in files.items():
    target = unpacked / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
manifest = json.loads(files['manifest.json'])
assert manifest['version'] == version and manifest['manifest_version'] == 3
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(OUT / 'SHA256SUMS.txt').write_text(f'{digest}  {archive.name}\n')
env['EXTENSION_PATH'] = str(unpacked)
if slug == 'hooky':
    run(['bun', 'run', 'test:e2e'], 'chrome-tests.log')
else:
    run(['node', str(ROOT / 'scripts/materials/test-extension.cjs')], 'chrome-tests.log')
    capture_files = ['r2shot-settings-light.png', 'r2shot-popup-light.png', 'r2shot-result-dark.png', 'captured-visible.jpg', 'captured-full-page.jpg']
    for name in capture_files:
        shutil.copyfile(OUT / 'verification' / name, SOURCE / 'captures' / name)
    provenance = dict(version=version, package_sha256=digest, source='Actual installed ZIP in Chrome; synthetic R2 responses. See verification/chrome-extension.json.', files={name: hashlib.sha256((SOURCE / 'captures' / name).read_bytes()).hexdigest() for name in capture_files})
    (SOURCE / 'captures/provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')


texts = {
    'name.txt': copy['name'], 'short-description.txt': copy['short'],
    'description-en.txt': copy['description'], 'release-notes.txt': copy['release'],
    'single-purpose.txt': copy['purpose'], 'permission-justifications.txt': copy['permissions'],
    'data-use.txt': copy['data'], 'privacy-policy-url.txt': f'https://github.com/nocoo/{slug}/blob/main/PRIVACY.md',
    'support-url.txt': f'https://github.com/nocoo/{slug}/issues',
}
assert len(copy['short']) <= 132 and len(copy['description']) <= 16000
for name, text in texts.items():
    (OUT / 'store/text' / name).write_text(text.strip() + '\n')
listing = dict(name=copy['name'], version=version, language='en', short_description=copy['short'], short_description_characters=len(copy['short']), description=copy['description'], store_url=copy['store_url'], single_purpose=copy['purpose'], privacy_policy_url=texts['privacy-policy-url.txt'], category_suggestion='Productivity')
(OUT / 'store/text/listing.json').write_text(json.dumps(listing, ensure_ascii=False, indent=2) + '\n')
shutil.copyfile(ROOT / 'PRIVACY.md', OUT / 'store/text/privacy-policy.md')
icon_path = 'src/icons/icon128.png' if slug == 'hooky' else 'icons/icon128.png'
(OUT / 'store/icon-128.png').write_bytes(files[icon_path])
(ROOT / 'assets/description-en.txt').write_text(copy['description'])

for script in ['build-preview.cjs', 'render-artwork.cjs', 'build-site.cjs']:
    run(['node', str(ROOT / 'scripts/materials' / script)])
artwork = json.loads((OUT / 'artwork-manifest.json').read_text())
for item in artwork:
    if item['kind'] == 'screenshots':
        legacy = f'{slug}-screenshot-1280x800-{item["variant"]:02d}.png'
    elif item['kind'] == 'banners':
        legacy = (f'{slug}-banner-440x280.png' if slug == 'hooky' else 'r2shot_banner_440x280.png') if item['variant'] == 1 else f'{slug}-banner-440x280-{item["variant"]:02d}.png'
    else:
        continue
    shutil.copyfile(OUT / item['file'], ROOT / 'assets' / legacy)

count = int(re.search(r'Tests\s+(\d+) passed', coverage_log)[1])
report = {
    'version': version, 'package_file': archive.name, 'package_sha256': digest,
    'package_bytes': archive.stat().st_size, 'javascript_bytes': sum(len(data) for name, data in files.items() if name.endswith('.js')),
    'unit_tests_passed': count, 'coverage_gates': 'passed; existing 95% thresholds unchanged',
    'lint': 'passed', 'repository_e2e': 'passed', 'production_chrome': 'passed against extracted ZIP', 'build': 'passed',
    'minimum_chrome': manifest['minimum_chrome_version'],
    'store_icon_matches_package': files[icon_path] == (OUT / 'store/icon-128.png').read_bytes(),
    'runtime_sha256': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())},
    'manual_acceptance': 'pending',
    'network_boundary': 'Local HTTP receiver; isolated Chrome profile.' if slug == 'hooky' else 'Real Chrome capture, stitching and signing against the extracted ZIP; R2 HTTP responses intercepted with synthetic credentials. A live bucket/CDN still needs manual testing.',
}
(OUT / 'verification/build.json').write_text(json.dumps(report, indent=2) + '\n')

manual = '''1. Configure a receiving webhook you control, create a template with page URL/title/selection, and send from an ordinary page. Confirm the received values.
2. Edit a popup value before sending. Confirm your exact text arrives, including whitespace or literal `{{...}}` when used.
3. Try one matching Quick Send rule and one non-matching page, then send from the right-click menu.
4. Reopen settings and Chrome to confirm saved templates/rules. Check light/dark/system themes and one failure response.
''' if slug == 'hooky' else '''1. Enter your own R2 endpoint, bucket, scoped credentials, and working public domain. Test Connection and save.
2. Capture the visible area on an ordinary page. Click Copy URL and open that link to confirm the actual image is publicly accessible.
3. Capture a longer page with Full Page, keeping the tab active. Check image completeness, height limit, and restored scroll position.
4. Reopen settings and Chrome to confirm configuration. Check quality, themes, clipboard access, and an invalid-credentials failure.
'''
(OUT / 'TESTING.md').write_text(f'''# {copy['name']} {version} — Manual acceptance

Status: **ready for your test; manual acceptance pending**.

Use [{archive.name}]({archive.name}) or the generated `unpacked/` directory. In Chrome, open `chrome://extensions/`, enable Developer mode, and choose Load unpacked. The ZIP is the submitted artifact; `unpacked/` is its exact local extraction and is not checked into Git. A fresh clone can extract the ZIP or run `bun run materials`.

Minimum Chrome: {manifest['minimum_chrome_version']}. The interactive HTML uses demo data; test real requests and captures in the installed extension.

{manual}
Automated checks: {count} unit tests, the existing coverage gates, lint, repository E2E/workflow tests, and the production build passed. See [verification/build.json](verification/build.json) and its logs. Native clipboard interaction and real receiving services remain part of manual acceptance. R2 HTTP responses in the Chrome checks were simulated; no live R2 bucket or public CDN was used.

When reporting a result, include the Chrome version, tested ZIP SHA-256, reproduction steps, and expected/actual behavior. Keep credentials out of reports.

SHA-256: `{digest}`
''')
(OUT / 'UPLOAD.md').write_text(f'''# {copy['name']} {version} — Upload guide

1. Complete [manual acceptance](TESTING.md), then upload `{archive.name}` to the existing [Chrome Web Store listing]({copy['store_url']}).
2. Use the English name, short description and full description in `store/text/`. Short description: {len(copy['short'])}/132 characters.
3. Upload the 3 screenshots in `store/screenshots/` in order 01–03: **1280 × 800**, opaque PNG.
4. Choose one small promo in `store/banners/`: **440 × 280**. Variant 01 is recommended; 02 and 03 are alternatives for the same slot.
5. Optionally choose one **1400 × 560** marquee. Retain the original 128 × 128 store icon; an unchanged copy is supplied.
6. Copy the single-purpose, permission, data-use and release-note text from `store/text/`. Verify the public GitHub privacy-policy URL points to this version before submission.
7. `site/index.html` is the English standalone promotional page. Its images, font and styles are embedded; upload the one file to a static host.

Image dimensions: https://developer.chrome.com/docs/webstore/images

Source: this repository's `materials/source/` and `scripts/materials/`. Regenerate with `bun run materials` from this repository. Original identities are preserved. Azure-generated scenery is decorative; the interface captures use synthetic configuration.
''')
(OUT / 'README.md').write_text(f'''# {copy['name']} {version} materials

Open [index.html](index.html) for the gallery, [preview.html](preview.html) for the interactive UI, or [site/index.html](site/index.html) for the English landing page.

- [Install and test](TESTING.md)
- [Store upload guide](UPLOAD.md)
- [ZIP]({archive.name}) · [SHA-256](SHA256SUMS.txt)
- [Build and test record](verification/build.json)
- [Generation workflow](../README.md)
- [Earlier designs](../../docs/design/README.md)

The `approved-family-*` records are immutable evidence from the original joint review. `build.json` and the current logs describe the ZIP in this directory. No release is published by the generation command.
''')

def gallery(kind):
    return '<div class="gallery ' + kind + '">' + ''.join(f'<figure><a href="{a["file"]}" target="_blank"><img src="{a["file"]}" width="{a["width"]}" height="{a["height"]}" alt="{escape(a["description"])}" loading="lazy"></a><figcaption><span>{a["variant"]:02d} / {escape(a["description"])}</span>{"<b>Recommended</b>" if kind != "screenshots" and a["variant"] == 1 else ""}</figcaption></figure>' for a in artwork if a['kind'] == kind) + '</div>'

css = (SOURCE / 'gallery.css').read_text()
page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{copy['name']} {version} — Release materials</title><style>{css}</style></head><body><div class="wrap"><header><a class="wordmark" href="https://hexly.ai">hexly.ai</a><nav><a href="../../docs/design/README.md">Design archive</a><a href="preview.html">Interactive preview ↗</a></nav><span class="edition">{slug.upper()} / RELEASE MATERIALS</span></header><main><section class="intro"><div><h1>{copy['name']}.<br>A fresh chapter.</h1><p>{escape(copy['summary'])}</p><a class="button primary" href="TESTING.md">Ready for your test ↗</a></div><div class="intro-side"><strong>{version}</strong><span>3 screenshots · 3 banners<br>3 optional marquees · 1 standalone site</span></div></section><section class="product {slug}" id="{slug}"><div class="product-head"><div class="product-name"><img src="store/icon-128.png" width="54" height="54" alt=""><div><h2>{copy['name']}</h2><p>{escape(copy['headline'])}</p></div></div><span class="version">{version}</span></div><div class="product-actions"><a class="button primary" href="{archive.name}" download>Download extension ZIP ↓</a><a class="button" href="preview.html" target="_blank">Interactive UI ↗</a><a class="button" href="site/index.html" target="_blank">English single-page site ↗</a><a href="UPLOAD.md">Upload guide</a></div><div class="facts"><span>{report['package_bytes']/1000:.1f} KB ZIP</span><span>{report['javascript_bytes']/1000:.1f} KB native JavaScript</span><span>Chrome {report['minimum_chrome']}+</span><span>Original identity preserved</span></div><div class="group-heading"><h3>Store screenshots</h3><span>1280 × 800 · upload 01–03</span></div>{gallery('screenshots')}<div class="group-heading"><h3>Small promotional images</h3><span>440 × 280 · choose one</span></div>{gallery('banners')}<details class="marquee-detail"><summary>Optional marquee images <span>1400 × 560 · choose one</span></summary>{gallery('marquee')}</details><details class="listing"><summary>English listing copy <span>Ready to paste</span></summary><div class="listing-content"><div class="short"><h4>Short description <small>{len(copy['short'])} / 132 characters</small></h4><p>{escape(copy['short'])}</p><a href="store/text/short-description.txt">Open text ↗</a></div><div class="copy-heading"><label for="listing-copy">Full description</label><button type="button" data-copy="listing-copy">Copy description</button></div><textarea id="listing-copy" readonly rows="14">{escape(copy['description'])}</textarea><p class="copy-status" id="listing-copy-status" role="status"></p><div class="text-links"><a href="store/text/release-notes.txt">Release notes</a><a href="store/text/single-purpose.txt">Single purpose</a><a href="store/text/permission-justifications.txt">Permissions</a><a href="store/text/data-use.txt">Data use</a><a href="store/text/privacy-policy.md">Privacy policy</a></div></div></details></section><section class="verification"><h2>Checked, packaged, ready to test.</h2><div class="test-counts"><div><strong>{count}</strong><small>unit tests passed</small></div><div><strong>95%</strong><small>existing coverage gates retained</small></div><div><strong>{version}</strong><small>manifest and package versions</small></div></div><p>Repository tests, lint and the production build passed. The ZIP contains only extension runtime files. Manual acceptance is pending; use the testing guide with your configured receiving service.</p><p>{escape(report['network_boundary'])}</p><div class="evidence"><a href="TESTING.md">Manual test guide</a><a href="verification/build.json">Build and test record</a><a href="SHA256SUMS.txt">Package checksum</a><a href="../README.md">Reproduction & source files</a><a href="../../docs/design/2.0.0/preview.html">Approved family preview</a><a href="../../docs/design/2026-09-14-concepts/index.html">Initial concepts</a></div></section></main><footer><span>{copy['name']} · a product of hexly.ai</span><span>Original logo · Native JavaScript · English submission materials</span></footer></div><script>document.addEventListener('click',async event=>{{const button=event.target.closest('[data-copy]');if(!button)return;const field=document.getElementById(button.dataset.copy),status=document.getElementById(button.dataset.copy+'-status');try{{await navigator.clipboard.writeText(field.value);status.textContent='Description copied.'}}catch{{field.focus();field.select();status.textContent='Select and copy the text above.'}}}});</script><!-- Embedded Space Grotesk font license:
{(SOURCE / 'brand/space-grotesk-ofl.txt').read_text().replace('-->', '')}
--></body></html>'''
(OUT / 'index.html').write_text(page)
run(['node', str(ROOT / 'scripts/materials/check.cjs')])
print(f'Ready for manual testing: materials/{version}/{archive.name}\nSHA-256: {digest}', flush=True)
