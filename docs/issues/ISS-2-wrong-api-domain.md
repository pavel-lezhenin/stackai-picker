# ISS-2: API base URL in assignment notebook is wrong

**Severity:** Blocker
**Found:** 2026-03-05
**Time lost:** ~1 hour

## Problem

The provided Jupyter notebook (`knowledge_base_workflow.ipynb`) uses `https://api.stack-ai.com` as the API base URL. This domain:

- Returns a generic welcome page on `/`
- Returns `{"detail":"Not Found"}` on every documented endpoint
- Is not the production API used by the Stack AI dashboard

## Discovery

Logged into `https://www.stackai.com/dashboard/connections` with the test credentials, opened browser DevTools → Network tab, and observed actual API calls going to a different domain.

**Actual production API:** `https://api.stackai.com` (no hyphen between "stack" and "ai")

## Fix

Updated `STACK_AI_BASE_URL` in `.env.local`:

```diff
- STACK_AI_BASE_URL=https://api.stack-ai.com
+ STACK_AI_BASE_URL=https://api.stackai.com
```
