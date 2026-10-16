/**
 * Backend API base URL.
 * Local:  NEXT_PUBLIC_API_URL=http://localhost:5050
 *         (avoid 5000 / AirPlay; avoid 5061 / Chrome ERR_UNSAFE_PORT)
 * Prod:   NEXT_PUBLIC_API_URL=https://your-backend.example.com
 *
 * Only NEXT_PUBLIC_* values are exposed to the browser.
 * Never put GROQ_API_KEY, JWT_SECRET, or GITHUB_TOKEN here.
 */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'
).replace(/\/$/, '');

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}
