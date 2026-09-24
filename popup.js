const Utils = globalThis.SmartPageExtractorUtils;

const MESSAGE_START_JOB = "smart-page-extractor.start-job";
const JOB_STORAGE_KEY = "smartPageExtractorLastJob";

document.addEventListener("DOMContentLoaded", () => {
  const textarea = document.getElementById("userText");
  const baseNameInput = document.getElementById("baseName");
  const serialInput = document.getElementById("serialNumber");
  const folderInput = document.getElementById("downloadFolderPath");
  const destinationPreviewEl = document.getElementById("destinationPreview");
  const extractBtn = document.getElementById("extractBtn");
  const statusEl = document.getElementById("status");
  const versionInfoEl = document.getElementById("versionInfo");
  const manifest = chrome.runtime.getManifest();

  versionInfoEl.textContent = `${manifest.name} v${manifest.version}`;

  chrome.storage.local.get(
    [
      "savedUserTextPageExtractorExtension",
      "baseNameForDownload",
      "nextSerialNumberForDownload",
      "downloadFolderPath",
      JOB_STORAGE_KEY,
    ],
    (result) => {
      if (result.savedUserTextPageExtractorExtension) {
        textarea.value = result.savedUserTextPageExtractorExtension;
      }

      if (result.baseNameForDownload) {
        baseNameInput.value = result.baseNameForDownload;
      }

      folderInput.value = result.downloadFolderPath || "";
      serialInput.value = result.nextSerialNumberForDownload || 1;

      updateDestinationPreview();
      renderJobStatus(result[JOB_STORAGE_KEY]);
    },
  );

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes[JOB_STORAGE_KEY]) {
      renderJobStatus(changes[JOB_STORAGE_KEY].newValue);
    }

    if (changes.nextSerialNumberForDownload?.newValue) {
      serialInput.value = String(changes.nextSerialNumberForDownload.newValue);
      updateDestinationPreview();
    }
  });

  textarea.addEventListener("input", (event) => {
    chrome.storage.local.set({
      savedUserTextPageExtractorExtension: event.target.value,
    });
  });

  baseNameInput.addEventListener("input", (event) => {
    chrome.storage.local.set({
      baseNameForDownload: event.target.value,
    });
    updateDestinationPreview();
  });

  serialInput.addEventListener("input", (event) => {
    const serialResult = Utils.validateSerialNumber(event.target.value);

    if (serialResult.ok) {
      chrome.storage.local.set({
        nextSerialNumberForDownload: serialResult.value,
      });
    }

    updateDestinationPreview();
  });

  folderInput.addEventListener("input", (event) => {
    chrome.storage.local.set({
      downloadFolderPath: event.target.value,
    });
    updateDestinationPreview();
  });

  document.querySelectorAll('input[name="format"]').forEach((input) => {
    input.addEventListener("change", updateDestinationPreview);
  });

  extractBtn.addEventListener("click", async () => {
    const optionsResult = collectOptions();

    if (!optionsResult.ok) {
      setStatus(optionsResult.error, true);
      return;
    }

    extractBtn.disabled = true;
    setStatus("Processing...", false);

    try {
      const response = await chrome.runtime.sendMessage({
        action: MESSAGE_START_JOB,
        options: optionsResult.options,
      });

      if (response?.nextSerialNumber) {
        serialInput.value = String(response.nextSerialNumber);
        updateDestinationPreview();
      }

      if (!response || !response.ok) {
        renderJobStatus(response?.job, response?.error || "Extraction failed.");
        return;
      }

      renderJobStatus(response.job);
    } catch (error) {
      setStatus(`Error: ${formatRuntimeError(error)}`, true);
    } finally {
      extractBtn.disabled = false;
    }
  });

  function collectOptions() {
    const folderResult = Utils.validateDownloadFolderPath(folderInput.value);
    if (!folderResult.ok) {
      return folderResult;
    }

    const serialResult = Utils.validateSerialNumber(serialInput.value);
    if (!serialResult.ok) {
      return serialResult;
    }

    return {
      ok: true,
      options: {
        baseName: baseNameInput.value.trim(),
        downloadFolderPath: folderResult.value,
        format: document.querySelector('input[name="format"]:checked').value,
        scope: document.querySelector('input[name="scope"]:checked').value,
        serialNumber: serialResult.value,
        target: document.querySelector('input[name="target"]:checked').value,
        userText: textarea.value,
      },
    };
  }

  function updateDestinationPreview() {
    const folderResult = Utils.validateDownloadFolderPath(folderInput.value);
    const serialResult = Utils.validateSerialNumber(serialInput.value);
    const format = document.querySelector('input[name="format"]:checked').value;

    destinationPreviewEl.classList.remove("error");

    if (!folderResult.ok) {
      destinationPreviewEl.textContent = folderResult.error;
      destinationPreviewEl.classList.add("error");
      return;
    }

    if (!serialResult.ok) {
      destinationPreviewEl.textContent = serialResult.error;
      destinationPreviewEl.classList.add("error");
      return;
    }

    const extension = format === "html" ? "html" : "txt";
    const filename = Utils.buildDownloadFilename(
      baseNameInput.value.trim(),
      serialResult.value,
      extension,
    );
    const relativeFilename = Utils.joinDownloadPath(folderResult.value, filename);

    destinationPreviewEl.textContent = `Downloads/${relativeFilename}`;
  }

  function renderJobStatus(job, fallbackError) {
    if (!job) {
      if (fallbackError) {
        setStatus(`Error: ${fallbackError}`, true);
      }
      return;
    }

    if (job.status === "running") {
      const currentTab = job.currentTab ? ` ${job.currentTab}` : "";
      setStatus(
        `Processing ${job.completedCount}/${job.totalCount}.${currentTab}`,
        false,
      );
      return;
    }

    const failureText = buildFailureText(job.failures || []);

    if (job.successCount > 0 && job.failedCount === 0) {
      setStatus(`Done. Downloaded ${job.successCount} file(s).`, false);
      return;
    }

    if (job.successCount > 0 && job.failedCount > 0) {
      setStatus(
        `Done. Downloaded ${job.successCount} file(s). Skipped ${job.failedCount} tab(s).${failureText}`,
        false,
      );
      return;
    }

    setStatus(
      `No files downloaded.${job.failedCount ? ` Skipped ${job.failedCount} tab(s).` : ""}${failureText || (fallbackError ? ` ${fallbackError}` : "")}`,
      true,
    );
  }

  function buildFailureText(failures) {
    if (!failures.length) {
      return "";
    }

    const firstFailures = failures
      .slice(0, 3)
      .map(formatFailure)
      .filter(Boolean);

    const moreCount = failures.length - firstFailures.length;
    const moreText = moreCount > 0 ? `\n- ${moreCount} more skipped tab(s).` : "";

    return firstFailures.length
      ? `\nSkipped tabs:\n- ${firstFailures.join("\n- ")}${moreText}`
      : "";
  }

  function formatFailure(failure) {
    const label = failure.title || failure.url || "Untitled tab";
    const error = failure.error || "Unknown error.";

    return `${label}: ${error}`;
  }

  function setStatus(message, isError) {
    statusEl.textContent = message || "";
    statusEl.classList.toggle("error", Boolean(isError));
  }

  function formatRuntimeError(error) {
    const message = error?.message || String(error);

    if (message.includes("Receiving end does not exist")) {
      return `${message} Reload the unpacked extension from the extensions page, then reopen the popup.`;
    }

    return message;
  }
});
