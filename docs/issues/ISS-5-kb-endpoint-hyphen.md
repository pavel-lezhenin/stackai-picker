# ISS-5: KB create endpoint uses hyphens, not underscores

**Severity:** Blocker
**Found:** 2026-03-05
**Time lost:** ~30 min

## Problem

The notebook documents the Knowledge Base creation endpoint with an underscore:

```
POST /knowledge_bases
```

The real API uses a **hyphen**:

```
POST /v1/knowledge-bases
```

All other KB endpoints (resources, sync) use underscores (`/v1/knowledge_bases/...`).
This inconsistency is not documented anywhere — the create endpoint is the only one with a hyphen.

Additionally, the request body differs from the notebook:

| Field                              | Notebook                   | Actual                            |
| ---------------------------------- | -------------------------- | --------------------------------- |
| `chunker_params.chunker`           | `"sentence"`               | field is named `chunker_type`     |
| `embedding_params.embedding_model` | `"text-embedding-ada-002"` | `"openai.text-embedding-3-large"` |
| `indexing_params.unstructured`     | `true`                     | field not accepted / not needed   |
| `cron_job_id`                      | `null`                     | field not needed                  |

## Fix

BFF route `src/app/api/knowledge-bases/route.ts` updated:

- URL: `stackUrl('/v1/knowledge-bases')` (hyphen)
- Body: `chunker_type`, `openai.text-embedding-3-large`, removed `unstructured` and `cron_job_id`

The API also returns the KB wrapped in `{ data: {...} }` — BFF unwraps accordingly.
