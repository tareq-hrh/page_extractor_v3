# Release Checklist

Use this checklist before uploading a package to Chrome Web Store or Microsoft Edge Add-ons.

## Pre-Release

- Run `npm test`.
- Run JavaScript syntax checks:
  - `node --check shared.js`
  - `node --check background.js`
  - `node --check content.js`
  - `node --check popup.js`
  - `node --check offscreen.js`
- Complete `QA_CHECKLIST.md` in Chrome.
- Complete `QA_CHECKLIST.md` in Microsoft Edge.
- Confirm `manifest.json` has the correct `name`, `short_name`, `version`, `description`, `icons`, permissions, host permissions, action, and service worker.
- Confirm the manifest version is increased before uploading a new public release.
- Confirm store listing copy explains that all-window extraction requires broad site access.
- Confirm privacy disclosure says extracted content is processed locally and not sent to a remote server.
- Confirm third-party notices are accurate.

## Package

Create the ZIP:

```powershell
npm run package
```

Expected output:

```text
dist/smart-page-extractor-v<manifest-version>.zip
```

The ZIP must contain `manifest.json` at the root of the archive.

## Chrome Web Store Notes

Chrome's preparation guidance says to test the extension locally before upload, review manifest metadata, include icons, and submit a ZIP that places `manifest.json` at the archive root.

Relevant docs:

- https://developer.chrome.com/docs/webstore/prepare
- https://developer.chrome.com/docs/extensions/develop/ui/configure-icons
- https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings

## Microsoft Edge Add-ons Notes

Microsoft Edge requires a ZIP extension package containing the manifest and required extension files. Partner Center also asks for privacy information, permission justifications, data-use certification, listing details, and certification testing notes.

Relevant docs:

- https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension
- https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support

## Upload Notes

- Upload the same runtime package to Chrome and Edge unless store-specific assets or listing copy require a separate package.
- Keep release ZIP files in `dist/`.
- Do not include test files, source notes, git metadata, or development-only docs in the ZIP.
- After upload, record the submitted ZIP name, manifest version, browser store, date, and review result.
