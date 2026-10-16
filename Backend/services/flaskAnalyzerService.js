/**
 * Client for the git_analyzer Flask sidecar.
 * URL and timeout come from environment so local/prod can switch without code changes.
 */

function getFlaskBaseUrl() {
  return (process.env.FLASK_ANALYZER_URL || 'http://localhost:5001').replace(/\/$/, '');
}

function getFlaskTimeoutMs() {
  const parsed = Number(process.env.FLASK_ANALYZER_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
}

/**
 * POST /analyze on the Flask service.
 * @param {string} repoUrl
 * @returns {Promise<object>}
 */
async function analyzeRepoWithFlask(repoUrl) {
  const baseUrl = getFlaskBaseUrl();
  const timeoutMs = getFlaskTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = new Error(`Flask analyzer responded with status ${response.status}`);
      err.code = 'FLASK_HTTP_ERROR';
      err.statusCode = response.status;
      throw err;
    }

    return await response.json();
  } catch (error) {
    if (error.code === 'FLASK_HTTP_ERROR') {
      throw error;
    }

    if (error.name === 'AbortError') {
      const err = new Error(`Flask analyzer timed out after ${timeoutMs}ms (${baseUrl})`);
      err.code = 'FLASK_TIMEOUT';
      throw err;
    }

    const message = error.message || String(error);
    if (
      error.code === 'ECONNREFUSED' ||
      error.cause?.code === 'ECONNREFUSED' ||
      /fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|network/i.test(message)
    ) {
      const err = new Error(`Flask analyzer unavailable at ${baseUrl}`);
      err.code = 'FLASK_UNAVAILABLE';
      throw err;
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lightweight readiness probe for the Flask sidecar.
 */
async function checkFlaskHealth() {
  const baseUrl = getFlaskBaseUrl();
  const timeoutMs = Math.min(getFlaskTimeoutMs(), 3000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      url: baseUrl,
    };
  } catch (error) {
    return {
      ok: false,
      url: baseUrl,
      error: error.name === 'AbortError' ? 'timeout' : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  analyzeRepoWithFlask,
  getFlaskBaseUrl,
  getFlaskTimeoutMs,
  checkFlaskHealth,
};
