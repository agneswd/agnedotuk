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

  function init() {
    // Footer year
    const yearEl = document.getElementById("footer-year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // Seed with placeholder data so the grid is visible from day one.
    // Phase 2 will replace this with a live JSON fetch.
    renderProjects([
      {
        title: "project one",
        description: "A brief description of what this project does and the technologies involved.",
        url: "https://github.com/agneswd",
      },
      {
        title: "project two",
        description: "Another short description. Keep it one or two sentences.",
        url: "https://github.com/agneswd",
      },
      {
        title: "project three",
        description: "Placeholder — will be replaced by live data in Phase 2.",
        url: "",
      },
    ]);
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  window.Portfolio = {
    renderProjects: renderProjects,
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
