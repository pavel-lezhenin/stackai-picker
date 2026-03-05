# ISS-6: Sync endpoint is POST with wrong path structure in docs

**Severity:** Blocker
**Found:** 2026-03-05
**Time lost:** ~45 min

## Problem

The notebook documents the sync trigger as a GET with the following path structure:

```
GET /knowledge_bases/sync/trigger/{knowledge_base_id}/{org_id}
```

The real API is completely different:

```
POST /v1/knowledge-bases/{knowledge_base_id}/sync?org_id={org_id}
```

Three things are wrong in the docs:

1. **Wrong method**: `GET` → should be `POST`
2. **Wrong path structure**: `sync/trigger/{kbId}/{orgId}` → should be `{kbId}/sync`
3. **Wrong param placement**: `org_id` is a **query parameter**, not a path segment
4. **Wrong base path**: uses underscores like all other KB endpoints EXCEPT create — but sync uses hyphens (same as create)

## Fix

BFF route `src/app/api/knowledge-bases/[kbId]/sync/route.ts` updated:

- Method: `POST`
- URL: `POST /v1/knowledge-bases/${kbId}/sync?org_id=${orgId}`

Successful response from the real API:

```json
{
  "message": "Synchronization task started for knowledge base {uuid}",
  "status": "accepted"
}
```
