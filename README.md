# Smart Page Extractor

Smart Page Extractor is a Manifest V3 browser extension for Chrome and Microsoft Edge. It extracts readable page content from the current tab or every tab in the current browser window, then downloads the result as clean text or HTML.

## Features

- Extract the current tab or all tabs in the current window.
- Choose full-page DOM extraction or Readability article extraction.
- Export as `.txt` or `.html`.
- Add notes/header text to exported files.
- Save files under a relative folder inside the browser's Downloads directory, such as `products/20_09_2026`.
- Keep the next serial number in local extension storage.

## Development Install

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select this repository folder.
5. After editing `manifest.json`, `background.js`, or extension permissions, reload the unpacked extension from the extensions page before testing.

## Local Checks

Run helper tests:

```powershell
npm test
```

Run JavaScript syntax checks:

```powershell
node --check shared.js
node --check background.js
node --check content.js
node --check popup.js
node --check offscreen.js
```

## Package

Create a store-ready ZIP package:

```powershell
npm run package
```

The package is written to `dist/`. The ZIP contains only extension runtime files, with `manifest.json` at the archive root.

## Permissions

- `activeTab`: temporary access to the active tab after the user invokes the extension.
- `scripting`: injects the extraction scripts into selected tabs.
- `storage`: stores local settings such as notes, base filename, folder path, and next serial number.
- `tabs`: queries current-window tabs for the all-window extraction workflow.
- `downloads`: saves generated files to the user's configured Downloads directory and relative subfolders.
- `offscreen`: creates Blob object URLs from generated content in Manifest V3.
- `<all_urls>` host permission: required because all-window extraction must be able to inject into ordinary web pages across the current browser window.

The extension does not send extracted page content to a remote server. Extraction and file generation happen locally in the browser.

## Release Support Files

- `QA_CHECKLIST.md`: manual verification matrix.
- `RELEASE_CHECKLIST.md`: Chrome Web Store and Microsoft Edge Add-ons release checklist.
- `THIRD_PARTY_NOTICES.md`: vendored dependency notice.
