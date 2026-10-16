const sanitize = require('sanitize-html');
const githubService = require('./githubService');
const groqService = require('./groqService');
const { analyzeRepoWithFlask } = require('./flaskAnalyzerService');

const READ_TOOLS = new Set([
  'getrepoinfo',
  'getrecentcommits',
  'getlatestcommitcontributors',
  'getallcontributors',
  'getcodestructure',
  'getrepocontent',
  'listopenissues',
  'notool',
]);

const WRITE_TOOLS = new Set([
  'createissue',
  'createpullrequest',
  'createrepowebhook',
]);

const WRITE_DENIED = {
  authorized: false,
  requiresUserAuthorization: true,
  message:
    'GitHub write operations (issues, pull requests, webhooks) require explicit user authorization and cannot be performed with the shared application token.',
};

const TOOL_ALIASES = {
  repoinfo: 'getrepoinfo',
  repositoryinfo: 'getrepoinfo',
  info: 'getrepoinfo',
  metadata: 'getrepoinfo',
  commits: 'getrecentcommits',
  recentcommits: 'getrecentcommits',
  getcommits: 'getrecentcommits',
  contributors: 'getallcontributors',
  allcontributors: 'getallcontributors',
  structure: 'getcodestructure',
  codestructure: 'getcodestructure',
  treestructure: 'getcodestructure',
  files: 'getrepocontent',
  file: 'getrepocontent',
  content: 'getrepocontent',
  directory: 'getrepocontent',
  folder: 'getrepocontent',
  issues: 'listopenissues',
  openissues: 'listopenissues',
  none: 'notool',
  general: 'notool',
};

function sanitizeText(value) {
  return sanitize(String(value || ''), { allowedTags: [], allowedAttributes: {} }).trim();
}

/**
 * Parse owner/repo from common GitHub URL forms (https, www, .git, tree/blob paths, ssh).
 */
function parseGitHubUrl(url) {
  if (!url || typeof url !== 'string') {
    const err = new Error('Repository URL is required');
    err.statusCode = 400;
    err.code = 'INVALID_REPO_URL';
    throw err;
  }

  const trimmed = url.trim();
  const withoutQuery = trimmed.split(/[?#]/)[0].replace(/\/+$/, '');

  let owner;
  let repo;

  const sshMatch = withoutQuery.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (sshMatch) {
    owner = sshMatch[1];
    repo = sshMatch[2];
  } else {
    const httpsMatch = withoutQuery.match(
      /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+)/i
    );
    if (!httpsMatch) {
      const err = new Error(
        'Invalid GitHub repository URL. Expected format: https://github.com/owner/repo'
      );
      err.statusCode = 400;
      err.code = 'INVALID_REPO_URL';
      throw err;
    }
    owner = httpsMatch[1];
    repo = httpsMatch[2];
  }

  repo = repo.replace(/\.git$/i, '');

  if (!owner || !repo || owner === '.' || repo === '.') {
    const err = new Error('Could not identify repository owner and name from URL');
    err.statusCode = 400;
    err.code = 'INVALID_REPO_URL';
    throw err;
  }

  return {
    owner: sanitizeText(owner),
    repo: sanitizeText(repo),
  };
}

function sanitizeRepoPath(pathValue) {
  if (pathValue == null || pathValue === '') return '';
  const cleaned = String(pathValue)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .trim();

  if (!cleaned) return '';
  if (cleaned.includes('..') || cleaned.includes('\0')) {
    const err = new Error('Invalid repository path');
    err.statusCode = 400;
    err.code = 'INVALID_PATH';
    throw err;
  }
  return cleaned.slice(0, 500);
}

function normalizeToolName(raw) {
  if (!raw) return 'notool';
  let value = String(raw).toLowerCase().trim();
  value = value.replace(/[^a-z0-9_]/g, '');
  if (WRITE_TOOLS.has(value)) return value;
  if (READ_TOOLS.has(value)) return value;
  if (TOOL_ALIASES[value]) return TOOL_ALIASES[value];
  return null;
}

function extractJsonObject(text) {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function selectTool(question, owner, repo) {
  const systemPrompt = `You select ONE read-only GitHub tool for answering a question about a repository.
Allowed tools only:
- getRepoInfo: stars, description, language, forks, branches, metadata
- getRecentCommits: recent commit history
- getLatestCommitContributors: authors of the latest commit
- getAllContributors: contributor list
- getCodeStructure: top-level or overall file/folder structure
- getRepoContent: a specific file or nested folder (include "path")
- listOpenIssues: open issues
- noTool: general question that does not need live GitHub data

Never choose createIssue, createPullRequest, or createRepoWebhook.
Respond with JSON only, no markdown:
{"tool":"getRepoInfo","path":""}
If a specific file or nested folder is mentioned, use getRepoContent and set path.`;

  const userPrompt = `Repository: ${owner}/${repo}
Question: ${question}`;

  let raw;
  try {
    raw = await groqService.queryLLM(userPrompt, { systemPrompt, temperature: 0 });
  } catch (err) {
    // Fail closed to a safe default tool rather than crashing chat
    if (err.code === 'GROQ_NOT_CONFIGURED' || err.code === 'GROQ_TIMEOUT') throw err;
    console.error('Tool selection LLM failed:', err.message);
    return { tool: 'getrepoinfo', path: '' };
  }

  const parsed = extractJsonObject(raw);
  let tool = 'notool';
  let path = '';

  if (parsed && typeof parsed === 'object') {
    tool = normalizeToolName(parsed.tool || parsed.name || parsed.selectedTool) || 'notool';
    path = sanitizeRepoPath(parsed.path || parsed.file || parsed.directory || '');
  } else {
    const fallback = normalizeToolName(raw);
    tool = fallback || 'getrepoinfo';
  }

  if (WRITE_TOOLS.has(tool)) {
    return { tool, path: '' };
  }
  if (!READ_TOOLS.has(tool)) {
    tool = 'notool';
  }

  return { tool, path };
}

async function executeReadTool(tool, owner, repo, repoUrl, path) {
  switch (tool) {
    case 'getrepoinfo': {
      const repoInfo = await githubService.getRepoInfo(owner, repo);
      try {
        const flaskData = await analyzeRepoWithFlask(repoUrl);
        return {
          label: 'Repository Information',
          data: { ...repoInfo, analysis: flaskData },
        };
      } catch (flaskError) {
        console.error('Flask enrichment skipped:', flaskError.code || flaskError.message);
        return { label: 'Repository Information', data: repoInfo };
      }
    }
    case 'getrecentcommits':
      return {
        label: 'Recent Commits',
        data: await githubService.getRecentCommits(owner, repo, { perPage: 10 }),
      };
    case 'getlatestcommitcontributors':
      return {
        label: 'Latest Commit Contributors',
        data: await githubService.getLatestCommitContributors(owner, repo),
      };
    case 'getallcontributors':
      return {
        label: 'All Contributors',
        data: await githubService.getAllContributors(owner, repo),
      };
    case 'getcodestructure': {
      try {
        const flaskData = await analyzeRepoWithFlask(repoUrl);
        return { label: 'Code Structure', data: flaskData };
      } catch (error) {
        console.error('Flask structure failed:', error.code || error.message);
        return {
          label: 'Code Structure',
          data: await githubService.getRepoContent(owner, repo, path || ''),
        };
      }
    }
    case 'getrepocontent':
      return {
        label: path ? `Repository Path: ${path}` : 'Repository Root Contents',
        data: await githubService.getRepoContent(owner, repo, path || ''),
      };
    case 'listopenissues':
      return {
        label: 'Open Issues',
        data: await githubService.listOpenIssues(owner, repo),
      };
    case 'notool':
    default:
      return {
        label: 'General Question',
        data: {
          message: 'No live GitHub data fetch was required for this question.',
          repository: `${owner}/${repo}`,
        },
      };
  }
}

function formatSessionHistory(sessionMessages = []) {
  if (!Array.isArray(sessionMessages)) return [];
  return sessionMessages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-8)
    .map((m) => ({
      role: m.role,
      content: sanitizeText(String(m.content)).slice(0, 2000),
    }));
}

async function generateAnswer({
  question,
  owner,
  repo,
  dataLabel,
  githubData,
  sessionMessages,
}) {
  const systemPrompt = `You are RepoRadar, a careful GitHub repository assistant.
Rules you MUST follow:
1. Answer ONLY using the provided repository data and session context.
2. Never invent files, functions, folders, commits, authors, stars, or issues.
3. If the data does not contain the answer, say clearly that the information is unavailable from the fetched data.
4. Be concise and specific. Reference ${owner}/${repo} when relevant.
5. Do not claim you performed write actions (issues, PRs, webhooks).
6. Return plain text only (no JSON wrapper).`;

  const historyText = formatSessionHistory(sessionMessages)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  const dataText = JSON.stringify(githubData, null, 2);
  const truncatedData =
    dataText.length > 12000 ? `${dataText.slice(0, 12000)}\n...[truncated]` : dataText;

  const userPrompt = `Repository: ${owner}/${repo}
Data type: ${dataLabel}

Fetched repository data:
${truncatedData}

Recent session messages:
${historyText || '(none)'}

User question: ${question}

Write the best accurate answer now.`;

  const answer = await groqService.queryLLM(userPrompt, {
    systemPrompt,
    temperature: 0.2,
    maxTokens: 1024,
  });

  return String(answer || '').trim();
}

/**
 * Full chat turn: parse URL → select tool → fetch GitHub data → answer with Groq.
 */
async function processChatTurn({
  question,
  repoUrl,
  additionalParams = {},
  sessionMessages = [],
}) {
  const sanitizedQuestion = sanitizeText(question);
  if (!sanitizedQuestion) {
    const err = new Error('Question is required');
    err.statusCode = 400;
    err.code = 'INVALID_QUESTION';
    throw err;
  }
  if (sanitizedQuestion.length > 4000) {
    const err = new Error('Question is too long');
    err.statusCode = 400;
    err.code = 'INVALID_QUESTION';
    throw err;
  }

  const { owner, repo } = parseGitHubUrl(repoUrl);
  const paramPath = sanitizeRepoPath(additionalParams.path);

  const selection = await selectTool(sanitizedQuestion, owner, repo);
  let selectedTool = selection.tool;
  let path = paramPath || selection.path || '';

  let dataLabel = '';
  let githubData = null;

  if (WRITE_TOOLS.has(selectedTool)) {
    dataLabel = 'Authorization Required';
    githubData = WRITE_DENIED;
  } else {
    // Never execute unknown tools
    if (!READ_TOOLS.has(selectedTool)) {
      selectedTool = 'notool';
    }
    const result = await executeReadTool(selectedTool, owner, repo, repoUrl.trim(), path);
    dataLabel = result.label;
    githubData = result.data;
  }

  const message = await generateAnswer({
    question: sanitizedQuestion,
    owner,
    repo,
    dataLabel,
    githubData,
    sessionMessages,
  });

  return {
    message,
    selectedTool,
    dataLabel,
    owner,
    repo,
    path: path || undefined,
    githubData,
  };
}

module.exports = {
  parseGitHubUrl,
  sanitizeRepoPath,
  normalizeToolName,
  selectTool,
  executeReadTool,
  processChatTurn,
  READ_TOOLS,
  WRITE_TOOLS,
  WRITE_DENIED,
};
