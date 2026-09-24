const managedObjectUrls = new Set();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "offscreen") {
    return false;
  }

  if (message.action === "create-object-url") {
    try {
      const blob = new Blob(["\uFEFF", String(message.content || "")], {
        type: message.mimeType || "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);

      managedObjectUrls.add(url);

      setTimeout(() => {
        revokeObjectUrl(url);
      }, 120000);

      sendResponse({
        ok: true,
        url,
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error?.message || String(error),
      });
    }

    return true;
  }

  if (message.action === "revoke-object-url") {
    revokeObjectUrl(message.url);
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

function revokeObjectUrl(url) {
  if (!url || !managedObjectUrls.has(url)) {
    return;
  }

  URL.revokeObjectURL(url);
  managedObjectUrls.delete(url);
}
