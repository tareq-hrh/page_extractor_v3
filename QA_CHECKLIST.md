# Smart Page Extractor QA Checklist

Use this checklist before packaging a release for Chrome Web Store or Microsoft Edge Add-ons.

## Setup

- Reload the unpacked extension after any manifest, permission, service-worker, or icon change.
- Test in Chrome.
- Test in Microsoft Edge.
- Confirm the extension icon appears in the toolbar and extension management page.
- Open the background service-worker console and check for startup errors.

## Popup UI

- Target, scope, and format controls render as segmented toggle buttons.
- Help buttons expand and collapse inline help content without overflowing the popup.
- The top `EXTRACT` button remains the fastest action target.
- Clicking `EXTRACT` closes the popup after the background accepts the job.
- Destination preview shows only the final relative path, not a browser folder prefix or hardcoded local path.
- The popup stays compact and does not make the whole popup the primary scroll container.
- Long status/error output scrolls inside the status area.

## Current Tab Extraction

- Text export, full-page scope, empty folder path.
- Text export, full-page scope, `products/20_09_2026`.
- HTML export, full-page scope, `products/20_09_2026`.
- Text export, article scope, empty folder path.
- HTML export, article scope, `products/20_09_2026`.
- Confirm downloaded filenames use `<base>_<serial>.txt` or `<base>_<serial>.html`.
- Confirm the serial number increments only after successful downloads.

## All Tabs In Current Window

- Open at least three regular `https://` pages.
- Export all tabs as text to `products/20_09_2026`.
- Export all tabs as HTML to `products/20_09_2026`.
- Include one restricted tab such as `chrome://extensions` and confirm it is reported as skipped.
- Close the popup after starting a multi-tab job and confirm the job still completes.
- Reopen the popup and confirm final job status is readable.

## Folder Path Validation

These should be accepted:

- Empty folder path.
- `products/20_09_2026`.
- `products/research/page-set-1`.

These should be rejected before downloads start:

- `products\20_09_2026`.
- `/products/20_09_2026`.
- `products/20_09_2026/`.
- `products//20_09_2026`.
- `../products`.
- `products/..`.
- `C:/Users/name/Downloads`.
- `products/20:09:2026`.
- `products/CON`.

## Export Content

- Text output includes notes, date, URL, page title, separator, and body text.
- HTML output includes a leading metadata `div`.
- HTML output preserves safe links as `href`.
- HTML output preserves useful table attributes such as `colspan`, `rowspan`, and `scope`.
- HTML output does not preserve scripts, styles, iframes, SVGs, or event-handler attributes.
- CSS-hidden, inline-hidden, `hidden`, and `aria-hidden="true"` content is omitted from full-page exports.
- Text output keeps headings readable without forcing uppercase.
- Text output includes link URLs when anchor text does not already contain the URL.
- Text output keeps ordered-list numbering, unordered-list bullets, and nested-list indentation.
- Text output renders table rows with tab-separated cells.
- Text output preserves `pre` code blocks with line breaks.
- Compare `fixtures/extraction-quality-sample.html` against `fixtures/extraction-quality-expected-body.txt` for a focused extraction-quality sample.

## Failure Reporting

- Unsupported browser pages are shown as skipped tabs.
- Per-tab skipped details include a title or URL plus the error.
- A full failure shows `No files downloaded`.
- A partial failure shows both downloaded and skipped counts.
- Invalid serial input shows a clear error.

## Regression Sweep

- Reopen popup after browser restart and confirm saved settings are restored.
- Confirm the extension works after disabling and re-enabling it.
- Confirm no unexpected files are written outside the configured Downloads subfolder.
