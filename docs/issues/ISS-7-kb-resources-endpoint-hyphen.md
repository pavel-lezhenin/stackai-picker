# ISS-7: KB resources and delete endpoints use underscores in docs, hyphens in reality

**Severity:** Blocker  
**Found:** 2026-03-05  
**Time lost:** ~2-5 min

## Problem

The notebook documents KB resource listing and deletion with underscores:

```
GET  /knowledge_bases/{knowledge_base_id}/resources/children?resource_path={path}
DELETE /knowledge_bases/{knowledge_base_id}/resources?resource_path={path}
```

The real API uses **hyphens** (consistent with ISS-5 and ISS-6):

```
GET  /v1/knowledge-bases/{knowledge_base_id}/resources/children?resource_path={path}
DELETE /v1/knowledge-bases/{knowledge_base_id}/resources?resource_path={path}
```

## How to Reproduce

1. Successfully index files (KB created + sync triggered via ISS-5/ISS-6 fixes).
2. The app starts polling `GET /api/knowledge-bases/{kbId}/resources?resource_path=/` to track indexing status.
3. Observe: `404 Not Found` — files appear stuck, status never updates, no "indexed" badge appears.

## Root Cause

Same root cause as ISS-5 and ISS-6 — all KB endpoints in the notebook use underscores (`/knowledge_bases`), but the production API uses hyphens (`/knowledge-bases`) across the entire KB resource namespace. The pattern is consistent on the server, but the docs use the old underscore style throughout.

## Fix

Updated `src/app/api/knowledge-bases/[kbId]/resources/route.ts`:

- GET: `GET https://api.stackai.com/v1/knowledge-bases/${kbId}/resources/children?resource_path=...`
- DELETE: `DELETE https://api.stackai.com/v1/knowledge-bases/${kbId}/resources?resource_path=...`

## Pattern Summary (all KB endpoints)

After fixing ISS-5, ISS-6, and ISS-7, the complete correct endpoint map is:

| Operation       | Correct URL                                                         |
| --------------- | ------------------------------------------------------------------- |
| Create KB       | `POST /v1/knowledge-bases`                                          |
| Trigger sync    | `POST /v1/knowledge-bases/{kbId}/sync?org_id={orgId}`               |
| List resources  | `GET /v1/knowledge-bases/{kbId}/resources/children?resource_path=/` |
| Delete resource | `DELETE /v1/knowledge-bases/{kbId}/resources?resource_path={path}`  |

All use `/v1/knowledge-bases` (hyphen). The notebook has underscores everywhere — all are wrong.
