(function initSmartPageExtractorShared(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
    return;
  }

  root.SmartPageExtractorUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createApi() {
  const INVALID_FOLDER_SEGMENT_CHARS = /[<>:"\\|?*\x00-\x1F]/;
  const INVALID_FILENAME_CHARS = /[\\/:*?"<>|\x00-\x1F]/g;
  const RESERVED_WINDOWS_NAMES = new Set([
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM2",
    "COM3",
    "COM4",
    "COM5",
    "COM6",
    "COM7",
    "COM8",
    "COM9",
    "LPT1",
    "LPT2",
    "LPT3",
    "LPT4",
    "LPT5",
    "LPT6",
    "LPT7",
    "LPT8",
    "LPT9",
  ]);

  function validateDownloadFolderPath(value) {
    const rawValue = String(value || "");

    if (rawValue === "") {
      return { ok: true, value: "" };
    }

    if (rawValue !== rawValue.trim()) {
      return {
        ok: false,
        error: "Folder path cannot start or end with whitespace.",
      };
    }

    if (rawValue.includes("\\")) {
      return {
        ok: false,
        error: "Use / as the folder separator. Backslashes are not allowed.",
      };
    }

    if (rawValue.startsWith("/") || rawValue.endsWith("/")) {
      return {
        ok: false,
        error: "Folder path cannot start or end with /.",
      };
    }

    if (/^[a-zA-Z]:/.test(rawValue)) {
      return {
        ok: false,
        error: "Folder path must be relative to Downloads, not an absolute path.",
      };
    }

    const segments = rawValue.split("/");

    for (const segment of segments) {
      const result = validateFolderSegment(segment);
      if (!result.ok) {
        return result;
      }
    }

    return { ok: true, value: rawValue };
  }

  function validateFolderSegment(segment) {
    if (segment === "") {
      return {
        ok: false,
        error: "Folder path cannot contain empty segments.",
      };
    }

    if (segment === "." || segment === "..") {
      return {
        ok: false,
        error: "Folder path cannot contain . or ..",
      };
    }

    if (segment !== segment.trim()) {
      return {
        ok: false,
        error: "Folder names cannot start or end with whitespace.",
      };
    }

    if (segment.endsWith(".")) {
      return {
        ok: false,
        error: "Folder names cannot end with a period.",
      };
    }

    if (INVALID_FOLDER_SEGMENT_CHARS.test(segment)) {
      return {
        ok: false,
        error: "Folder path contains characters that are not allowed.",
      };
    }

    const reservedCandidate = segment.split(".")[0].toUpperCase();
    if (RESERVED_WINDOWS_NAMES.has(reservedCandidate)) {
      return {
        ok: false,
        error: `"${segment}" is a reserved Windows folder name.`,
      };
    }

    return { ok: true, value: segment };
  }

  function joinDownloadPath(folderPath, filename) {
    const folderResult = validateDownloadFolderPath(folderPath);
    if (!folderResult.ok) {
      throw new Error(folderResult.error);
    }

    const safeFilename = sanitizeFilename(filename || "file");
    return folderResult.value ? `${folderResult.value}/${safeFilename}` : safeFilename;
  }

  function sanitizeFilename(value) {
    const sanitized = String(value || "")
      .replace(INVALID_FILENAME_CHARS, "")
      .trim()
      .replace(/[. ]+$/g, "");

    if (!sanitized) {
      return "file";
    }

    const nameWithoutExtension = sanitized.split(".")[0].toUpperCase();
    if (RESERVED_WINDOWS_NAMES.has(nameWithoutExtension)) {
      return `file-${sanitized}`;
    }

    return sanitized;
  }

  function sanitizeFilenameBase(value) {
    const sanitized = sanitizeFilename(value || "file");
    const withoutTrailingExtension = sanitized.replace(/\.(txt|html)$/i, "");
    return withoutTrailingExtension || "file";
  }

  function validateSerialNumber(value) {
    const numberValue = Number(value);

    if (!Number.isInteger(numberValue) || numberValue < 1) {
      return {
        ok: false,
        error: "Serial number must be a whole number greater than 0.",
      };
    }

    return { ok: true, value: numberValue };
  }

  function buildDownloadFilename(baseName, serialNumber, extension) {
    const serialResult = validateSerialNumber(serialNumber);
    if (!serialResult.ok) {
      throw new Error(serialResult.error);
    }

    const normalizedExtension = String(extension || "")
      .replace(/^\./, "")
      .toLowerCase();

    if (!/^(txt|html)$/.test(normalizedExtension)) {
      throw new Error("Unsupported download extension.");
    }

    return `${sanitizeFilenameBase(baseName)}_${serialResult.value}.${normalizedExtension}`;
  }

  function isSupportedTabUrl(url) {
    if (!url) {
      return false;
    }

    return /^(https?:|file:)/i.test(String(url));
  }

  return {
    buildDownloadFilename,
    isSupportedTabUrl,
    joinDownloadPath,
    sanitizeFilename,
    sanitizeFilenameBase,
    validateDownloadFolderPath,
    validateSerialNumber,
  };
});
