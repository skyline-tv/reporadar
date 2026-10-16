const githubService = require('../services/githubService');
const { parseGitHubUrl, sanitizeRepoPath } = require('../services/chatService');

describe('GitHub URL / path helpers', () => {
  test('parseGitHubUrl accepts https and strips .git', () => {
    expect(parseGitHubUrl('https://github.com/facebook/react.git')).toEqual({
      owner: 'facebook',
      repo: 'react',
    });
  });

  test('parseGitHubUrl accepts ssh form', () => {
    expect(parseGitHubUrl('git@github.com:vercel/next.js.git')).toEqual({
      owner: 'vercel',
      repo: 'next.js',
    });
  });

  test('parseGitHubUrl rejects non-github hosts', () => {
    expect(() => parseGitHubUrl('https://gitlab.com/owner/repo')).toThrow(/Invalid GitHub/);
  });

  test('sanitizeRepoPath blocks traversal', () => {
    expect(() => sanitizeRepoPath('../etc/passwd')).toThrow(/Invalid repository path/);
    expect(sanitizeRepoPath('src/index.js')).toBe('src/index.js');
  });
});

describe('GitHub service input validation', () => {
  test('getRepoInfo requires owner and repo', async () => {
    await expect(githubService.getRepoInfo('', 'react')).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_INPUT',
    });
  });

  test('getRepoInfo maps API failures to typed errors', async () => {
    try {
      await githubService.getRepoInfo('octocat', `definitely-missing-${Date.now()}`);
      throw new Error('expected getRepoInfo to throw');
    } catch (error) {
      // Without GITHUB_TOKEN GitHub may return 403/429 instead of 404 for unknown repos
      expect(['NOT_FOUND', 'FORBIDDEN', 'RATE_LIMIT', 'GITHUB_API_ERROR']).toContain(error.code);
      expect(error.statusCode).toBeGreaterThanOrEqual(400);
      expect(String(error.message)).not.toMatch(/Bearer |ghp_|github_pat_/i);
    }
  });
});
