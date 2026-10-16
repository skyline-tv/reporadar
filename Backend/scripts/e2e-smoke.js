/* eslint-disable no-console */
/**
 * Curl-friendly smoke helper. Prefer:
 *   API_BASE=http://127.0.0.1:5061 node scripts/e2e-smoke.js
 * Uses Node http (not undici fetch) for broader local Node compatibility.
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

const BASE = process.env.API_BASE || 'http://127.0.0.1:5061';

function request(method, path, { token, body } = {}) {
  const url = new URL(path, BASE);
  const lib = url.protocol === 'https:' ? https : http;
  const payload = body ? JSON.stringify(body) : null;
  const headers = { Accept: 'application/json' };
  if (payload) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = { raw };
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const email = `e2e_${Date.now()}@prodready.example`;
  const password = 'E2ePass123!';

  const signup = await request('POST', '/auth/signup', {
    body: { name: 'E2E', email, password },
  });
  const token = signup.json?.token;
  if (!token) throw new Error(`signup failed: ${JSON.stringify(signup.json)}`);
  console.log('PASS signup');

  const login = await request('POST', '/auth/login', {
    body: { email, password },
  });
  if (!login.json?.token) throw new Error(`login failed: ${JSON.stringify(login.json)}`);
  console.log('PASS login');

  const unauth = await request('GET', '/analysis/history');
  console.log(unauth.status === 401 ? 'PASS protected_history_unauth' : `FAIL unauth=${unauth.status}`);

  const anal = await request('POST', '/analysis/repository', {
    token,
    body: { repoUrl: 'https://github.com/octocat/Hello-World' },
  });
  console.log('analyze_http', anal.status, {
    success: anal.json?.success,
    message: anal.json?.message,
    id: anal.json?.data?.analysisId,
    status: anal.json?.data?.status,
    reportLen: (anal.json?.data?.report || '').length,
  });

  const id = anal.json?.data?.analysisId;
  if (anal.json?.success && id) {
    const det = await request('GET', `/analysis/${id}`, { token });
    console.log(
      det.json?.success && det.json?.data?.report
        ? 'PASS open_saved_report'
        : `FAIL open_saved_report ${JSON.stringify({ success: det.json?.success })}`
    );
  } else {
    console.log('FAIL analyze_repository');
  }

  const hist = await request('GET', '/analysis/history?page=1&limit=5', { token });
  console.log('history', {
    total: hist.json?.data?.total,
    statuses: (hist.json?.data?.items || []).map((i) => i.status),
  });
  console.log(hist.json?.success ? 'PASS history' : 'FAIL history');

  const chat = await request('POST', '/users/chat', {
    token,
    body: {
      question: 'What files are in this repository?',
      repoUrl: 'https://github.com/octocat/Hello-World',
    },
  });
  console.log('chat', {
    success: chat.json?.success,
    message: String(chat.json?.message || chat.json?.error || '').slice(0, 200),
  });

  const bad = await request('GET', '/analysis/history', { token: 'invalid' });
  console.log(bad.status === 401 ? 'PASS logout_invalid_token' : `FAIL bad_token=${bad.status}`);
}

main().catch((err) => {
  console.error('E2E fatal:', err);
  process.exit(1);
});
