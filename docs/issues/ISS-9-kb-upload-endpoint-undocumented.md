# ISS-9: KB file upload endpoint is absent from API reference

**Severity:** Major
**Found:** 2026-03-06

## Problem

The assignment notebook (`knowledge_base_workflow.ipynb`, section 2.4 "Create a file") shows a multipart file upload endpoint:

```python
resource = session.post(
    f"{backend_url}/knowledge_bases/{knowledge_base_id}/resources",
    files=files,
    data=create_request_metadata,
)
```

This endpoint is **completely absent from `API_REFERENCE.md`**. There is no mention of:

- The endpoint path
- The request format (multipart form-data)
- Required form fields (`resource_type`, `resource_path`, `file`)
- The response shape
- Whether the upload is synchronous or triggers async indexing

Additionally, the notebook uses the wrong path (underscore, no `/v1/` prefix) — same pattern as ISS-5 and ISS-7.

## How to Reproduce

```bash
# Notebook path — returns 404 (same underscore bug as ISS-5/7)
curl -X POST https://api.stackai.com/knowledge_bases/{kbId}/resources \
  -H "Authorization: Bearer <token>" \
  -F "resource_type=file" \
  -F "resource_path=papers/demo_file.txt" \
  -F "file=@demo_file.txt;type=text/plain"

# Correct path (follows hyphen+v1 pattern)
curl -X POST https://api.stackai.com/v1/knowledge-bases/{kbId}/resources \
  -H "Authorization: Bearer <token>" \
  -F "resource_type=file" \
  -F "resource_path=papers/demo_file.txt" \
  -F "file=@demo_file.txt;type=text/plain"
```

## Known Behavior (from integration tests)

- `POST /knowledge_bases/{kbId}/resources` (notebook path) → **404** (underscore bug)
- `POST /v1/knowledge-bases/{kbId}/resources` (corrected path) → **non-404** (endpoint exists)

Exact response status for the corrected path depends on whether `resource_path` corresponds to a valid KB path. The endpoint exists and is reachable at the `/v1/knowledge-bases/` prefix.

## Impact

- Developers implementing "add file to KB" from the notebook will hit 404 on the first attempt due to the wrong path.
- No documentation means the request format must be reverse-engineered from the notebook.
- The response shape is unknown — it's unclear whether the upload triggers indexing automatically or requires a separate sync call.

## Fix

1. Path: use `POST /v1/knowledge-bases/{knowledge_base_id}/resources` (hyphen, `/v1/` prefix).
2. Request: multipart form-data with fields `resource_type`, `resource_path`, and `file`.
3. `API_REFERENCE.md` needs a new section documenting this endpoint.

## Test Coverage

`tests/integration/api/knowledge-bases.test.ts` — `describe('ISS-9 ...')`:

- `[DOCS BUG]` block: confirms underscore path returns 404
- `[FIX]` block: confirms hyphen+v1 path returns non-404
