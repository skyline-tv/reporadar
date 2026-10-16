const Groq = require('groq-sdk');
require('dotenv').config();

const MODEL = process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

let groqClient = null;

function getGroqApiKey() {
  return process.env.GROQ_API_KEY || process.env.GROQ || '';
}

function getGroqTimeoutMs() {
  const parsed = Number(process.env.GROQ_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

/**
 * Lazy client init so importing this module does not crash the whole app
 * when GROQ_API_KEY is missing. Failures surface only when queryLLM is called.
 */
function getGroqClient() {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    const err = new Error(
      'GROQ_API_KEY is not configured. Set GROQ_API_KEY (or GROQ) in the Backend environment.'
    );
    err.statusCode = 503;
    err.code = 'GROQ_NOT_CONFIGURED';
    throw err;
  }

  if (!groqClient) {
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

exports.isGroqConfigured = () => Boolean(getGroqApiKey());

/**
 * @param {string} prompt
 * @param {{ systemPrompt?: string, temperature?: number, maxTokens?: number, timeoutMs?: number }} [options]
 */
exports.queryLLM = async (prompt, options = {}) => {
  try {
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt must be a non-empty string');
    }

    const groq = getGroqClient();
    const timeoutMs = options.timeoutMs || getGroqTimeoutMs();
    const messages = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const completionPromise = groq.chat.completions.create({
      model: MODEL,
      messages,
      temperature: typeof options.temperature === 'number' ? options.temperature : 0.7,
      max_tokens: options.maxTokens || 1024,
    });

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const err = new Error(`Groq request timed out after ${timeoutMs}ms`);
        err.statusCode = 504;
        err.code = 'GROQ_TIMEOUT';
        reject(err);
      }, timeoutMs);
    });

    let completion;
    try {
      completion = await Promise.race([completionPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!completion?.choices?.[0]?.message?.content) {
      throw new Error('Invalid response structure from Groq API');
    }

    return completion.choices[0].message.content.trim();
  } catch (err) {
    if (err.code === 'GROQ_NOT_CONFIGURED' || err.code === 'GROQ_TIMEOUT') {
      throw err;
    }

    console.error('Groq API Error:', {
      message: err.message,
      status: err.status,
    });

    const wrapped = new Error(`Failed to query Groq LLM: ${err.message}`);
    wrapped.statusCode = err.statusCode || err.status || 500;
    wrapped.code = err.code || 'GROQ_ERROR';

    if (/ENOTFOUND|ECONNREFUSED|fetch failed|network/i.test(err.message || '')) {
      wrapped.code = 'GROQ_UNAVAILABLE';
      wrapped.statusCode = 503;
      wrapped.message = 'Groq service is unavailable. Please try again later.';
    }

    throw wrapped;
  }
};
