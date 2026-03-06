/**
 * script.js — rendering contract for agneswd portfolio
 *
 * Public API:
 *   renderProjects(projects)
 *     @param {Array<{title: string, description: string, url: string, languages?: string[]}>} projects
 *     Renders pinned project cards (with language tags) into #project-grid.
 *     Validates each entry and skips malformed objects (logs a warning).
 *
 *   renderAllRepos(repos)
 *     @param {Array<{title: string, description: string, url: string}>} repos
 *     Renders compact repo cards into #repos-grid.
 *
 * The functions are exported on window.Portfolio for testability.
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
   * @param {{title: string, description: string, url: string, languages?: string[]}} project
   * @param {{ showLanguages?: boolean, compact?: boolean }} [options]
   * @returns {HTMLElement}
   */
  function buildCard(project, options) {
    var opts = options || {};

    const card = document.createElement("article");
    card.className = "project-card";
    if (opts.compact) {
      card.classList.add("project-card--compact");
    }
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

    // Language tags — only for pinned cards when opted in
    var langsEl = null;
    if (opts.showLanguages &&
        Array.isArray(project.languages) &&
        project.languages.length > 0) {
      langsEl = document.createElement("div");
      langsEl.className = "project-languages";
      project.languages.forEach(function (lang) {
        if (typeof lang === "string" && lang.trim() !== "") {
          const tag = document.createElement("span");
          tag.className = "language-tag";
          tag.setAttribute("data-lang", lang.trim().toLowerCase());
          tag.textContent = lang.trim();
          langsEl.appendChild(tag);
        }
      });
    }

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
    if (langsEl) card.appendChild(langsEl);
    if (url) card.appendChild(linkEl);

    return card;
  }

  // ── Public rendering contract ────────────────────────────────────────────

  /**
   * Generic grid-renderer: renders an array of project objects into a target
   * grid element, managing an optional empty-state element.
   * Malformed entries are skipped with a console warning.
   *
   * @param {string} gridId           - id of the target grid container
   * @param {string} emptyId          - id of the empty-state element
   * @param {string} label            - function label used in warning messages
   * @param {Array<{title: string, description: string, url: string}>} items
   * @param {{ showLanguages?: boolean, compact?: boolean }} [cardOptions]
   */
  function renderCardGrid(gridId, emptyId, label, items, cardOptions) {
    var grid       = document.getElementById(gridId);
    var emptyState = document.getElementById(emptyId);

    if (!grid) {
      console.error(label + ": #" + gridId + " element not found.");
      return;
    }

    grid.innerHTML = "";

    if (!Array.isArray(items) || items.length === 0) {
      if (emptyState) emptyState.hidden = false;
      return;
    }

    if (emptyState) emptyState.hidden = true;

    var rendered = 0;
    items.forEach(function (p, i) {
      if (!isValidProject(p)) {
        console.warn(
          label + ": skipping item at index " + i + " — invalid shape.",
          p
        );
        return;
      }
      grid.appendChild(buildCard(p, cardOptions));
      rendered++;
    });

    if (rendered === 0 && emptyState) {
      emptyState.hidden = false;
    }
  }

  /**
   * Renders pinned project cards (with language tags) into #project-grid.
   * @param {Array<{title: string, description: string, url: string, languages?: string[]}>} projects
   */
  function renderProjects(projects) {
    renderCardGrid("project-grid", "empty-state", "renderProjects", projects, { showLanguages: true });
  }

  /**
   * Renders compact all-repos cards into #repos-grid.
   * @param {Array<{title: string, description: string, url: string}>} repos
   */
  function renderAllRepos(repos) {
    renderCardGrid("repos-grid", "repos-empty-state", "renderAllRepos", repos, { compact: true });
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

    return fetch("data/projects.json?v=" + Date.now())
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (loadingEl) loadingEl.hidden = true;
        var pinned       = Array.isArray(data && data.pinned)        ? data.pinned        : [];
        var repositories = Array.isArray(data && data.repositories)  ? data.repositories  : [];
        renderProjects(pinned);
        renderAllRepos(repositories);
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
    renderAllRepos: renderAllRepos,   // exposed for testing
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
