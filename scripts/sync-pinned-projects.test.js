"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  selectProjectUrl,
  reducePinnedProjects,
  writeProjectsFile,
} = require("./sync-pinned-projects.js");

test("selectProjectUrl prefers trimmed homepageUrl when present", function () {
  const repository = {
    homepageUrl: "  https://agneswd.dev/demo  ",
    url: "https://github.com/agneswd/demo",
  };

  assert.equal(selectProjectUrl(repository), "https://agneswd.dev/demo");
});

test("selectProjectUrl falls back to repository url when homepageUrl is blank", function () {
  const repository = {
    homepageUrl: "   ",
    url: "https://github.com/agneswd/demo",
  };

  assert.equal(selectProjectUrl(repository), "https://github.com/agneswd/demo");
});

test("reducePinnedProjects returns only title, description, and url", function () {
  const projects = reducePinnedProjects([
    {
      name: "portfolio-site",
      description: null,
      homepageUrl: "https://agneswd.dev/portfolio",
      url: "https://github.com/agneswd/portfolio-site",
      stargazerCount: 99,
      owner: { login: "agneswd" },
    },
  ]);

  assert.deepEqual(projects, [
    {
      title: "portfolio-site",
      description: "",
      url: "https://agneswd.dev/portfolio",
    },
  ]);
});

test("writeProjectsFile writes pretty JSON consumable by the static site", function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agnedotuk-projects-"));
  const outputPath = path.join(dir, "projects.json");
  const projects = [
    {
      title: "demo",
      description: "Pinned project",
      url: "https://example.com/demo",
    },
  ];

  writeProjectsFile(projects, outputPath);

  const written = fs.readFileSync(outputPath, "utf8");
  assert.equal(
    written,
    JSON.stringify(projects, null, 2) + "\n"
  );

  assert.deepEqual(JSON.parse(written), projects);
});
