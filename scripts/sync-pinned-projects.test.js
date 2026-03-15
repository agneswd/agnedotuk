"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  selectProjectUrl,
  reducePinnedProjects,
  reduceRepositories,
  buildProjectsPayload,
  fetchOwnedRepositories,
  syncPinnedProjects,
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

test("selectProjectUrl supports REST repository fields and prefers homepage", function () {
  const repository = {
    homepage: "  https://agneswd.dev/rest-demo  ",
    html_url: "https://github.com/agneswd/rest-demo",
  };

  assert.equal(selectProjectUrl(repository), "https://agneswd.dev/rest-demo");
});

test("selectProjectUrl prefers REST html_url over API url when homepage is blank", function () {
  const repository = {
    homepage: "   ",
    url: "https://api.github.com/repos/agneswd/rest-demo",
    html_url: "https://github.com/agneswd/rest-demo",
  };

  assert.equal(selectProjectUrl(repository), "https://github.com/agneswd/rest-demo");
});

test("reducePinnedProjects adds only languages above the 15 percent threshold", function () {
  const projects = reducePinnedProjects([
    {
      name: "portfolio-site",
      description: null,
      homepageUrl: "https://agneswd.dev/portfolio",
      url: "https://github.com/agneswd/portfolio-site",
      languages: {
        edges: [
          {
            size: 75,
            node: { name: "TypeScript" },
          },
          {
            size: 25,
            node: { name: "CSS" },
          },
          {
            size: 20,
            node: { name: "HTML" },
          },
          {
            size: 0,
            node: { name: "Shell" },
          },
        ],
      },
      stargazerCount: 99,
      owner: { login: "agneswd" },
    },
  ]);

  assert.deepEqual(projects, [
    {
      title: "portfolio-site",
      description: "",
      url: "https://agneswd.dev/portfolio",
      languages: ["TypeScript", "CSS", "HTML"],
    },
  ]);
});

test("buildProjectsPayload excludes pinned repositories from repositories", function () {
  const projects = buildProjectsPayload(
    [
      {
        name: "autumn",
        description: "Pinned repo",
        homepageUrl: "https://autumn.agne.uk/",
        url: "https://github.com/agneswd/autumn",
        languages: {
          edges: [
            {
              size: 90,
              node: { name: "Rust" },
            },
            {
              size: 10,
              node: { name: "HTML" },
            },
          ],
        },
      },
    ],
    [
      {
        name: "autumn",
        description: "Pinned repo duplicate",
        homepage: "https://autumn.agne.uk/",
        html_url: "https://github.com/agneswd/autumn",
      },
      {
        name: "agnedotuk",
        description: "Static site",
        homepage: "http://projects.agne.uk/",
        html_url: "https://github.com/agneswd/agnedotuk",
      },
    ]
  );

  assert.deepEqual(projects, {
    pinned: [
      {
        title: "autumn",
        description: "Pinned repo",
        url: "https://autumn.agne.uk/",
        languages: ["Rust"],
      },
    ],
    repositories: [
      {
        title: "agnedotuk",
        description: "Static site",
        url: "http://projects.agne.uk/",
      },
    ],
  });
});

test("reduceRepositories returns minimal repo objects from REST payloads using public repo URLs", function () {
  const repositories = reduceRepositories([
    {
      name: "string",
      description: "The common thread between you and your friends.",
      homepage: "   ",
      url: "https://api.github.com/repos/agneswd/string",
      html_url: "https://github.com/agneswd/string",
      language: "TypeScript",
    },
    {
      name: "autumn",
      description: "A general-purpose Discord moderation bot.",
      homepage: "https://autumn.agne.uk/",
      html_url: "https://github.com/agneswd/autumn",
      archived: false,
    },
  ]);

  assert.deepEqual(repositories, [
    {
      title: "string",
      description: "The common thread between you and your friends.",
      url: "https://github.com/agneswd/string",
    },
    {
      title: "autumn",
      description: "A general-purpose Discord moderation bot.",
      url: "https://autumn.agne.uk/",
    },
  ]);
});

test("reduceRepositories sorts repositories by approximate code size descending without exposing size", function () {
  const repositories = reduceRepositories([
    {
      name: "small-repo",
      description: "Small repository",
      html_url: "https://github.com/agneswd/small-repo",
      size: 12,
    },
    {
      name: "largest-repo",
      description: "Largest repository",
      html_url: "https://github.com/agneswd/largest-repo",
      size: 4096,
    },
    {
      name: "unknown-size-repo",
      description: "Repository without size metadata",
      html_url: "https://github.com/agneswd/unknown-size-repo",
    },
  ]);

  assert.deepEqual(repositories, [
    {
      title: "largest-repo",
      description: "Largest repository",
      url: "https://github.com/agneswd/largest-repo",
    },
    {
      title: "small-repo",
      description: "Small repository",
      url: "https://github.com/agneswd/small-repo",
    },
    {
      title: "unknown-size-repo",
      description: "Repository without size metadata",
      url: "https://github.com/agneswd/unknown-size-repo",
    },
  ]);
});

test("fetchOwnedRepositories paginates across all public repositories", async function () {
  const calls = [];

  const firstPage = new Array(100).fill(null).map(function (_, index) {
    return {
      name: "repo-" + index,
      html_url: "https://github.com/agneswd/repo-" + index,
      description: "Repository " + index,
    };
  });

  const secondPage = [
    {
      name: "repo-100",
      html_url: "https://github.com/agneswd/repo-100",
      description: "Repository 100",
    },
  ];

  const repositories = await fetchOwnedRepositories({
    token: "test-token",
    user: "agneswd",
    fetchImpl: async function (url, options) {
      calls.push({ url: url, options: options });

      if (/([?&])page=1(?:&|$)/.test(url)) {
        return {
          ok: true,
          json: async function () {
            return firstPage;
          },
        };
      }

      return {
        ok: true,
        json: async function () {
          return secondPage;
        },
      };
    },
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /users\/agneswd\/repos\?per_page=100&page=1/);
  assert.match(calls[1].url, /users\/agneswd\/repos\?per_page=100&page=2/);
  assert.equal(repositories.length, 101);
});

test("writeProjectsFile writes pretty JSON consumable by the static site", function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agnedotuk-projects-"));
  const outputPath = path.join(dir, "projects.json");
  const projects = {
    pinned: [
      {
        title: "demo",
        description: "Pinned project",
        url: "https://example.com/demo",
      },
    ],
    repositories: [
      {
        title: "repo",
        description: "All repositories entry",
        url: "https://github.com/agneswd/repo",
      },
    ],
  };

  writeProjectsFile(projects, outputPath);

  const written = fs.readFileSync(outputPath, "utf8");
  assert.equal(
    written,
    JSON.stringify(projects, null, 2) + "\n"
  );

  assert.deepEqual(JSON.parse(written), projects);
});

test("syncPinnedProjects writes pinned languages and excludes pinned repos from repositories", async function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agnedotuk-sync-"));
  const outputPath = path.join(dir, "projects.json");
  const calls = [];

  const projects = await syncPinnedProjects({
    token: "test-token",
    user: "agneswd",
    outputPath: outputPath,
    fetchImpl: async function (url, options) {
      calls.push({ url: url, options: options });

      if (url.indexOf("/graphql") !== -1) {
        return {
          ok: true,
          json: async function () {
            return {
              data: {
                user: {
                  pinnedItems: {
                    nodes: [
                      {
                        name: "autumn",
                        description: "A general-purpose Discord moderation bot.",
                        homepageUrl: "https://autumn.agne.uk/",
                        url: "https://github.com/agneswd/autumn",
                        languages: {
                          edges: [
                            {
                              size: 70,
                              node: { name: "Rust" },
                            },
                            {
                              size: 16,
                              node: { name: "Nix" },
                            },
                            {
                              size: 14,
                              node: { name: "HTML" },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            };
          },
        };
      }

      return {
        ok: true,
        json: async function () {
          return [
            {
              name: "autumn",
              description: "A general-purpose Discord moderation bot.",
              homepage: "https://autumn.agne.uk/",
              html_url: "https://github.com/agneswd/autumn",
            },
            {
              name: "agnedotuk",
              description: "Simple dynamically updating projects page.",
              homepage: "http://projects.agne.uk/",
              html_url: "https://github.com/agneswd/agnedotuk",
              size: 512,
            },
            {
              name: "string",
              description: "The common thread between you and your friends.",
              homepage: "",
              url: "https://api.github.com/repos/agneswd/string",
              html_url: "https://github.com/agneswd/string",
              size: 2048,
            },
          ];
        },
      };
    },
  });

  assert.deepEqual(projects, {
    pinned: [
      {
        title: "autumn",
        description: "A general-purpose Discord moderation bot.",
        url: "https://autumn.agne.uk/",
        languages: ["Rust", "Nix"],
      },
    ],
    repositories: [
      {
        title: "string",
        description: "The common thread between you and your friends.",
        url: "https://github.com/agneswd/string",
      },
      {
        title: "agnedotuk",
        description: "Simple dynamically updating projects page.",
        url: "http://projects.agne.uk/",
      },
    ],
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), projects);
});
