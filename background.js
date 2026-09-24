importScripts("shared.js");

const Utils = globalThis.SmartPageExtractorUtils;

const MESSAGE_START_JOB = "smart-page-extractor.start-job";
const MESSAGE_GET_LATEST_JOB = "smart-page-extractor.get-latest-job";
const MESSAGE_EXTRACT_TAB = "smart-page-extractor.extract-tab";
const JOB_STORAGE_KEY = "smartPageExtractorLastJob";
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
const DOWNLOAD_TIMEOUT_MS = 120000;

let currentJobPromise = null;
let creatingOffscreenDocument = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target === "offscreen") {
    return false;
  }

  if (message.action === MESSAGE_START_JOB) {
    try {
      sendResponse(startExtractionJob(message.options || {}));
    } catch (error) {
      sendResponse({
        ok: false,
        error: error?.message || String(error),
      });
    }

    return false;
  }

  if (message.action === MESSAGE_GET_LATEST_JOB) {
    (async () => {
      const result = await chrome.storage.local.get(JOB_STORAGE_KEY);
      sendResponse({
        ok: true,
        job: result[JOB_STORAGE_KEY] || null,
      });
    })();

    return true;
  }

  return false;
});

function startExtractionJob(rawOptions) {
  if (currentJobPromise) {
    return {
      ok: false,
      error: "Another extraction job is already running.",
    };
  }

  const options = normalizeJobOptions(rawOptions);
  const jobId = buildJobId();

  currentJobPromise = runExtractionJob(options, jobId)
    .catch(async (error) => {
      const errorMessage = error?.message || String(error);
      await persistFailedJob(jobId, options, errorMessage).catch(() => {});

      return {
        ok: false,
        error: errorMessage,
      };
    })
    .finally(() => {
      currentJobPromise = null;
    });

  return {
    jobId,
    ok: true,
    started: true,
  };
}

function normalizeJobOptions(rawOptions) {
  const target = rawOptions.target === "currentWindow" ? "currentWindow" : "currentTab";
  const scope = rawOptions.scope === "article" ? "article" : "full";
  const format = rawOptions.format === "html" ? "html" : "text";
  const serialResult = Utils.validateSerialNumber(rawOptions.serialNumber ?? 1);
  const folderResult = Utils.validateDownloadFolderPath(rawOptions.downloadFolderPath || "");

  if (!serialResult.ok) {
    throw new Error(serialResult.error);
  }

  if (!folderResult.ok) {
    throw new Error(folderResult.error);
  }

  return {
    baseName: String(rawOptions.baseName || "file"),
    downloadFolderPath: folderResult.value,
    format,
    scope,
    serialNumber: serialResult.value,
    target,
    userText: String(rawOptions.userText || ""),
  };
}

async function runExtractionJob(options, jobId) {
  let serialNumber = options.serialNumber;
  const job = {
    completedCount: 0,
    currentTab: "",
    downloadedFiles: [],
    failedCount: 0,
    failures: [],
    id: jobId,
    startedAt: new Date().toISOString(),
    status: "running",
    successCount: 0,
    target: options.target,
    totalCount: 0,
  };

  await persistJob(job);

  const tabs = await getTargetTabs(options.target);
  job.totalCount = tabs.length;
  await persistJob(job);

  for (const tab of tabs) {
    job.currentTab = getTabLabel(tab);
    await persistJob(job);

    const result = await extractAndDownloadTab(tab, options, serialNumber);

    job.completedCount += 1;

    if (result.ok) {
      serialNumber += 1;
      job.successCount += 1;
      job.downloadedFiles.push(result.relativeFilename);
    } else {
      job.failedCount += 1;
      job.failures.push({
        error: result.error,
        title: tab.title || "",
        url: tab.url || "",
      });
    }

    await persistJob(job);
  }

  job.completedAt = new Date().toISOString();
  job.currentTab = "";
  job.nextSerialNumber = serialNumber;
  job.status = job.successCount > 0 ? "completed" : "failed";

  await chrome.storage.local.set({
    nextSerialNumberForDownload: serialNumber,
    [JOB_STORAGE_KEY]: job,
  });

  return {
    ok: job.successCount > 0,
    error: job.successCount > 0 ? undefined : "No files downloaded.",
    job,
    nextSerialNumber: serialNumber,
  };
}

async function persistFailedJob(jobId, options, errorMessage) {
  const job = {
    completedAt: new Date().toISOString(),
    completedCount: 0,
    currentTab: "",
    downloadedFiles: [],
    failedCount: 1,
    failures: [
      {
        error: errorMessage,
        title: "",
        url: "",
      },
    ],
    id: jobId,
    startedAt: new Date().toISOString(),
    status: "failed",
    successCount: 0,
    target: options.target,
    totalCount: 0,
  };

  await persistJob(job);
  return job;
}

async function getTargetTabs(target) {
  const tabs =
    target === "currentWindow"
      ? await chrome.tabs.query({ currentWindow: true })
      : await chrome.tabs.query({ active: true, currentWindow: true });

  return tabs.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

async function extractAndDownloadTab(tab, options, serialNumber) {
  if (tab.id == null) {
    return {
      ok: false,
      error: "Skipped a tab with no tabId.",
    };
  }

  if (!Utils.isSupportedTabUrl(tab.url)) {
    return {
      ok: false,
      error: `Unsupported tab URL: ${tab.url || "unknown URL"}`,
    };
  }

  try {
    await injectExtractionScripts(tab.id, options.scope);

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: MESSAGE_EXTRACT_TAB,
      options: {
        format: options.format,
        scope: options.scope,
        userText: options.userText,
      },
    });

    if (!response || !response.ok) {
      throw new Error(response?.error || "Extraction failed.");
    }

    const filename = Utils.buildDownloadFilename(
      options.baseName,
      serialNumber,
      response.extension,
    );
    const relativeFilename = Utils.joinDownloadPath(options.downloadFolderPath, filename);

    await downloadGeneratedFile({
      content: response.content,
      mimeType: response.mimeType,
      relativeFilename,
    });

    return {
      ok: true,
      relativeFilename,
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || String(error),
    };
  }
}

async function injectExtractionScripts(tabId, scope) {
  if (scope === "article") {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["Readability.js"],
    });
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

async function downloadGeneratedFile({ content, mimeType, relativeFilename }) {
  const url = await createDownloadUrl(content, mimeType);

  try {
    const downloadId = await chrome.downloads.download({
      conflictAction: "uniquify",
      filename: relativeFilename,
      saveAs: false,
      url,
    });

    const outcome = await waitForDownloadTerminal(downloadId, DOWNLOAD_TIMEOUT_MS);

    if (outcome.state === "interrupted") {
      throw new Error(`Download interrupted: ${outcome.error || "unknown error"}`);
    }

    return { downloadId };
  } finally {
    await revokeDownloadUrl(url).catch(() => {});
  }
}

async function createDownloadUrl(content, mimeType) {
  await ensureOffscreenDocument();

  const response = await chrome.runtime.sendMessage({
    target: "offscreen",
    action: "create-object-url",
    content: String(content || ""),
    mimeType: mimeType || "text/plain;charset=utf-8",
  });

  if (!response || !response.ok || !response.url) {
    throw new Error(response?.error || "Could not create download URL.");
  }

  return response.url;
}

async function revokeDownloadUrl(url) {
  if (!url) {
    return;
  }

  await ensureOffscreenDocument();

  await chrome.runtime.sendMessage({
    target: "offscreen",
    action: "revoke-object-url",
    url,
  });
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen) {
    throw new Error("Offscreen documents are not available in this browser.");
  }

  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);

  if ("getContexts" in chrome.runtime) {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl],
    });

    if (existingContexts.length > 0) {
      return;
    }
  } else {
    const existingClients = await clients.matchAll();
    if (existingClients.some((client) => client.url === offscreenUrl)) {
      return;
    }
  }

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      justification: "Create Blob URLs for extracted page downloads.",
      reasons: ["BLOBS"],
      url: OFFSCREEN_DOCUMENT_PATH,
    });
  }

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

function waitForDownloadTerminal(downloadId, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = null;

    const cleanup = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      chrome.downloads.onChanged.removeListener(listener);
      resolve(result);
    };

    const listener = (delta) => {
      if (delta.id !== downloadId) {
        return;
      }

      if (delta.error?.current) {
        cleanup({
          error: delta.error.current,
          state: "interrupted",
        });
        return;
      }

      if (delta.state?.current === "complete") {
        cleanup({ state: "complete" });
        return;
      }

      if (delta.state?.current === "interrupted") {
        cleanup({
          error: "interrupted",
          state: "interrupted",
        });
      }
    };

    chrome.downloads.onChanged.addListener(listener);

    timeoutId = setTimeout(() => {
      cleanup({ state: "unknown" });
    }, timeoutMs);

    chrome.downloads
      .search({ id: downloadId })
      .then((items) => {
        const item = items[0];

        if (!item) {
          return;
        }

        if (item.error) {
          cleanup({
            error: item.error,
            state: "interrupted",
          });
          return;
        }

        if (item.state === "complete" || item.state === "interrupted") {
          cleanup({
            error: item.error,
            state: item.state,
          });
        }
      })
      .catch(() => {});
  });
}

function persistJob(job) {
  return chrome.storage.local.set({
    [JOB_STORAGE_KEY]: job,
  });
}

function getTabLabel(tab) {
  return tab.title || tab.url || `Tab ${tab.id || ""}`.trim();
}

function buildJobId() {
  return `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
