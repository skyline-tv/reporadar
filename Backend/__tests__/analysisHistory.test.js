const request = require('supertest');
const connectDB = require('../config/db');
const User = require('../models/User');
const Analysis = require('../models/Analysis');
const { recoverStaleAnalyses } = require('../services/analysisRecoveryService');

describe('Analysis ownership, history, and stale recovery', () => {
  let app;
  let userA;
  let userB;
  let tokenA;
  let tokenB;

  async function signup(prefix) {
    const email = `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}@hist-test.example`;
    const res = await request(app).post('/auth/signup').send({
      name: prefix,
      email,
      password: 'SecurePass123!',
    });
    return { email, token: res.body.token, id: res.body.user._id };
  }

  beforeAll(async () => {
    await connectDB();
    app = require('../app');
    userA = await signup('owner');
    userB = await signup('other');
    tokenA = userA.token;
    tokenB = userB.token;
  });

  afterAll(async () => {
    await Analysis.deleteMany({
      userId: { $in: [userA.id, userB.id] },
    });
    await User.deleteMany({ email: /@hist-test\.example$/ });
  });

  test('history is empty for a new user', async () => {
    const res = await request(app)
      .get('/analysis/history')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  test('owner can read own report; other user is forbidden', async () => {
    const doc = await Analysis.create({
      userId: userA.id,
      repoUrl: 'https://github.com/facebook/react',
      owner: 'facebook',
      repo: 'react',
      status: 'completed',
      report: '## Executive Summary\nTest report',
      metadata: { projectType: 'javascript' },
    });

    const ok = await request(app)
      .get(`/analysis/${doc._id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.report).toContain('Executive Summary');

    const forbidden = await request(app)
      .get(`/analysis/${doc._id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
  });

  test('unauthenticated history is rejected', async () => {
    const res = await request(app).get('/analysis/history');
    expect(res.status).toBe(401);
  });

  test('invalid analysis id returns 400', async () => {
    const res = await request(app)
      .get('/analysis/not-an-object-id')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(400);
  });

  test('stale pending/processing jobs are recovered as failed', async () => {
    const stale = await Analysis.create({
      userId: userA.id,
      repoUrl: 'https://github.com/vercel/next.js',
      owner: 'vercel',
      repo: 'next.js',
      status: 'processing',
    });
    // Force old updatedAt
    await Analysis.collection.updateOne(
      { _id: stale._id },
      { $set: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) } }
    );

    const recovered = await recoverStaleAnalyses();
    expect(recovered).toBeGreaterThanOrEqual(1);

    const refreshed = await Analysis.findById(stale._id);
    expect(refreshed.status).toBe('failed');
    expect(refreshed.errorCode).toBe('STALE_JOB');
  });

  test('pagination metadata is returned', async () => {
    const res = await request(app)
      .get('/analysis/history?page=1&limit=5')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      page: 1,
      limit: 5,
    });
    expect(typeof res.body.data.total).toBe('number');
    expect(typeof res.body.data.totalPages).toBe('number');
  });
});
