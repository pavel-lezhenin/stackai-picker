# ISS-6: Sync endpoint — wrong domain caused 404, not wrong path

**Severity:** Blocker  
**Found:** 2026-03-05  
**Time lost:** ~20 min

## Problem

The notebook documents the sync trigger as:

```
GET /knowledge_bases/sync/trigger/{knowledge_base_id}/{org_id}
```

This returned 404 during development. The initial diagnosis attributed this to wrong path structure and HTTP method, but integration tests later disproved that.

## Corrected Root Cause Analysis

Integration tests (see `tests/integration/api/knowledge-bases.test.ts`, ISS-6 block) confirmed:

- `GET /knowledge_bases/sync/trigger/{kbId}/{orgId}` on `api.stackai.com` → **202** — the legacy endpoint is alive
- `POST /v1/knowledge-bases/{kbId}/sync?org_id={orgId}` on `api.stackai.com` → **202** — the new endpoint also works

**The 404s seen during development were caused by ISS-2 (wrong domain) and ISS-5 (KB created on wrong domain, resulting in an invalid KB ID).** When sync was attempted, the KB ID did not exist on the correct domain, causing every URL variant to return 404 regardless of path structure.

## What the Docs Actually Get Wrong

|                | Documented                     | Actual                                                |
| -------------- | ------------------------------ | ----------------------------------------------------- |
| Domain         | `api.stack-ai.com` (hyphen)    | `api.stackai.com` (no hyphen) — **ISS-2**             |
| `/v1/` prefix  | absent                         | required — **ISS-3**                                  |
| HTTP method    | `GET`                          | both `GET` (legacy) and `POST` (new) work             |
| Path structure | `/sync/trigger/{kbId}/{orgId}` | legacy path works; new path is `/{kbId}/sync?org_id=` |

## Fix Applied

Updated BFF `src/app/api/knowledge-bases/[kbId]/sync/route.ts` and client `src/hooks/useKnowledgeBase.ts` to use the modern REST convention — `POST /v1/knowledge-bases/{kbId}/sync?org_id={orgId}` — which is semantically correct (sync creates a background task, it is a mutation not a read) even though the legacy GET endpoint still responds.

Successful upstream response:

```json
{
  "message": "Synchronization task started for knowledge base {uuid}",
  "status": "accepted"
}
```
