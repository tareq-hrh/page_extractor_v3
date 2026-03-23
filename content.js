(() => {
  if (globalThis.__smartPageExtractorInstalled) {
    return;
  }
  globalThis.__smartPageExtractorInstalled = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.action !== "extract-page") {
      return;
    }

    (async () => {
      try {
        const result = await extractAndDownload(message.options || {});
        sendResponse(result);
      } catch (error) {
        sendResponse({
          ok: false,
          error: error?.message || String(error),
        });
      }
    })();

    return true;
  });

  async function extractAndDownload(options) {
    const scope = options.scope || "full";
    const format = options.format || "text";
    const userText = options.userText || "";
    const baseName = options.baseName || "file";
    const serialNumber = Number(options.serialNumber || 1);

    let container;

    if (scope === "article") {
      if (typeof Readability === "undefined") {
        throw new Error("Readability.js is not loaded.");
      }

      const article = new Readability(document.cloneNode(true)).parse();

      if (!article) {
        throw new Error("Could not extract article content.");
      }

      container = document.createElement("div");
      container.innerHTML = article.content;
    } else {
      container = document.body.cloneNode(true);
    }

    cleanupContainer(container);

    const title = sanitizeTitle(document.title);
    const pageUrl = location.href;
    const safeBase = sanitizeFilename(baseName || "file");
    const timestamp = buildTimestamp();

    let content = "";
    let extension = "";

    if (format === "html") {
      content = "<html><body>" + container.innerHTML + "</body></html>";
      extension = "html";
    } else {
      const bodyText = htmlToFormattedText(container);

      const headerParts = [];

      if (userText.trim() !== "") {
        headerParts.push(userText.trim());
      }

      headerParts.push(`Date: ${timestamp}`);
      headerParts.push(`URL: ${pageUrl}`);
      headerParts.push(`Page Title: ${title}`);

      const header = headerParts.join("\n\n");
      const separator =
        "\n\nSEPARATOR_____________________________________________________________\n\n";

      content = header + separator + bodyText;
      extension = "txt";
    }

    const filename = `${safeBase}_${serialNumber}.${extension}`;
    triggerDownload(content, filename, format);

    return {
      ok: true,
      filename,
    };
  }

  function cleanupContainer(container) {
    container
      .querySelectorAll(
        "img, script, style, link, svg, iframe, noscript, template",
      )
      .forEach((el) => el.remove());

    container.querySelectorAll("*").forEach((el) => {
      let shouldRemove = false;

      try {
        const style = window.getComputedStyle(el);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          el.hidden
        ) {
          shouldRemove = true;
        }
      } catch {
        // Ignore computed-style failures on unusual nodes.
      }

      if (shouldRemove) {
        el.remove();
      }
    });

    container.querySelectorAll("div, span").forEach((el) => {
      const text = el.textContent.trim();
      if (text.startsWith("{") && text.endsWith("}") && text.length > 200) {
        el.remove();
      }
    });

    container.querySelectorAll("*").forEach((el) => {
      [...el.attributes].forEach((attr) => el.removeAttribute(attr.name));
    });

    container.querySelectorAll("*").forEach((el) => {
      if (!el.textContent.trim() && el.children.length === 0) {
        el.remove();
      }
    });
  }

  function htmlToFormattedText(root) {
    let output = "";

    function walk(node) {
      if (!node) return;

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.replace(/\s+/g, " ");
        output += text;
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const tag = node.tagName.toLowerCase();

      if (tag === "br") {
        output += "\n";
        return;
      }

      if (/^h[1-6]$/.test(tag)) {
        output += "\n\n" + node.innerText.trim().toUpperCase() + "\n\n";
        return;
      }

      if (tag === "li") {
        output += "- ";
        node.childNodes.forEach(walk);
        output += "\n";
        return;
      }

      if (["p", "div", "section", "article", "main"].includes(tag)) {
        node.childNodes.forEach(walk);
        output += "\n\n";
        return;
      }

      node.childNodes.forEach(walk);
    }

    walk(root);

    return output
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
  }

  function triggerDownload(content, filename, format) {
    const mimeType =
      format === "html"
        ? "text/html;charset=utf-8"
        : "text/plain;charset=utf-8";

    const blob = new Blob(["\uFEFF" + content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";

    document.documentElement.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function sanitizeFilename(value) {
    return (
      String(value)
        .replace(/[\\/:*?"<>|]/g, "")
        .trim() || "file"
    );
  }

  function sanitizeTitle(value) {
    return String(value || "")
      .replace(/[\\/:*?"<>|]/g, "")
      .trim()
      .substring(0, 80);
  }

  function buildTimestamp() {
    const now = new Date();

    return (
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0") +
      " " +
      String(now.getHours()).padStart(2, "0") +
      ":" +
      String(now.getMinutes()).padStart(2, "0")
    );
  }
})();
