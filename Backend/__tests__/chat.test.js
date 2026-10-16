const request = require('supertest');
const connectDB = require('../config/db');
const User = require('../models/User');
const chatService = require('../services/chatService');

describe('AI chat API and tool policy', () => {
  let app;
  let token;

  beforeAll(async () => {
    await connectDB();
    app = require('../app');
    const email = `chat_${Date.now()}@chat-test.example`;
    const signup = await request(app).post('/auth/signup').send({
      name: 'Chat Tester',
      email,
      password: 'SecurePass123!',
    });
    token = signup.body.token;
  });

  afterAll(async () => {
    await User.deleteMany({ email: /@chat-test\.example$/ });
  });

  test('chat requires authentication', async () => {
    const res = await request(app).post('/users/chat').send({
      question: 'What is this repo?',
      repoUrl: 'https://github.com/facebook/react',
    });
    expect(res.status).toBe(401);
  });

  test('chat rejects missing repoUrl', async () => {
    const res = await request(app)
      .post('/users/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'Hello' });
    expect([400, 500]).toContain(res.status);
  });

  test('write tools are denied without user authorization', () => {
    expect(chatService.WRITE_DENIED.authorized).toBe(false);
    expect(chatService.WRITE_TOOLS.has('createissue')).toBe(true);
  });

  test('normalizeToolName maps aliases', () => {
    expect(chatService.normalizeToolName('commits')).toBe('getrecentcommits');
    expect(chatService.normalizeToolName('structure')).toBe('getcodestructure');
  });
});
