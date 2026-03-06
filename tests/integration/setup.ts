import { resolve } from 'path';

import { config } from 'dotenv';

// Load .env.local — same vars that the Next.js BFF uses at runtime.
// Must run before any test file imports helpers that read process.env.
config({ path: resolve(process.cwd(), '.env.local') });

// Bridge STACK_AI_* → TEST_* so a plain .env.local (no TEST_ prefix) works
// without modification. Explicit TEST_* vars always take priority.
const fallbacks: Record<string, string> = {
  TEST_EMAIL: 'STACK_AI_EMAIL',
  TEST_PASSWORD: 'STACK_AI_PASSWORD',
  TEST_SUPABASE_ANON_KEY: 'STACK_AI_SUPABASE_ANON_KEY',
  TEST_SUPABASE_URL: 'STACK_AI_SUPABASE_URL',
  TEST_API_BASE_URL: 'STACK_AI_BASE_URL',
};
for (const [testKey, appKey] of Object.entries(fallbacks)) {
  if (!process.env[testKey] && process.env[appKey]) {
    process.env[testKey] = process.env[appKey];
  }
}
