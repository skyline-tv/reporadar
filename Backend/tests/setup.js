process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-reporadar';
process.env.JWT_EXPIRES_IN = '1h';
process.env.MONGO_URI =
  process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/reporadar_test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:3000';
process.env.FLASK_ANALYZER_URL =
  process.env.FLASK_ANALYZER_URL || 'http://127.0.0.1:59999';
process.env.FLASK_ANALYZER_TIMEOUT_MS = '500';
process.env.ANALYSIS_STALE_MS = process.env.ANALYSIS_STALE_MS || '1000';
process.env.RATE_LIMIT_MAX = '10000';
process.env.AUTH_RATE_LIMIT_MAX = '10000';

jest.setTimeout(45000);
