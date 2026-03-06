/**
 * script.js — rendering contract for agneswd portfolio
 *
 * Public API:
 *   renderProjects(projects)
 *     @param {Array<{title: string, description: string, url: string}>} projects
 *     Renders project cards into #project-grid.
 *     Validates each entry and skips malformed objects (logs a warning).
 *
 * The function is exported on window.Portfolio for testability and future
 * integration. Phase 2 will call renderProjects() with live JSON data.
 */

(function () {
  "use strict";

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * Returns true if `p` is a valid project descriptor.
   * @param {unknown} p
   * @returns {boolean}
   */
  function isValidProject(p) {
    return (
      p !== null &&
      typeof p === "object" &&
      typeof p.title === "string" && p.title.trim() !== "" &&
      typeof p.description === "string" &&
      typeof p.url === "string"
    );
  }

  // ── URL safety ─────────────────────────────────────────────────────────────

  /**
   * Returns the URL string if it uses the http: or https: scheme, otherwise "".
   * Treats invalid / non-parseable values the same as a missing URL.
   * @param {string} url
   * @returns {string}
   */
  function safeUrl(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      return (parsed.protocol === "http:" || parsed.protocol === "https:") ? url : "";
    } catch (_) {
      return "";
    }
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────

  /**
   * Escapes a string for safe insertion into text content.
   * (Using textContent assignment handles this automatically; this helper is
   * used where we need a plain string for aria-labels, etc.)
   * @param {string} str
   * @returns {string}
   */
  function escapeText(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Builds a single project card element.
   * @param {{title: string, description: string, url: string}} project
   * @returns {HTMLElement}
   */
  function buildCard(project) {
    const card = document.createElement("article");
    card.className = "project-card";
    card.setAttribute("role", "listitem");

    // Only allow http/https URLs; everything else is treated as absent.
    const url = safeUrl(project.url);

    const titleEl = document.createElement("div");
    titleEl.className = "project-title";

    if (url) {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = project.title;
      titleEl.appendChild(link);
    } else {
      titleEl.textContent = project.title;
    }

    const descEl = document.createElement("p");
    descEl.className = "project-description";
    descEl.textContent = project.description;

    const linkEl = document.createElement("div");
    linkEl.className = "project-link";

    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      // Display a truncated hostname as a subtle link label
      try {
        const hostname = new URL(url).hostname.replace(/^www\./, "");
        a.textContent = hostname;
      } catch (_) {
        a.textContent = url;
      }
      linkEl.appendChild(a);
    }

    card.appendChild(titleEl);
    card.appendChild(descEl);
    if (url) card.appendChild(linkEl);

    return card;
  }

  // ── Public rendering contract ────────────────────────────────────────────

  /**
   * Renders an array of project objects into the page's project grid.
   * Accepts only objects with shape { title, description, url }.
   * Malformed entries are skipped with a console warning.
   *
   * @param {Array<{title: string, description: string, url: string}>} projects
   */
  function renderProjects(projects) {
    const grid = document.getElementById("project-grid");
    const emptyState = document.getElementById("empty-state");

    if (!grid) {
      console.error("renderProjects: #project-grid element not found.");
      return;
    }

    // Clear any existing content
    grid.innerHTML = "";

    if (!Array.isArray(projects) || projects.length === 0) {
      if (emptyState) emptyState.hidden = false;
      return;
    }

    if (emptyState) emptyState.hidden = true;

    let rendered = 0;
    projects.forEach(function (p, i) {
      if (!isValidProject(p)) {
        console.warn(
          "renderProjects: skipping item at index " + i + " — invalid shape.",
          p
        );
        return;
      }
      grid.appendChild(buildCard(p));
      rendered++;
    });

    if (rendered === 0 && emptyState) {
      emptyState.hidden = false;
    }
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  /**
   * Fetches data/projects.json and calls renderProjects() with the result.
   * Manages loading, empty, and error states in the DOM.
   * @returns {Promise<void>}
   */
  function loadProjects() {
    const loadingEl = document.getElementById("loading-state");
    const errorEl   = document.getElementById("error-state");

    if (loadingEl) loadingEl.hidden = false;
    if (errorEl)   errorEl.hidden   = true;

    return fetch("data/projects.json")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (projects) {
        if (loadingEl) loadingEl.hidden = true;
        renderProjects(projects);
      })
      .catch(function (err) {
        if (loadingEl) loadingEl.hidden = true;
        if (errorEl)   errorEl.hidden   = false;
        console.error("loadProjects: failed to fetch data/projects.json.", err);
      });
  }

  function init() {
    // Footer year
    const yearEl = document.getElementById("footer-year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    loadProjects();
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  window.Portfolio = {
    renderProjects: renderProjects,
    loadProjects: loadProjects,       // exposed for testing
    isValidProject: isValidProject,   // exposed for test.html
    buildCard: buildCard,             // exposed for test.html
    safeUrl: safeUrl,                 // exposed for test.html
  };

  // Run after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
