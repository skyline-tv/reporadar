/**
 * Validate environment configuration at startup.
 * Required vars abort boot; optional vars log warnings.
 */
function validateEnv() {
  const required = ['MONGO_URI', 'JWT_SECRET'];
  const missing = required.filter((key) => !process.env[key] || !String(process.env[key]).trim());

  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        'Copy Backend/.env.example to Backend/.env and fill in values.'
    );
    process.exit(1);
  }

  const groqKey = process.env.GROQ_API_KEY || process.env.GROQ;
  if (!groqKey) {
    console.warn(
      'Warning: GROQ_API_KEY (or GROQ) is not set. Analysis and chat LLM calls will fail until configured.'
    );
  }

  if (!process.env.GITHUB_TOKEN) {
    console.warn(
      'Warning: GITHUB_TOKEN is not set. Public GitHub reads still work with lower rate limits; private repos will fail.'
    );
  }

  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGINS) {
    console.error(
      'CORS_ORIGINS is required in production so browsers can call the API from your frontend origin.'
    );
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET === 'change-me-to-a-long-random-string') {
    console.error('JWT_SECRET must be changed from the example default in production.');
    process.exit(1);
  }

  const flaskUrl = process.env.FLASK_ANALYZER_URL || 'http://localhost:5001';
  console.log(`Flask analyzer URL: ${flaskUrl}`);
}

module.exports = { validateEnv };
