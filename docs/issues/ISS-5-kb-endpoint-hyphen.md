# ISS-5: KB create endpoint uses hyphens, not underscores

**Severity:** Blocker  
**Found:** 2026-03-05  
**Time lost:** ~2-5 min

## Problem

The notebook documents the Knowledge Base creation endpoint with an underscore and no `/v1/` prefix:

```
POST /knowledge_bases
```

The real API uses a **hyphen** and requires the `/v1/` prefix:

```
POST /v1/knowledge-bases
```

Additionally, the request body field names differ from the notebook:

| Field                              | Documented                 | Actual                            |
| ---------------------------------- | -------------------------- | --------------------------------- |
| `chunker_params.chunker`           | `"sentence"`               | key must be `chunker_type`        |
| `embedding_params.embedding_model` | `"text-embedding-ada-002"` | `"openai.text-embedding-3-large"` |
| `indexing_params.unstructured`     | `true`                     | field not accepted                |
| `cron_job_id`                      | `null`                     | field not accepted                |

The response is also wrapped in a `{ data: {...} }` envelope — not documented.

## How to Reproduce

1. Implement KB creation using the documented endpoint `POST /knowledge_bases` with the documented body.
2. Click "Index" on any file in the file picker.
3. Observe: `404 Not Found` with body `{"detail": "Not Found"}`.

## Root Cause

The assignment notebook (`knowledge_base_workflow.ipynb`) was written against an older version of the API. The production API has since been updated to use RESTful hyphenated paths (`/knowledge-bases`) and updated model/chunker parameter names. The notebook was never updated to reflect this.

## Fix

Updated `src/app/api/knowledge-bases/route.ts`:

- URL: `POST https://api.stackai.com/v1/knowledge-bases` (hyphen)
- Body: use `chunker_type` instead of `chunker`; use `openai.text-embedding-3-large`; remove `unstructured` and `cron_job_id`
- Response: unwrap `{ data: { knowledge_base_id, ... } }` envelope before returning to client
