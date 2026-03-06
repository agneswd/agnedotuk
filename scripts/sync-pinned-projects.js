"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_USER = "agneswd";
const DEFAULT_COUNT = 6;
const DEFAULT_OUTPUT_PATH = path.resolve(__dirname, "..", "data", "projects.json");
const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const GRAPHQL_QUERY = `
  query PinnedRepositories($login: String!, $count: Int!) {
    user(login: $login) {
      pinnedItems(first: $count, types: [REPOSITORY]) {
        nodes {
          ... on Repository {
            name
            description
            homepageUrl
            url
          }
        }
      }
    }
  }
`;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function selectProjectUrl(repository) {
  const homepageUrl = normalizeString(repository && repository.homepageUrl);
  const repositoryUrl = normalizeString(repository && repository.url);
  return homepageUrl || repositoryUrl;
}

function reducePinnedProjects(repositories) {
  if (!Array.isArray(repositories)) {
    return [];
  }

  return repositories
    .filter(function (repository) {
      return repository && typeof repository === "object";
    })
    .map(function (repository) {
      return {
        title: normalizeString(repository.name),
        description: normalizeString(repository.description),
        url: selectProjectUrl(repository),
      };
    })
    .filter(function (project) {
      return project.title !== "" && project.url !== "";
    });
}

async function fetchPinnedRepositories(options) {
  const fetchImpl = options && options.fetchImpl ? options.fetchImpl : globalThis.fetch;
  const token = options && options.token ? options.token : "";
  const user = options && options.user ? options.user : DEFAULT_USER;
  const count = options && options.count ? options.count : DEFAULT_COUNT;

  if (typeof fetchImpl !== "function") {
    throw new Error("Global fetch is not available in this Node.js runtime.");
  }

  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required to sync pinned projects.");
  }

  const response = await fetchImpl(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "agnedotuk-pinned-project-sync",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      query: GRAPHQL_QUERY,
      variables: {
        login: user,
        count: count,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error("GitHub GraphQL request failed with status " + response.status + ": " + body);
  }

  const payload = await response.json();

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new Error(payload.errors.map(function (error) {
      return error.message;
    }).join("; "));
  }

  const nodes = payload && payload.data && payload.data.user && payload.data.user.pinnedItems
    ? payload.data.user.pinnedItems.nodes
    : null;

  if (!Array.isArray(nodes)) {
    throw new Error("Pinned repository data was missing from the GitHub response.");
  }

  return nodes;
}

function writeProjectsFile(projects, outputPath) {
  const destination = outputPath || DEFAULT_OUTPUT_PATH;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(projects, null, 2) + "\n", "utf8");
  return destination;
}

async function syncPinnedProjects(options) {
  const repositories = await fetchPinnedRepositories(options || {});
  const projects = reducePinnedProjects(repositories);
  writeProjectsFile(projects, options && options.outputPath ? options.outputPath : DEFAULT_OUTPUT_PATH);
  return projects;
}

function parseCount(rawValue) {
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_COUNT;
}

async function main() {
  const outputPath = process.env.PROJECTS_OUTPUT_PATH
    ? path.resolve(process.cwd(), process.env.PROJECTS_OUTPUT_PATH)
    : DEFAULT_OUTPUT_PATH;

  const projects = await syncPinnedProjects({
    token: process.env.GITHUB_TOKEN,
    user: process.env.GITHUB_USER || DEFAULT_USER,
    count: parseCount(process.env.PINNED_PROJECT_COUNT),
    outputPath: outputPath,
  });

  console.log(
    "Synced " + projects.length + " pinned projects to " + path.relative(process.cwd(), outputPath)
  );
}

if (require.main === module) {
  main().catch(function (error) {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_USER,
  DEFAULT_COUNT,
  DEFAULT_OUTPUT_PATH,
  GRAPHQL_QUERY,
  normalizeString,
  selectProjectUrl,
  reducePinnedProjects,
  fetchPinnedRepositories,
  writeProjectsFile,
  syncPinnedProjects,
  parseCount,
};
