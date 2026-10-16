const request = require('supertest');
const connectDB = require('../config/db');

describe('API error handling', () => {
  let app;

  beforeAll(async () => {
    await connectDB();
    app = require('../app');
  });

  test('unknown routes return 404 JSON', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('health endpoint responds', async () => {
    const res = await request(app).get('/api/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body.timestamp).toBeTruthy();
    expect(res.body.checks).toBeTruthy();
    expect(res.body.checks.mongo).toBeTruthy();
  });

  test('malformed bearer token returns 401', async () => {
    const res = await request(app)
      .get('/analysis/history')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });
});
