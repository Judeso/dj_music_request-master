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
  return url;
}

const rawUrl = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
const DB_URL = sanitizeDbUrl(rawUrl);

export const sql = neon(DB_URL);
// Database connection with fallback environment variable and URL sanitization
