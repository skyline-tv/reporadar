const request = require('supertest');
const connectDB = require('../config/db');
const User = require('../models/User');

describe('Authentication API', () => {
  let app;

  beforeAll(async () => {
    await connectDB();
    app = require('../app');
  });

  afterAll(async () => {
    await User.deleteMany({ email: /@auth-test\.example$/ });
  });

  const uniqueEmail = () => `user_${Date.now()}_${Math.random().toString(16).slice(2)}@auth-test.example`;

  test('signup requires all fields', async () => {
    const res = await request(app).post('/auth/signup').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  test('signup + login returns JWT and never leaks password hash', async () => {
    const email = uniqueEmail();
    const signup = await request(app).post('/auth/signup').send({
      name: 'Auth Tester',
      email,
      password: 'SecurePass123!',
    });
    expect(signup.status).toBe(201);
    expect(signup.body.token).toBeTruthy();
    expect(signup.body.user).toBeTruthy();
    expect(signup.body.user.password).toBeUndefined();

    const login = await request(app).post('/auth/login').send({
      email,
      password: 'SecurePass123!',
    });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    expect(login.body.user.password).toBeUndefined();
  });

  test('login rejects invalid password', async () => {
    const email = uniqueEmail();
    await request(app).post('/auth/signup').send({
      name: 'Auth Tester',
      email,
      password: 'SecurePass123!',
    });

    const res = await request(app).post('/auth/login').send({
      email,
      password: 'wrong-password',
    });
    expect(res.status).toBe(400);
  });

  test('duplicate signup is rejected', async () => {
    const email = uniqueEmail();
    const payload = { name: 'Dup', email, password: 'SecurePass123!' };
    expect((await request(app).post('/auth/signup').send(payload)).status).toBe(201);
    const dup = await request(app).post('/auth/signup').send(payload);
    expect(dup.status).toBe(400);
  });
});
