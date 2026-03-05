# ISS-3: Endpoints require `/v1/` prefix (undocumented)

**Severity:** Blocker
**Found:** 2026-03-05
**Time lost:** ~20 min

## Problem

Even after finding the correct domain (`api.stackai.com`), most endpoints require a `/v1/` prefix not mentioned in the notebook:

- Notebook: `GET /connections` → 404
- Actual: `GET /v1/connections` → 200

**Exception:** `/organizations/me/current` works WITHOUT `/v1/` prefix.

## Fix

Added `/v1/` prefix to all BFF routes except the organizations endpoint:

- `/v1/connections`
- `/v1/connections/{id}/resources/children`
- `/v1/knowledge_bases`
- `/v1/knowledge_bases/sync/trigger/{kbId}/{orgId}`
- `/v1/knowledge_bases/{id}/resources/children`
