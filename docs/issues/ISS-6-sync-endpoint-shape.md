# ISS-6: Sync endpoint path, method, and parameter placement are all wrong in docs

**Severity:** Blocker  
**Found:** 2026-03-05  
**Time lost:** ~20 min

## Problem

The notebook documents the sync trigger as:

```
GET /knowledge_bases/sync/trigger/{knowledge_base_id}/{org_id}
```

The real API is:

```
POST /v1/knowledge-bases/{knowledge_base_id}/sync?org_id={org_id}
```

Four separate errors in the docs:

|                    | Documented                      | Actual                      |
| ------------------ | ------------------------------- | --------------------------- |
| HTTP method        | `GET`                           | `POST`                      |
| Path structure     | `/sync/trigger/{kbId}/{orgId}`  | `/{kbId}/sync`              |
| `org_id` placement | path segment                    | query parameter             |
| Base path          | `/knowledge_bases` (underscore) | `/knowledge-bases` (hyphen) |

## How to Reproduce

1. Implement sync using the documented `GET /knowledge_bases/sync/trigger/{kbId}/{orgId}`.
2. After KB creation succeeds, the sync call fires.
3. Observe: `404 Not Found` — tried multiple URL variants (`underscore`, `hyphen`, different path orders) all 404.
4. The error is silent from the user perspective — KB is created but files never get indexed.

## Root Cause

Same root cause as ISS-5 — the notebook was written against an older API version. The sync trigger was refactored from a custom GET action into a standard REST `POST /{resource}/sync` pattern with query params. The notebook was not updated.

The `org_id` being embedded as a path segment (instead of a query param) is particularly misleading and caused multiple failed fix attempts.

## Fix

Updated `src/app/api/knowledge-bases/[kbId]/sync/route.ts`:

- Method: changed handler from `GET` to `POST` toward upstream
- URL: `POST https://api.stackai.com/v1/knowledge-bases/${kbId}/sync?org_id=${orgId}`

Successful upstream response:

```json
{
  "message": "Synchronization task started for knowledge base {uuid}",
  "status": "accepted"
}
```
