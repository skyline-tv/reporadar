const mongoose = require('mongoose');
const { getFlaskBaseUrl, getFlaskTimeoutMs } = require('./flaskAnalyzerService');
const groqService = require('./groqService');

async function checkMongo() {
  const state = mongoose.connection.readyState;
  // 1 = connected
  if (state === 1) {
    return { status: 'ok', readyState: state };
  }
  return { status: 'degraded', readyState: state };
}

async function checkFlask() {
  const baseUrl = getFlaskBaseUrl();
  const timeoutMs = Math.min(getFlaskTimeoutMs(), 3000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    if (response.ok) {
      const body = await response.json().catch(() => ({}));
      return { status: 'ok', url: baseUrl, details: body };
    }
    return { status: 'degraded', url: baseUrl, httpStatus: response.status };
  } catch (error) {
    return {
      status: 'unavailable',
      url: baseUrl,
      code: error.name === 'AbortError' ? 'TIMEOUT' : 'UNAVAILABLE',
      message: error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function getHealthReport() {
  const [mongo, flask] = await Promise.all([checkMongo(), checkFlask()]);
  const groqConfigured = typeof groqService.isGroqConfigured === 'function'
    ? groqService.isGroqConfigured()
    : Boolean(process.env.GROQ_API_KEY || process.env.GROQ);

  const healthy = mongo.status === 'ok';
  return {
    status: healthy ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    checks: {
      mongo,
      flask,
      groq: {
        status: groqConfigured ? 'configured' : 'missing',
      },
      githubToken: {
        status: process.env.GITHUB_TOKEN ? 'configured' : 'optional_missing',
      },
    },
  };
}

module.exports = {
  checkMongo,
  checkFlask,
  getHealthReport,
};
