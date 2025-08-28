import { neon } from '@netlify/neon';

function sanitizeDbUrl(raw) {
  if (!raw) return raw;
  let url = String(raw).trim();
  // Handle copy-paste like: psql 'postgresql://user:pass@host/db?sslmode=require'
  if (url.startsWith('psql ')) {
    // Extract quoted part if present
    const match = url.match(/psql\s+'([^']+)'/);
    if (match && match[1]) url = match[1]; else url = url.replace(/^psql\s+/i, '').trim();
  }
  // Remove surrounding quotes
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1);
  }
  // Normalize scheme: postgresql:// -> postgres://
  url = url.replace(/^postgresql:\/\//i, 'postgres://');
  // Remove unsupported query params like channel_binding=...
  try {
    const u = new URL(url);
    if (u.searchParams.has('channel_binding')) {
      u.searchParams.delete('channel_binding');
    }
    url = u.toString();
  } catch (_) {
    // If URL constructor fails, keep original; neon() will throw with a clearer message
  }
  return url;
}

const rawUrl = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
const DB_URL = sanitizeDbUrl(rawUrl);

export const sql = neon(DB_URL);
// Database connection with fallback environment variable and URL sanitization
