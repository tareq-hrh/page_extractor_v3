(() => {
  const MESSAGE_EXTRACT_TAB = "smart-page-extractor.extract-tab";
  const LISTENER_KEY = "__smartPageExtractorMessageListener";
  const VERSION_KEY = "__smartPageExtractorContentVersion";
  const CONTENT_VERSION = "phase-1-2026-09-24";

  if (globalThis[LISTENER_KEY]) {
    chrome.runtime.onMessage.removeListener(globalThis[LISTENER_KEY]);
  }

  const messageListener = (message, sender, sendResponse) => {
    if (!message || message.action !== MESSAGE_EXTRACT_TAB) {
      return false;
    }

    (async () => {
      try {
        const result = await extractPage(message.options || {});
        sendResponse(result);
      } catch (error) {
        sendResponse({
          ok: false,
          error: error?.message || String(error),
        });
      }
    })();

    return true;
  };

  globalThis[LISTENER_KEY] = messageListener;
  globalThis[VERSION_KEY] = CONTENT_VERSION;
  chrome.runtime.onMessage.addListener(messageListener);

  async function extractPage(options) {
    const scope = options.scope || "full";
    const format = options.format || "text";
    const userText = options.userText || "";

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
      container = document.body ? document.body.cloneNode(true) : document.createElement("body");
    }

    cleanupContainer(container);

    const title = normalizePageTitle(document.title);
    const pageUrl = location.href;
    const timestamp = buildTimestamp();

    if (format === "html") {
      return {
        ok: true,
        content: buildHtmlDocument({
          bodyHtml: container.innerHTML,
          pageUrl,
          timestamp,
          title,
          userText,
        }),
        extension: "html",
        mimeType: "text/html;charset=utf-8",
        pageTitle: title,
        pageUrl,
      };
    }

    return {
      ok: true,
      content: buildTextDocument({
        bodyText: htmlToFormattedText(container),
        pageUrl,
        timestamp,
        title,
        userText,
      }),
      extension: "txt",
      mimeType: "text/plain;charset=utf-8",
      pageTitle: title,
      pageUrl,
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

    container.querySelectorAll("*").forEach(sanitizeElementAttributes);

    container.querySelectorAll("*").forEach((el) => {
      if (!el.textContent.trim() && el.children.length === 0) {
        el.remove();
      }
    });
  }

  function sanitizeElementAttributes(el) {
    const tag = el.tagName.toLowerCase();
    const originalAttributes = {};

    [...el.attributes].forEach((attr) => {
      originalAttributes[attr.name.toLowerCase()] = attr.value;
      el.removeAttribute(attr.name);
    });

    setTextAttribute(el, "title", originalAttributes.title);
    setTextAttribute(el, "aria-label", originalAttributes["aria-label"]);

    if (tag === "a") {
      const href = normalizeSafeUrl(originalAttributes.href);
      if (href) {
        el.setAttribute("href", href);
      }
    }

    if (tag === "blockquote" || tag === "q") {
      const cite = normalizeSafeUrl(originalAttributes.cite);
      if (cite) {
        el.setAttribute("cite", cite);
      }
    }

    if (tag === "td" || tag === "th") {
      setPositiveIntegerAttribute(el, "colspan", originalAttributes.colspan);
      setPositiveIntegerAttribute(el, "rowspan", originalAttributes.rowspan);
      setScopeAttribute(el, originalAttributes.scope);
    }

    if (tag === "ol") {
      setIntegerAttribute(el, "start", originalAttributes.start);
      setListTypeAttribute(el, originalAttributes.type);
    }

    if (tag === "time") {
      setTextAttribute(el, "datetime", originalAttributes.datetime);
    }
  }

  function setTextAttribute(el, name, value) {
    const cleanValue = String(value || "").trim();
    if (cleanValue) {
      el.setAttribute(name, cleanValue.substring(0, 1000));
    }
  }

  function setPositiveIntegerAttribute(el, name, value) {
    const numberValue = Number(value);
    if (Number.isInteger(numberValue) && numberValue > 0 && numberValue <= 1000) {
      el.setAttribute(name, String(numberValue));
    }
  }

  function setIntegerAttribute(el, name, value) {
    const numberValue = Number(value);
    if (Number.isInteger(numberValue)) {
      el.setAttribute(name, String(numberValue));
    }
  }

  function setListTypeAttribute(el, value) {
    if (/^(1|a|A|i|I)$/.test(String(value || ""))) {
      el.setAttribute("type", value);
    }
  }

  function setScopeAttribute(el, value) {
    if (/^(row|col|rowgroup|colgroup)$/i.test(String(value || ""))) {
      el.setAttribute("scope", value.toLowerCase());
    }
  }

  function normalizeSafeUrl(value) {
    const rawValue = String(value || "").trim();
    if (!rawValue) {
      return "";
    }

    try {
      const url = new URL(rawValue, document.baseURI);
      if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) {
        return url.href;
      }
    } catch {
      // Ignore invalid URLs.
    }

    return "";
  }

  function buildTextDocument({ bodyText, pageUrl, timestamp, title, userText }) {
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

    return header + separator + bodyText;
  }

  function buildHtmlDocument({ bodyHtml, pageUrl, timestamp, title, userText }) {
    return [
      "<!doctype html>",
      "<html>",
      "<head>",
      '<meta charset="utf-8">',
      `<title>${escapeHtml(title || "Extracted page")}</title>`,
      `<base href="${escapeAttribute(pageUrl)}">`,
      "</head>",
      "<body>",
      buildHtmlMetadata({ pageUrl, timestamp, title, userText }),
      bodyHtml,
      "</body>",
      "</html>",
    ].join("");
  }

  function buildHtmlMetadata({ pageUrl, timestamp, title, userText }) {
    const notesHtml = userText.trim()
      ? `<p><strong>Notes:</strong></p><p>${escapeHtml(userText.trim()).replace(/\n/g, "<br>")}</p>`
      : "";

    return [
      '<div class="smart-page-extractor-metadata">',
      notesHtml,
      "<dl>",
      "<dt>Date</dt>",
      `<dd>${escapeHtml(timestamp)}</dd>`,
      "<dt>URL</dt>",
      `<dd><a href="${escapeAttribute(pageUrl)}">${escapeHtml(pageUrl)}</a></dd>`,
      "<dt>Page Title</dt>",
      `<dd>${escapeHtml(title)}</dd>`,
      "</dl>",
      "</div>",
    ].join("");
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

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function normalizePageTitle(value) {
    return String(value || "").trim().substring(0, 200);
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
