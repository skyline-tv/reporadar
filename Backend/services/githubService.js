require('dotenv').config();
const axios = require('axios');
const { MongoClient } = require('mongodb');

// GitHub API client setup — only send Authorization when a token is configured
const githubHeaders = {
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'RepoRadar',
};
if (process.env.GITHUB_TOKEN) {
  githubHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

const githubApi = axios.create({
  baseURL: 'https://api.github.com',
  headers: githubHeaders,
});

// MongoDB configuration
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = 'gitgrok';

// MongoDB client setup
const client = new MongoClient(MONGO_URI);

/**
 * Map GitHub API failures to clear errors without leaking tokens or auth headers.
 */
function toGitHubError(error, fallbackMessage) {
  const status = error.response?.status;
  const apiMessage = error.response?.data?.message;
  const rateLimitRemaining = error.response?.headers?.['x-ratelimit-remaining'];

  let message = fallbackMessage;
  let statusCode = status || 500;
  let code = 'GITHUB_API_ERROR';

  if (status === 404) {
    message = `${fallbackMessage}: repository, path, or resource not found (it may be private or the name is invalid)`;
    code = 'NOT_FOUND';
  } else if (status === 403 && (rateLimitRemaining === '0' || /rate limit/i.test(apiMessage || ''))) {
    message = `${fallbackMessage}: GitHub API rate limit exceeded. Try again later or configure GITHUB_TOKEN.`;
    statusCode = 429;
    code = 'RATE_LIMIT';
  } else if (status === 401 || status === 403) {
    message = `${fallbackMessage}: access denied (private repository or invalid credentials)`;
    code = 'FORBIDDEN';
  } else if (apiMessage) {
    message = `${fallbackMessage}: ${apiMessage}`;
  } else if (error.message) {
    message = `${fallbackMessage}: ${error.message}`;
  }

  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

// Fetch all repositories for a user
exports.getUserRepos = async (username) => {
  try {
    const response = await githubApi.get(`/users/${username}/repos`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching repos for user ${username}:`, error.response?.status || error.message);
    throw toGitHubError(error, `Failed to fetch repositories for user: ${username}`);
  }
};

/**
 * Repository metadata usable by chat and HTTP callers.
 * Includes name, description, language, stars, forks, branches, and related fields.
 */
exports.getRepoInfo = async (owner, repo) => {
  if (!owner?.trim() || !repo?.trim()) {
    const err = new Error('Owner and repository name are required');
    err.statusCode = 400;
    err.code = 'INVALID_INPUT';
    throw err;
  }

  try {
    const { data } = await githubApi.get(`/repos/${owner}/${repo}`);

    let branches = [];
    try {
      const branchesRes = await githubApi.get(`/repos/${owner}/${repo}/branches`, {
        params: { per_page: 100 },
      });
      branches = branchesRes.data.map((b) => b.name);
    } catch (branchError) {
      console.error(
        `Warning: could not list branches for ${owner}/${repo}:`,
        branchError.response?.status || branchError.message
      );
      branches = data.default_branch ? [data.default_branch] : [];
    }

    return {
      name: data.name,
      fullName: data.full_name,
      description: data.description,
      language: data.language,
      stars: data.stargazers_count,
      forks: data.forks_count,
      watchers: data.watchers_count,
      openIssues: data.open_issues_count,
      defaultBranch: data.default_branch,
      branches,
      private: data.private,
      htmlUrl: data.html_url,
      cloneUrl: data.clone_url,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      pushedAt: data.pushed_at,
      license: data.license?.spdx_id || data.license?.name || null,
      topics: data.topics || [],
      size: data.size,
      owner: {
        login: data.owner?.login,
        type: data.owner?.type,
        htmlUrl: data.owner?.html_url,
      },
    };
  } catch (error) {
    if (error.code && error.statusCode) throw error;
    console.error(`Error fetching repo info for ${owner}/${repo}:`, error.response?.status || error.message);
    throw toGitHubError(error, `Failed to fetch repository info for ${owner}/${repo}`);
  }
};

/**
 * Recent commits with author, message, and date.
 */
exports.getRecentCommits = async (owner, repo, options = {}) => {
  if (!owner?.trim() || !repo?.trim()) {
    const err = new Error('Owner and repository name are required');
    err.statusCode = 400;
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const perPage = Math.min(Math.max(Number(options.perPage) || 10, 1), 30);

  try {
    const { data } = await githubApi.get(`/repos/${owner}/${repo}/commits`, {
      params: { per_page: perPage },
    });

    return data.map((commit) => ({
      sha: commit.sha,
      shortSha: commit.sha?.substring(0, 7),
      message: commit.commit?.message || '',
      author: commit.commit?.author?.name || commit.author?.login || 'Unknown',
      authorLogin: commit.author?.login || null,
      date: commit.commit?.author?.date || commit.commit?.committer?.date || null,
      htmlUrl: commit.html_url,
    }));
  } catch (error) {
    if (error.code && error.statusCode) throw error;
    console.error(`Error fetching commits for ${owner}/${repo}:`, error.response?.status || error.message);
    throw toGitHubError(error, `Failed to fetch recent commits for ${owner}/${repo}`);
  }
};

/**
 * List files/folders or fetch a single file at a path (supports nested paths).
 * @param {string} owner
 * @param {string} repo
 * @param {string} [path=''] - relative path within the repo; empty string = root
 */
exports.getRepoContent = async (owner, repo, path = '') => {
  if (!owner?.trim() || !repo?.trim()) {
    const err = new Error('Owner and repository name are required');
    err.statusCode = 400;
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const normalizedPath = String(path || '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

  const endpoint = normalizedPath
    ? `/repos/${owner}/${repo}/contents/${normalizedPath}`
    : `/repos/${owner}/${repo}/contents`;

  try {
    const { data } = await githubApi.get(endpoint);

    if (Array.isArray(data)) {
      return {
        type: 'dir',
        path: normalizedPath || '',
        entries: data.map((item) => ({
          name: item.name,
          path: item.path,
          type: item.type,
          size: item.size,
          sha: item.sha,
          htmlUrl: item.html_url,
        })),
      };
    }

    const result = {
      type: data.type || 'file',
      name: data.name,
      path: data.path,
      size: data.size,
      sha: data.sha,
      htmlUrl: data.html_url,
      encoding: data.encoding || null,
      content: null,
    };

    if (data.encoding === 'base64' && typeof data.content === 'string') {
      try {
        result.content = Buffer.from(data.content, 'base64').toString('utf8');
      } catch (decodeError) {
        result.content = null;
        result.decodeError = 'Failed to decode file content as UTF-8';
      }
    } else if (typeof data.content === 'string') {
      result.content = data.content;
    } else if (data.download_url) {
      result.downloadUrl = data.download_url;
      result.content = null;
      result.note = 'File content not inlined (likely too large); use downloadUrl if needed';
    }

    return result;
  } catch (error) {
    if (error.code && error.statusCode) throw error;
    console.error(
      `Error fetching content for ${owner}/${repo}/${normalizedPath || '(root)'}:`,
      error.response?.status || error.message
    );
    throw toGitHubError(
      error,
      `Failed to fetch repository content for ${owner}/${repo}${normalizedPath ? ` at path "${normalizedPath}"` : ''}`
    );
  }
};

/**
 * GitHub write ops must use an explicit per-user access token.
 * The shared GITHUB_TOKEN must never create issues, PRs, or webhooks.
 */
function assertUserAuthorizedWrite(options = {}) {
  if (!options.userAccessToken || typeof options.userAccessToken !== 'string' || !options.userAccessToken.trim()) {
    const err = new Error(
      'GitHub write operations require explicit user authorization. The shared application token cannot create issues, pull requests, or webhooks.'
    );
    err.statusCode = 403;
    err.code = 'GITHUB_WRITE_FORBIDDEN';
    throw err;
  }
}

function userGithubHeaders(userAccessToken) {
  return {
    Authorization: `Bearer ${userAccessToken}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'RepoRadar',
  };
}

// Create an issue — requires options.userAccessToken (never uses shared GITHUB_TOKEN)
exports.createIssue = async (owner, repo, title, body, options = {}) => {
  assertUserAuthorizedWrite(options);
  try {
    const response = await axios.post(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      { title, body },
      { headers: userGithubHeaders(options.userAccessToken) }
    );
    return response.data;
  } catch (error) {
    console.error(`Error creating issue in ${owner}/${repo}:`, error.response?.status || error.message);
    throw toGitHubError(error, `Failed to create issue in ${owner}/${repo}`);
  }
};

// Get the default branch of a repository
exports.getDefaultBranch = async (owner, repo) => {
  try {
    const response = await githubApi.get(`/repos/${owner}/${repo}`);
    return response.data.default_branch;
  } catch (error) {
    console.error(`Error fetching default branch for ${owner}/${repo}:`, error.response?.data || error.message);
    throw new Error(`Failed to fetch default branch for ${owner}/${repo}`);
  }
};

// Get the latest commit contributors
exports.getLatestCommitContributors = async (owner, repo) => {
  try {
    const defaultBranch = await exports.getDefaultBranch(owner, repo);
    const response = await githubApi.get(
      `/repos/${owner}/${repo}/commits?sha=${defaultBranch}&per_page=1`
    );
    const latestCommit = response.data[0];
    const author = latestCommit.author?.login || latestCommit.commit.author.name;
    const committer = latestCommit.committer?.login || latestCommit.commit.committer.name;
    return { author, committer };
  } catch (error) {
    console.error(`Error fetching latest commit for ${owner}/${repo}:`, error.response?.data || error.message);
    throw new Error(`Failed to fetch latest commit for ${owner}/${repo}`);
  }
};

// Get all contributors (top 100)
exports.getAllContributors = async (owner, repo) => {
  try {
    const response = await githubApi.get(`/repos/${owner}/${repo}/contributors?per_page=100`);
    return response.data.map(c => ({
      login: c.login,
      contributions: c.contributions,
    }));
  } catch (error) {
    console.error(`Error fetching contributors for ${owner}/${repo}:`, error.response?.data || error.message);
    throw new Error(`Failed to fetch contributors for ${owner}/${repo}`);
  }
};

// Get detailed information about a repository
exports.getRepoTreeStructure = async (owner, repo, branch = 'master') => {
  try {
    // Debug: Log the request parameters
    console.log('Fetching repo structure for:', { owner, repo, branch });

    // First verify the repo exists
    const repoInfo = await githubApi.get(`/repos/${owner}/${repo}`);
    console.log('Repository found:', repoInfo.data.full_name);

    // Then verify the branch exists
    const branchInfo = await githubApi.get(`/repos/${owner}/${repo}/branches/${branch}`);
    console.log('Branch found:', branchInfo.data.name);

    // Now fetch the tree
    const response = await githubApi.get(
      `/repos/${owner}/${repo}/git/trees/${branchInfo.data.commit.sha}?recursive=true`
    );

    return {
      sha: response.data.sha,
      tree: response.data.tree,
      truncated: response.data.truncated || false,
    };
  } catch (error) {
    // Log status only — never request headers (may contain Authorization)
    console.error('GitHub tree request failed:', {
      status: error.response?.status,
      url: error.config?.url,
      method: error.config?.method,
    });

    let message = 'Failed to fetch repository structure';
    if (error.response?.status === 404) {
      if (error.response.data?.message.includes('Not Found')) {
        message = 'Repository or branch not found. Please verify:';
        message += `\n- Does https://github.com/${owner}/${repo}/tree/${branch} exist?`;
        message += `\n- Is your GitHub token valid and has repo access?`;
      }
    }

    throw new Error(`${message}\nTechnical details: ${error.message}`);
  }
};

// Create a pull request — requires options.userAccessToken (never uses shared GITHUB_TOKEN)
exports.createPullRequest = async (owner, repo, title, head, base, body, options = {}) => {
  assertUserAuthorizedWrite(options);
  try {
    const response = await axios.post(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      { title, head, base, body },
      { headers: userGithubHeaders(options.userAccessToken) }
    );
    return response.data;
  } catch (error) {
    console.error(`Error creating pull request in ${owner}/${repo}:`, error.response?.status || error.message);
    throw toGitHubError(error, `Failed to create pull request in ${owner}/${repo}`);
  }
};

// NEW: List open issues in a repository
exports.listOpenIssues = async (owner, repo) => {
  try {
    const response = await githubApi.get(`/repos/${owner}/${repo}/issues`, {
      params: {
        state: 'open', // Fetch only open issues
        per_page: 100, // Max 100 issues per page
      },
    });
    return response.data.map(issue => ({
      number: issue.number,
      title: issue.title,
      created_at: issue.created_at,
      user: issue.user.login,
    }));
  } catch (error) {
    console.error(`Error fetching open issues for ${owner}/${repo}:`, error.response?.data || error.message);
    throw new Error(`Failed to fetch open issues for ${owner}/${repo}`);
  }
};

// Create a webhook — requires options.userAccessToken (never uses shared GITHUB_TOKEN)
exports.createRepoWebhook = async (owner, repo, webhookUrl, events = ['push', 'pull_request'], options = {}) => {
  assertUserAuthorizedWrite(options);
  try {
    const response = await axios.post(
      `https://api.github.com/repos/${owner}/${repo}/hooks`,
      {
        name: 'web',
        active: true,
        events,
        config: {
          url: webhookUrl,
          content_type: 'json',
          insecure_ssl: '0',
        },
      },
      { headers: userGithubHeaders(options.userAccessToken) }
    );
    return response.data;
  } catch (error) {
    console.error(`Error creating webhook for ${owner}/${repo}:`, error.response?.status || error.message);
    throw toGitHubError(error, `Failed to create webhook for ${owner}/${repo}`);
  }
};

// NEW: Store repository data in MongoDB
exports.storeRepoData = async (owner, repo, data) => {
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection('repositories');

    const repoData = {
      owner,
      repo,
      data,
      updated_at: new Date(),
    };

    await collection.updateOne(
      { owner, repo },
      { $set: repoData },
      { upsert: true } // Insert if not exists
    );
    console.log(`Stored data for ${owner}/${repo} in MongoDB`);
    return repoData;
  } catch (error) {
    console.error(`Error storing repo data for ${owner}/${repo}:`, error.message);
    throw new Error(`Failed to store repository data for ${owner}/${repo}`);
  } finally {
    await client.close();
  }
};