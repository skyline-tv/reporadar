const fs = require('fs-extra');
const path = require('path');
const repoAnalysisService = require('../services/repoAnalysisService');

describe('Repository analysis service safety', () => {
  test('parseGitUrl normalizes to https clone URL', () => {
    const parsed = repoAnalysisService.parseGitUrl('https://github.com/sindresorhus/is.git');
    expect(parsed).toEqual({
      owner: 'sindresorhus',
      repo: 'is',
      cloneUrl: 'https://github.com/sindresorhus/is.git',
    });
  });

  test('cleanupTempDirectory removes a directory', async () => {
    const tempRoot = path.join(__dirname, '../temp_repos');
    const target = path.join(tempRoot, `owner-repo-${Date.now()}`);
    await fs.ensureDir(target);
    await fs.writeFile(path.join(target, 'marker.txt'), 'x');
    expect(await fs.pathExists(target)).toBe(true);
    await repoAnalysisService.cleanupTempDirectory(target);
    expect(await fs.pathExists(target)).toBe(false);
  });

  test('analyzeRepository rejects invalid URLs before cloning', async () => {
    await expect(repoAnalysisService.analyzeRepository('not-a-url')).rejects.toBeTruthy();
  });
});

describe('Analysis API validation', () => {
  const request = require('supertest');
  const connectDB = require('../config/db');
  const User = require('../models/User');
  let app;
  let token;

  beforeAll(async () => {
    await connectDB();
    app = require('../app');
    const email = `analysis_${Date.now()}@analysis-test.example`;
    const signup = await request(app).post('/auth/signup').send({
      name: 'Analysis Tester',
      email,
      password: 'SecurePass123!',
    });
    token = signup.body.token;
  });

  afterAll(async () => {
    await User.deleteMany({ email: /@analysis-test\.example$/ });
  });

  test('POST /analysis/repository rejects invalid URL', async () => {
    const res = await request(app)
      .post('/analysis/repository')
      .set('Authorization', `Bearer ${token}`)
      .send({ repoUrl: 'https://example.com/not-github' });
    expect(res.status).toBe(400);
  });

  test('POST /analysis/repository requires auth', async () => {
    const res = await request(app)
      .post('/analysis/repository')
      .send({ repoUrl: 'https://github.com/facebook/react' });
    expect(res.status).toBe(401);
  });
});
