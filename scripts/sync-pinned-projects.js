"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_USER = "agneswd";
const DEFAULT_COUNT = 6;
const DEFAULT_OUTPUT_PATH = path.resolve(__dirname, "..", "data", "projects.json");
const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const GITHUB_REST_URL = "https://api.github.com";
const PINNED_LANGUAGE_PERCENT_THRESHOLD = 0.15;
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
            languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
              edges {
                size
                node {
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createGitHubHeaders(token) {
  return {
    "Authorization": "Bearer " + token,
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "agnedotuk-pinned-project-sync",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function isGitHubApiUrl(value) {
  return /^https:\/\/api\.github\.com\//i.test(normalizeString(value));
}

function selectRepositoryPageUrl(repository) {
  const htmlUrl = normalizeString(repository && repository.html_url);
  const url = normalizeString(repository && repository.url);

  if (htmlUrl !== "") {
    return htmlUrl;
  }

  if (url !== "" && !isGitHubApiUrl(url)) {
    return url;
  }

  return "";
}

function selectProjectUrl(repository) {
  const homepageUrl = normalizeString(repository && repository.homepageUrl);
  const homepage = normalizeString(repository && repository.homepage);
  const repositoryUrl = selectRepositoryPageUrl(repository);
  return homepageUrl || homepage || repositoryUrl;
}

function reduceRepository(repository) {
  return {
    title: normalizeString(repository.name),
    description: normalizeString(repository.description),
    url: selectProjectUrl(repository),
  };
}

function normalizeRepositoryName(repository) {
  return normalizeString(repository && repository.name).toLowerCase();
}

function reducePinnedProjectLanguages(repository) {
  const edges = repository && repository.languages && Array.isArray(repository.languages.edges)
    ? repository.languages.edges
    : [];

  const validEdges = edges.filter(function (edge) {
    return edge
      && edge.node
      && normalizeString(edge.node.name) !== ""
      && Number.isFinite(edge.size)
      && edge.size > 0;
  });

  const totalSize = validEdges.reduce(function (sum, edge) {
    return sum + edge.size;
  }, 0);

  if (totalSize <= 0) {
    return [];
  }

  return validEdges.filter(function (edge) {
    return edge.size / totalSize > PINNED_LANGUAGE_PERCENT_THRESHOLD;
  }).map(function (edge) {
    return normalizeString(edge.node.name);
  });
}

function getApproximateRepositorySize(repository) {
  return repository && Number.isFinite(repository.size) ? repository.size : -1;
}

function reduceRepositories(repositories) {
  if (!Array.isArray(repositories)) {
    return [];
  }

  return repositories
    .filter(function (repository) {
      return repository && typeof repository === "object";
    })
    .slice()
    .sort(function (left, right) {
      return getApproximateRepositorySize(right) - getApproximateRepositorySize(left);
    })
    .map(reduceRepository)
    .filter(function (project) {
      return project.title !== "" && project.url !== "";
    });
}

function buildProjectsPayload(pinnedRepositories, ownedRepositories) {
  const pinnedNames = new Set((Array.isArray(pinnedRepositories) ? pinnedRepositories : [])
    .map(normalizeRepositoryName)
    .filter(function (name) {
      return name !== "";
    }));

  return {
    pinned: reducePinnedProjects(pinnedRepositories),
    repositories: reduceRepositories((Array.isArray(ownedRepositories) ? ownedRepositories : []).filter(function (repository) {
      return !pinnedNames.has(normalizeRepositoryName(repository));
    })),
  };
}

function getFetchImplementation(options) {
  return options && options.fetchImpl ? options.fetchImpl : globalThis.fetch;
}

function getRequiredToken(options) {
  const token = options && options.token ? options.token : "";

  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required to sync pinned projects.");
  }

  return token;
}

function getUser(options) {
  return options && options.user ? options.user : DEFAULT_USER;
}

function getPinnedCount(options) {
  return options && options.count ? options.count : DEFAULT_COUNT;
}

function ensureFetchAvailable(fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Global fetch is not available in this Node.js runtime.");
  }
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
      const project = reduceRepository(repository);
      return {
        title: project.title,
        description: project.description,
        url: project.url,
        languages: reducePinnedProjectLanguages(repository),
      };
    })
    .filter(function (project) {
      return project.title !== "" && project.url !== "";
    });
}

async function fetchPinnedRepositories(options) {
  const fetchImpl = getFetchImplementation(options);
  const token = getRequiredToken(options);
  const user = getUser(options);
  const count = getPinnedCount(options);

  ensureFetchAvailable(fetchImpl);

  const response = await fetchImpl(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: createGitHubHeaders(token),
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

async function fetchOwnedRepositories(options) {
  const fetchImpl = getFetchImplementation(options);
  const token = getRequiredToken(options);
  const user = getUser(options);
  const repositories = [];
  let page = 1;
  let hasMore = true;

  ensureFetchAvailable(fetchImpl);

  while (hasMore) {
    const response = await fetchImpl(
      GITHUB_REST_URL + "/users/" + encodeURIComponent(user) + "/repos?per_page=100&page=" + page,
      {
        method: "GET",
        headers: createGitHubHeaders(token),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error("GitHub REST request failed with status " + response.status + ": " + body);
    }

    const payload = await response.json();

    if (!Array.isArray(payload)) {
      throw new Error("Owned repository data was missing from the GitHub response.");
    }

    repositories.push.apply(repositories, payload);
    hasMore = payload.length === 100;
    page += 1;
  }

  return repositories;
}

function writeProjectsFile(projects, outputPath) {
  const destination = outputPath || DEFAULT_OUTPUT_PATH;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(projects, null, 2) + "\n", "utf8");
  return destination;
}

async function syncPinnedProjects(options) {
  const pinnedRepositories = await fetchPinnedRepositories(options || {});
  const ownedRepositories = await fetchOwnedRepositories(options || {});
  const projects = buildProjectsPayload(pinnedRepositories, ownedRepositories);
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
    "Synced " + projects.pinned.length + " pinned projects and " + projects.repositories.length + " repositories to " + path.relative(process.cwd(), outputPath)
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
  GITHUB_REST_URL,
  PINNED_LANGUAGE_PERCENT_THRESHOLD,
  normalizeString,
  createGitHubHeaders,
  isGitHubApiUrl,
  selectRepositoryPageUrl,
  selectProjectUrl,
  reduceRepository,
  reduceRepositories,
  reducePinnedProjectLanguages,
  reducePinnedProjects,
  buildProjectsPayload,
  fetchPinnedRepositories,
  fetchOwnedRepositories,
  writeProjectsFile,
  syncPinnedProjects,
  parseCount,
};
