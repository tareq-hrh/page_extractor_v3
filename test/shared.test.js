const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildDownloadFilename,
  isSupportedTabUrl,
  joinDownloadPath,
  sanitizeFilename,
  sanitizeFilenameBase,
  validateDownloadFolderPath,
  validateSerialNumber,
} = require("../shared.js");

test("accepts empty and relative download folder paths", () => {
  assert.deepEqual(validateDownloadFolderPath(""), { ok: true, value: "" });
  assert.deepEqual(validateDownloadFolderPath("products/20_09_2026"), {
    ok: true,
    value: "products/20_09_2026",
  });
});

test("rejects unsafe download folder paths", () => {
  const invalidValues = [
    " products",
    "products ",
    "products\\20_09_2026",
    "/products",
    "products/",
    "products//20_09_2026",
    "../products",
    "products/..",
    "C:/Users/mstrk/Downloads",
    "products/20:09:2026",
    "products/CON",
    "products/CON.txt",
  ];

  for (const value of invalidValues) {
    assert.equal(validateDownloadFolderPath(value).ok, false, value);
  }
});

test("joins folder paths and sanitized filenames", () => {
  assert.equal(joinDownloadPath("", "file_1.txt"), "file_1.txt");
  assert.equal(
    joinDownloadPath("products/20_09_2026", "file_1.txt"),
    "products/20_09_2026/file_1.txt",
  );
  assert.equal(
    joinDownloadPath("products", 'bad:name?.txt'),
    "products/badname.txt",
  );
});

test("sanitizes download filenames and base names", () => {
  assert.equal(sanitizeFilename('bad:name?.txt'), "badname.txt");
  assert.equal(sanitizeFilename("CON.txt"), "file-CON.txt");
  assert.equal(sanitizeFilename("   "), "file");
  assert.equal(sanitizeFilenameBase("report.html"), "report");
});

test("validates serial numbers", () => {
  assert.deepEqual(validateSerialNumber("3"), { ok: true, value: 3 });

  for (const value of ["", "0", "-1", "1.5", "abc"]) {
    assert.equal(validateSerialNumber(value).ok, false, value);
  }
});

test("builds download filenames", () => {
  assert.equal(buildDownloadFilename("products", 7, "txt"), "products_7.txt");
  assert.equal(buildDownloadFilename("products.html", "8", ".html"), "products_8.html");
  assert.throws(() => buildDownloadFilename("products", 1, "pdf"));
});

test("identifies scriptable tab URLs", () => {
  assert.equal(isSupportedTabUrl("https://example.com"), true);
  assert.equal(isSupportedTabUrl("http://example.com"), true);
  assert.equal(isSupportedTabUrl("file:///C:/tmp/page.html"), true);
  assert.equal(isSupportedTabUrl("chrome://extensions"), false);
  assert.equal(isSupportedTabUrl("edge://settings"), false);
  assert.equal(isSupportedTabUrl("about:blank"), false);
});
