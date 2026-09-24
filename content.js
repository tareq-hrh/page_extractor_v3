(() => {
  const MESSAGE_EXTRACT_TAB = "smart-page-extractor.extract-tab";
  const LISTENER_KEY = "__smartPageExtractorMessageListener";
  const VERSION_KEY = "__smartPageExtractorContentVersion";
  const CONTENT_VERSION = "phase-3-2026-09-24";
  const REMOVED_TAG_NAMES = new Set([
    "canvas",
    "iframe",
    "img",
    "link",
    "noscript",
    "script",
    "style",
    "svg",
    "template",
  ]);

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
      container = cloneVisibleBody();
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
    removeUnwantedElements(container);
    removeInlineHiddenElements(container);

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

  function cloneVisibleBody() {
    if (!document.body) {
      return document.createElement("body");
    }

    const clone = document.body.cloneNode(false);

    document.body.childNodes.forEach((child) => {
      const childClone = cloneVisibleNode(child);
      if (childClone) {
        clone.appendChild(childClone);
      }
    });

    return clone;
  }

  function cloneVisibleNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.textContent || "");
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    if (shouldRemoveLiveElement(node)) {
      return null;
    }

    const clone = node.cloneNode(false);

    node.childNodes.forEach((child) => {
      const childClone = cloneVisibleNode(child);
      if (childClone) {
        clone.appendChild(childClone);
      }
    });

    return clone;
  }

  function shouldRemoveLiveElement(el) {
    const tag = el.tagName.toLowerCase();

    if (REMOVED_TAG_NAMES.has(tag)) {
      return true;
    }

    if (isElementHiddenByAttributes(el)) {
      return true;
    }

    try {
      const style = window.getComputedStyle(el);
      return (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0
      );
    } catch {
      return false;
    }
  }

  function removeUnwantedElements(container) {
    container.querySelectorAll([...REMOVED_TAG_NAMES].join(",")).forEach((el) => {
      el.remove();
    });
  }

  function removeInlineHiddenElements(container) {
    container.querySelectorAll("*").forEach((el) => {
      if (isElementHiddenByAttributes(el)) {
        el.remove();
      }
    });
  }

  function isElementHiddenByAttributes(el) {
    if (el.hidden || el.getAttribute("aria-hidden") === "true") {
      return true;
    }

    if (el.tagName.toLowerCase() === "input" && el.type === "hidden") {
      return true;
    }

    const inlineStyle = String(el.getAttribute("style") || "").toLowerCase();

    return (
      /(?:^|;)\s*display\s*:\s*none\s*(?:;|$)/.test(inlineStyle) ||
      /(?:^|;)\s*visibility\s*:\s*hidden\s*(?:;|$)/.test(inlineStyle)
    );
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
    setEnumAttribute(el, "dir", originalAttributes.dir, ["ltr", "rtl", "auto"]);
    setLanguageAttribute(el, originalAttributes.lang);

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
      setTokenListAttribute(el, "headers", originalAttributes.headers);
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

  function setEnumAttribute(el, name, value, allowedValues) {
    const cleanValue = String(value || "").trim().toLowerCase();
    if (allowedValues.includes(cleanValue)) {
      el.setAttribute(name, cleanValue);
    }
  }

  function setLanguageAttribute(el, value) {
    const cleanValue = String(value || "").trim();
    if (/^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8})*$/.test(cleanValue)) {
      el.setAttribute("lang", cleanValue);
    }
  }

  function setTokenListAttribute(el, name, value) {
    const cleanValue = String(value || "")
      .split(/\s+/)
      .filter((token) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(token))
      .join(" ");

    if (cleanValue) {
      el.setAttribute(name, cleanValue);
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
    const listStack = [];

    function walk(node, context = {}) {
      if (!node) return;

      if (node.nodeType === Node.TEXT_NODE) {
        appendInlineText(node.textContent);
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const tag = node.tagName.toLowerCase();

      if (tag === "br") {
        ensureNewlines(1);
        return;
      }

      if (tag === "hr") {
        ensureNewlines(2);
        output += "---";
        ensureNewlines(2);
        return;
      }

      if (tag === "pre") {
        appendPreformattedBlock(node.textContent);
        return;
      }

      if (tag === "table") {
        appendTable(node);
        return;
      }

      if (tag === "a") {
        appendLink(node, context);
        return;
      }

      if (/^h[1-6]$/.test(tag)) {
        ensureNewlines(2);
        walkChildren(node, context);
        ensureNewlines(2);
        return;
      }

      if (tag === "ul" || tag === "ol") {
        ensureNewlines(context.inListItem ? 1 : 2);
        listStack.push({
          ordered: tag === "ol",
          next: getOrderedListStart(node),
        });
        walkChildren(node, context);
        listStack.pop();
        ensureNewlines(context.inListItem ? 1 : 2);
        return;
      }

      if (tag === "li") {
        appendListItem(node, context);
        return;
      }

      if (tag === "blockquote") {
        ensureNewlines(2);
        walkChildren(node, context);
        ensureNewlines(2);
        return;
      }

      if (isBlockElement(tag)) {
        if (context.inListItem) {
          walkChildren(node, context);
          ensureNewlines(1);
          return;
        }

        ensureNewlines(2);
        walkChildren(node, context);
        ensureNewlines(2);
        return;
      }

      walkChildren(node, context);
    }

    walk(root);

    return output
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    function walkChildren(node, context) {
      node.childNodes.forEach((child) => walk(child, context));
    }

    function appendInlineText(value) {
      const normalized = String(value || "").replace(/\s+/g, " ");

      if (!normalized.trim()) {
        if (output && !/[\s\n]$/.test(output)) {
          output += " ";
        }
        return;
      }

      const text = normalized.trim();
      const previousChar = output.slice(-1);

      if (
        output &&
        !/[\s\n([{/"']/.test(previousChar) &&
        !/^[,.;:!?)]/.test(text)
      ) {
        output += " ";
      }

      output += text;
    }

    function appendLink(node, context) {
      const startIndex = output.length;
      walkChildren(node, context);

      const linkText = output.slice(startIndex).trim();
      const href = node.getAttribute("href");

      if (!href) {
        return;
      }

      if (!linkText) {
        appendInlineText(href);
        return;
      }

      if (normalizeComparableText(linkText) !== normalizeComparableText(href)) {
        output += ` [${href}]`;
      }
    }

    function appendListItem(node, context) {
      ensureNewlines(1);

      const stack = listStack[listStack.length - 1];
      const indent = "  ".repeat(Math.max(0, listStack.length - 1));
      const marker = stack?.ordered ? `${stack.next++}. ` : "- ";

      output += indent + marker;
      walkChildren(node, { ...context, inListItem: true });
      output = output.replace(/[ \t\n]+$/g, "");
      ensureNewlines(1);
    }

    function appendPreformattedBlock(value) {
      const text = String(value || "")
        .replace(/\r\n?/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      if (!text) {
        return;
      }

      ensureNewlines(2);
      output += text;
      ensureNewlines(2);
    }

    function appendTable(table) {
      const caption = Array.from(table.children).find(
        (child) => child.tagName.toLowerCase() === "caption",
      );
      const rows = Array.from(table.querySelectorAll("tr"))
        .map(formatTableRow)
        .filter(Boolean);

      if (!caption && rows.length === 0) {
        return;
      }

      ensureNewlines(2);

      if (caption) {
        appendInlineText(caption.textContent);
        ensureNewlines(1);
      }

      if (rows.length > 0) {
        output += rows.join("\n");
      }

      ensureNewlines(2);
    }

    function formatTableRow(row) {
      const cells = Array.from(row.children).filter((cell) =>
        ["td", "th"].includes(cell.tagName.toLowerCase()),
      );

      return cells.map((cell) => normalizeCellText(cell.textContent)).join("\t");
    }

    function normalizeCellText(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function ensureNewlines(count) {
      output = output.replace(/[ \t]+$/g, "");

      const newlineMatch = output.match(/\n*$/);
      const existingCount = newlineMatch ? newlineMatch[0].length : 0;

      if (existingCount < count) {
        output += "\n".repeat(count - existingCount);
      }
    }

    function getOrderedListStart(node) {
      const start = Number(node.getAttribute("start") || 1);
      return Number.isInteger(start) ? start : 1;
    }

    function normalizeComparableText(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function isBlockElement(tag) {
      return [
        "address",
        "article",
        "aside",
        "details",
        "dialog",
        "div",
        "fieldset",
        "figcaption",
        "figure",
        "footer",
        "form",
        "header",
        "main",
        "nav",
        "p",
        "section",
        "summary",
      ].includes(tag);
    }
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
