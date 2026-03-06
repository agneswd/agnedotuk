/**
 * test.node.js — Node.js test runner (zero external dependencies)
 *
 * Provides a minimal DOM stub sufficient to load and exercise script.js,
 * then runs the same assertions as test.html.
 *
 * Usage: node test.node.js
 */

"use strict";

// ── Minimal DOM stub ────────────────────────────────────────────────────────

let idMap = {};

function makeElement(tag) {
  const el = {
    tagName: tag.toUpperCase(),
    className: "",
    classList: {
      _set: new Set(),
      contains(c) { return el.className.split(" ").filter(Boolean).includes(c); },
      add(c) { el.className = (el.className + " " + c).trim(); },
    },
    children: [],
    _attrs: {},
    _innerHTML: "",
    _textContent: "",
    get textContent() {
      if (el.children.length === 0) return el._textContent;
      return el.children.map(function (c) { return c.textContent; }).join("");
    },
    set textContent(v) { el._textContent = String(v); el.children = []; },
    get innerHTML() { return el._innerHTML; },
    set innerHTML(v) { el._innerHTML = v; if (v === "") el.children = []; },
    hidden: false,
    style: {},
    setAttribute(k, v) { el._attrs[k] = String(v); },
    getAttribute(k) { return el._attrs[k] !== undefined ? el._attrs[k] : null; },
    appendChild(child) { el.children.push(child); return child; },
    querySelectorAll(sel) { return collectByClass(el, classFromSel(sel)); },
    querySelector(sel) { return collectByClass(el, classFromSel(sel))[0] || null; },
    get href()   { return el._attrs.href   || null; },
    set href(v)  { el._attrs.href = v; },
    get target() { return el._attrs.target || null; },
    set target(v){ el._attrs.target = v; },
    get rel()    { return el._attrs.rel    || null; },
    set rel(v)   { el._attrs.rel = v; },
  };
  return el;
}

function classFromSel(sel) {
  // Only handles simple .classname selectors used in tests
  return sel.startsWith(".") ? sel.slice(1) : null;
}

function collectByClass(root, cls) {
  const found = [];
  if (!cls) return found;
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.className && node.className.split(" ").includes(cls)) found.push(node);
    (node.children || []).forEach(walk);
  }
  walk(root);
  return found;
}

// Install minimal global browser-like APIs
global.document = {
  readyState: "complete",
  createElement(tag) { return makeElement(tag); },
  getElementById(id) { return idMap[id] || null; },
  addEventListener() {},
};
global.window = global;
global.console = console; // pass through

// Reset the id fixture between renderProjects tests
function resetFixture() {
  const grid  = makeElement("div");
  grid.id = "project-grid";
  grid._attrs.role = "list";
  grid.innerHTML = "";
  grid.children = [];

  const empty = makeElement("p");
  empty.id = "empty-state";
  empty.hidden = true;

  const loading = makeElement("p");
  loading.id = "loading-state";
  loading.hidden = false;

  const error = makeElement("p");
  error.id = "error-state";
  error.hidden = true;

  idMap = {
    "project-grid":  grid,
    "empty-state":   empty,
    "loading-state": loading,
    "error-state":   error,
  };

  // patch querySelectorAll on grid to walk children
  grid.querySelectorAll = function (sel) {
    return collectByClass(grid, classFromSel(sel));
  };
  grid.querySelector = function (sel) {
    return collectByClass(grid, classFromSel(sel))[0] || null;
  };

  return { grid, empty, loading, error };
}

// Provide a default fetch stub so init()'s loadProjects() call during eval
// resolves silently (returns empty array).
global.fetch = function () {
  return Promise.resolve({
    ok: true,
    json: function () { return Promise.resolve([]); },
  });
};

// Pre-populate fixture so init()'s loadProjects() call has the necessary DOM
resetFixture();
// Footer year element (used by init())
idMap["footer-year"] = makeElement("span");

// ── Load script.js ──────────────────────────────────────────────────────────

const fs   = require("fs");
const path = require("path");
const src  = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
// eslint-disable-next-line no-eval
eval(src);

const { isValidProject, buildCard, renderProjects, safeUrl } = global.Portfolio;

// ── Micro test runner ───────────────────────────────────────────────────────

let total = 0;
let passed = 0;
const failures = [];

function assert(desc, condition) {
  total++;
  if (condition) {
    passed++;
    process.stdout.write("  \x1b[32m✓\x1b[0m  " + desc + "\n");
  } else {
    failures.push(desc);
    process.stdout.write("  \x1b[31m✗\x1b[0m  " + desc + "\n");
  }
}

function assertEqual(desc, a, b) {
  total++;
  if (a === b) {
    passed++;
    process.stdout.write("  \x1b[32m✓\x1b[0m  " + desc + "\n");
  } else {
    failures.push(desc + " (expected " + JSON.stringify(b) + ", got " + JSON.stringify(a) + ")");
    process.stdout.write("  \x1b[31m✗\x1b[0m  " + desc +
      " \x1b[2m(expected " + JSON.stringify(b) + ", got " + JSON.stringify(a) + ")\x1b[0m\n");
  }
}

function suite(name, fn) {
  console.log("\n\x1b[2m" + name + "\x1b[0m");
  fn();
}

// ── Test suites ─────────────────────────────────────────────────────────────

suite("isValidProject — valid inputs", function () {
  assert("accepts fully populated object",
    isValidProject({ title: "foo", description: "bar", url: "https://x.com" }));
  assert("accepts empty description",
    isValidProject({ title: "foo", description: "", url: "" }));
  assert("accepts empty url",
    isValidProject({ title: "foo", description: "desc", url: "" }));
});

suite("isValidProject — invalid inputs", function () {
  assert("rejects null",                  !isValidProject(null));
  assert("rejects undefined",             !isValidProject(undefined));
  assert("rejects plain string",          !isValidProject("hello"));
  assert("rejects number",               !isValidProject(42));
  assert("rejects array",                !isValidProject([]));
  assert("rejects missing title",         !isValidProject({ description: "d", url: "u" }));
  assert("rejects empty-string title",    !isValidProject({ title: "", description: "d", url: "u" }));
  assert("rejects whitespace-only title", !isValidProject({ title: "   ", description: "d", url: "u" }));
  assert("rejects numeric title",         !isValidProject({ title: 123, description: "d", url: "u" }));
  assert("rejects missing description",   !isValidProject({ title: "t", url: "u" }));
  assert("rejects missing url",           !isValidProject({ title: "t", description: "d" }));
});

suite("buildCard — DOM structure", function () {
  const card = buildCard({ title: "my project", description: "some desc", url: "https://example.com" });

  assert("returns an object",                typeof card === "object" && card !== null);
  assertEqual("has ARTICLE tag",             card.tagName, "ARTICLE");
  assert("has class project-card",           card.className.split(" ").includes("project-card"));
  assert("title element exists",             card.querySelector(".project-title") !== null);
  assert("description element exists",       card.querySelector(".project-description") !== null);
  assert("link element exists",              card.querySelector(".project-link") !== null);
  assertEqual("title text content",          card.querySelector(".project-title").textContent, "my project");
  assertEqual("description text content",    card.querySelector(".project-description").textContent, "some desc");

  const titleEl = card.querySelector(".project-title");
  const anchor = titleEl ? (titleEl.children[0] || null) : null;
  assert("title wraps anchor when url present", anchor !== null && anchor.tagName === "A");
  assertEqual("anchor href",    anchor && anchor.getAttribute("href"), "https://example.com");
  assertEqual("anchor rel",     anchor && anchor.getAttribute("rel"),  "noopener noreferrer");
});

suite("buildCard — no url", function () {
  const card = buildCard({ title: "no link", description: "desc", url: "" });
  const titleEl = card.querySelector(".project-title");
  const anchor = titleEl ? (titleEl.children[0] || null) : null;

  assert("no anchor in title when url empty",
    anchor === null || anchor.tagName !== "A");
  assert("no .project-link section when url empty",
    card.querySelector(".project-link") === null);
});

suite("renderProjects — grid population", function () {
  let { grid, empty } = resetFixture();

  renderProjects([
    { title: "a", description: "da", url: "" },
    { title: "b", description: "db", url: "https://b.com" },
  ]);
  assertEqual("renders exactly 2 cards",              grid.querySelectorAll(".project-card").length, 2);
  assert("empty state hidden when projects present",  empty.hidden === true);

  // Re-render clears old content
  resetFixture();
  ({ grid, empty } = resetFixture()); // re-assign after fixture reset
  renderProjects([{ title: "only one", description: "d", url: "" }]);
  renderProjects([{ title: "only one", description: "d", url: "" }]); // second call should clear first
  assertEqual("clears old cards on re-render",        grid.querySelectorAll(".project-card").length, 1);

  // Empty array
  resetFixture();
  ({ grid, empty } = resetFixture());
  renderProjects([]);
  assertEqual("no cards for empty array",             grid.querySelectorAll(".project-card").length, 0);
  assert("empty state visible for empty array",       empty.hidden === false);

  // null input
  resetFixture();
  ({ grid, empty } = resetFixture());
  renderProjects(null);
  assert("empty state visible for null input",        empty.hidden === false);
});

suite("safeUrl — URL scheme filtering", function () {
  assertEqual("passes https URL unchanged",  safeUrl("https://example.com"), "https://example.com");
  assertEqual("passes http URL unchanged",   safeUrl("http://example.com"),  "http://example.com");
  assertEqual("blocks javascript: URL",      safeUrl("javascript:alert(1)"), "");
  assertEqual("blocks data: URL",            safeUrl("data:text/html,x"),    "");
  assertEqual("blocks ftp: URL",             safeUrl("ftp://files.example.com"), "");
  assertEqual("returns empty for empty string", safeUrl(""), "");
  assertEqual("returns empty for invalid string", safeUrl("not a url"), "");
});

suite("buildCard — unsafe URL treated as missing", function () {
  const card = buildCard({ title: "xss", description: "desc", url: "javascript:alert(1)" });
  const titleEl = card.querySelector(".project-title");
  const anchor = titleEl ? (titleEl.children[0] || null) : null;
  assert("no anchor for javascript: URL",
    anchor === null || anchor.tagName !== "A");
  assert("no .project-link section for javascript: URL",
    card.querySelector(".project-link") === null);

  const card2 = buildCard({ title: "data", description: "desc", url: "data:text/html,<b>x</b>" });
  const titleEl2 = card2.querySelector(".project-title");
  const anchor2 = titleEl2 ? (titleEl2.children[0] || null) : null;
  assert("no anchor for data: URL",
    anchor2 === null || anchor2.tagName !== "A");
});

suite("renderProjects — skips invalid items", function () {
  const { grid } = resetFixture();

  renderProjects([
    { title: "valid",       description: "d",  url: "" },
    null,
    { title: "",            description: "d",  url: "" },
    "bad",
    { title: "also valid",  description: "d2", url: "" },
  ]);

  assertEqual("renders only the 2 valid cards", grid.querySelectorAll(".project-card").length, 2);
});


// ── Async suite runner ────────────────────────────────────────────────────────

async function asyncSuite(name, fn) {
  console.log("\n\x1b[2m" + name + "\x1b[0m");
  await fn();
}

function resetAll() {
  const result = resetFixture();
  idMap["footer-year"] = makeElement("span");
  return result;
}

// ── Async test suites (loadProjects / fetch states) ───────────────────────────

(async function () {

  await asyncSuite("loadProjects — populated data", async function () {
    const { grid, empty, loading, error } = resetAll();

    global.fetch = function () {
      return Promise.resolve({
        ok: true,
        json: function () {
          return Promise.resolve([
            { title: "alpha", description: "desc a", url: "https://alpha.com" },
            { title: "beta",  description: "desc b", url: "" },
          ]);
        },
      });
    };

    await window.Portfolio.loadProjects();

    assertEqual("renders 2 cards from JSON",
      grid.querySelectorAll(".project-card").length, 2);
    assert("loading state hidden after success", loading.hidden === true);
    assert("error state hidden after success",   error.hidden   === true);
    assert("empty state hidden after success",   empty.hidden   === true);
  });

  await asyncSuite("loadProjects — empty data", async function () {
    const { grid, empty, loading, error } = resetAll();

    global.fetch = function () {
      return Promise.resolve({
        ok: true,
        json: function () { return Promise.resolve([]); },
      });
    };

    await window.Portfolio.loadProjects();

    assertEqual("renders 0 cards for empty JSON",
      grid.querySelectorAll(".project-card").length, 0);
    assert("loading state hidden after empty",        loading.hidden === true);
    assert("empty state visible for empty JSON",      empty.hidden   === false);
    assert("error state hidden after empty response", error.hidden   === true);
  });

  await asyncSuite("loadProjects — fetch failure (network error)", async function () {
    const { grid, empty, loading, error } = resetAll();

    global.fetch = function () {
      return Promise.reject(new Error("network error"));
    };

    await window.Portfolio.loadProjects();

    assertEqual("renders 0 cards on network failure",
      grid.querySelectorAll(".project-card").length, 0);
    assert("loading state hidden after failure", loading.hidden === true);
    assert("error state visible after failure",  error.hidden   === false);
  });

  await asyncSuite("loadProjects — non-ok HTTP response", async function () {
    const { grid, empty, loading, error } = resetAll();

    global.fetch = function () {
      return Promise.resolve({ ok: false, status: 404 });
    };

    await window.Portfolio.loadProjects();

    assertEqual("renders 0 cards on 404",
      grid.querySelectorAll(".project-card").length, 0);
    assert("loading state hidden after non-ok", loading.hidden === true);
    assert("error state visible after non-ok",  error.hidden   === false);
  });

  // ── Summary ──────────────────────────────────────────────────────────────────

  const failed = total - passed;
  console.log("\n" + "─".repeat(50));
  if (failed === 0) {
    console.log("\x1b[32m" + passed + " / " + total + " tests passed\x1b[0m");
  } else {
    console.log("\x1b[31m" + passed + " / " + total + " passed — " + failed + " FAILED\x1b[0m");
    failures.forEach(function (f) { console.log("  \x1b[31m✗\x1b[0m  " + f); });
  }

  process.exit(failed > 0 ? 1 : 0);
})();
