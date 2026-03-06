/**
 * Integration tests: Supabase authentication endpoint.
 *
 * No known doc bugs for auth — this file establishes a baseline
 * that auth works and tokens have the expected shape.
 *
 * Required env vars: TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY,
 *                    TEST_EMAIL, TEST_PASSWORD, TEST_API_BASE_URL
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { getAuthHeaders, ACTUAL_BASE_URL } from './_helpers';

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key} — set it in .env.local`);
  return val;
}

const SUPABASE_URL = requireEnv('TEST_SUPABASE_URL');
const SUPABASE_ANON_KEY = requireEnv('TEST_SUPABASE_ANON_KEY');

describe('Auth — POST /auth/v1/token?grant_type=password', () => {
  it('returns 200 with access_token for valid credentials', async () => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({
        email: process.env.TEST_EMAIL,
        password: process.env.TEST_PASSWORD,
        gotrue_meta_security: {},
      }),
    });

    expect(res.status).toBe(200);

    const json = (await res.json()) as Record<string, unknown>;
    expect(typeof json['access_token']).toBe('string');
    expect((json['access_token'] as string).length).toBeGreaterThan(0);
    expect(json['token_type']).toBe('bearer');
    expect(typeof json['expires_in']).toBe('number');
    expect(typeof json['refresh_token']).toBe('string');
  });

  it('returns non-2xx for wrong password', async () => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({
        email: process.env.TEST_EMAIL,
        password: 'definitely-wrong-password-xyz',
        gotrue_meta_security: {},
      }),
    });

    expect(res.ok).toBe(false);
  });

  it('returns non-2xx for missing Apikey header', async () => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.TEST_EMAIL,
        password: process.env.TEST_PASSWORD,
        gotrue_meta_security: {},
      }),
    });

    expect(res.ok).toBe(false);
  });
});

describe('Auth — token reuse', () => {
  let headers: { Authorization: string };

  beforeAll(async () => {
    headers = await getAuthHeaders();
  });

  it('obtained token is accepted by /organizations/me/current', async () => {
    // Quick sanity check: token from Supabase works against the real API
    const res = await fetch(`${ACTUAL_BASE_URL}/organizations/me/current`, { headers });
    expect(res.status).toBe(200);
  });
});
