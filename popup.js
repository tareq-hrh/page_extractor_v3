document.addEventListener("DOMContentLoaded", () => {
  const textarea = document.getElementById("userText");
  const baseNameInput = document.getElementById("baseName");
  const serialInput = document.getElementById("serialNumber");
  const extractBtn = document.getElementById("extractBtn");
  const statusEl = document.getElementById("status");

  // Load saved text and serial number
  chrome.storage.local.get(
    [
      "savedUserTextPageExtractorExtension",
      "baseNameForDownload",
      "nextSerialNumberForDownload",
    ],
    (result) => {
      if (result.savedUserTextPageExtractorExtension) {
        textarea.value = result.savedUserTextPageExtractorExtension;
      }

      if (result.baseNameForDownload) {
        baseNameInput.value = result.baseNameForDownload;
      }

      serialInput.value = result.nextSerialNumberForDownload || 1;
    },
  );

  // Save notes
  textarea.addEventListener("input", (e) => {
    chrome.storage.local.set({
      savedUserTextPageExtractorExtension: e.target.value,
    });
  });

  // Save base name
  baseNameInput.addEventListener("input", (e) => {
    chrome.storage.local.set({
      baseNameForDownload: e.target.value,
    });
  });

  // Save serial number (user override)
  serialInput.addEventListener("input", (e) => {
    chrome.storage.local.set({
      nextSerialNumberForDownload: Number(e.target.value),
    });
  });

  extractBtn.addEventListener("click", async () => {
    const scope = document.querySelector('input[name="scope"]:checked').value;
    const format = document.querySelector('input[name="format"]:checked').value;
    const target = document.querySelector('input[name="target"]:checked').value;

    const userText = textarea.value;
    const baseName = baseNameInput.value.trim();
    let serialNumber = Number(serialInput.value || 1);

    extractBtn.disabled = true;
    statusEl.textContent = "Processing...";

    try {
      const tabs =
        target === "currentWindow"
          ? (await chrome.tabs.query({ currentWindow: true })).sort(
              (a, b) => (a.index ?? 0) - (b.index ?? 0),
            )
          : await chrome.tabs.query({ active: true, currentWindow: true });

      let successCount = 0;
      const failures = [];

      for (const tab of tabs) {
        if (tab.id == null) {
          failures.push("Skipped a tab with no tabId.");
          continue;
        }

        const result = await extractFromTab(tab.id, {
          scope,
          format,
          userText,
          baseName,
          serialNumber,
        });

        if (result.ok) {
          successCount += 1;
          serialNumber += 1;
        } else {
          failures.push(result.error || `Tab ${tab.id} failed.`);
        }
      }

      chrome.storage.local.set({
        nextSerialNumberForDownload: serialNumber,
      });

      serialInput.value = String(serialNumber);

      if (successCount > 0 && failures.length === 0) {
        statusEl.textContent = `Done. Downloaded ${successCount} file(s).`;
      } else if (successCount > 0 && failures.length > 0) {
        statusEl.textContent = `Done. Downloaded ${successCount} file(s). Skipped ${failures.length} tab(s).`;
      } else {
        statusEl.textContent = `No files downloaded. ${failures.length ? `Skipped ${failures.length} tab(s).` : ""}`;
      }

      if (failures.length > 0) {
        console.warn("Smart Page Extractor skipped tabs:", failures);
      }
    } catch (error) {
      statusEl.textContent = `Error: ${error?.message || String(error)}`;
    } finally {
      extractBtn.disabled = false;
    }
  });
});

async function extractFromTab(tabId, options) {
  try {
    if (options.scope === "article") {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["Readability.js"],
      });
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });

    const response = await chrome.tabs.sendMessage(tabId, {
      action: "extract-page",
      options,
    });

    if (!response || !response.ok) {
      return {
        ok: false,
        error: response?.error || "Extraction failed.",
      };
    }

    return { ok: true, filename: response.filename };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || String(error),
    };
  }
}
