# ISS-8: KB create endpoint accepts invalid bodies without returning an error

**Severity:** Medium (backend bug — mitigation required in BFF)
**Found:** 2026-03-06

## Problem

`POST /v1/knowledge-bases` accepts — and returns `200 OK` for — two clearly invalid request bodies:

1. **Empty `connection_source_ids`** — creating a KB with no source files is semantically meaningless. The API creates the KB and returns a `knowledge_base_id` anyway.

2. **Missing `connection_id`** — the field is required to associate the KB with a data source. The API creates an orphaned KB and returns `200 OK`.

Neither case returns `400 Bad Request` or any other 4xx error. The server silently creates garbage data.

## How to Reproduce

```bash
# Empty sources — should be 400, is 200
curl -X POST https://api.stackai.com/v1/knowledge-bases \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"connection_id":"<valid-id>","connection_source_ids":[]}'

# Missing connection_id — should be 400, is 200
curl -X POST https://api.stackai.com/v1/knowledge-bases \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"connection_source_ids":["some-id"]}'
```

Both return `200 OK` with a valid-looking `knowledge_base_id` in the response.

## Impact

- Orphaned / empty knowledge bases accumulate in the user's account with every validation mistake or client bug.
- A subsequent sync on an empty KB wastes backend resources and silently does nothing.
- Frontend validation gaps (e.g. race conditions, empty selection state) can silently create junk KBs without the user or developer noticing.

## Root Cause

Missing server-side input validation on the `/v1/knowledge-bases` endpoint. The backend presumably passes the body straight to the KB creation logic without validating required field presence or non-empty array constraints.

## Mitigation (BFF layer — already in place)

Because this is a backend bug outside our control, the BFF route at
`src/app/api/knowledge-bases/route.ts` enforces the validation via Zod before the upstream call is ever made:

```typescript
const CreateKBBodySchema = z.object({
  connection_id: z.string().min(1),
  connection_source_ids: z.array(z.string().min(1)).min(1), // min(1) rejects empty array
});
```

Any request that would produce an empty or orphaned KB is rejected at the BFF with `400 Invalid request body` before it reaches the upstream API.

## Recommended Backend Fix

The upstream API should validate:

- `connection_id` is present and a non-empty string.
- `connection_source_ids` is a non-empty array.

And return `422 Unprocessable Entity` (or `400`) with a descriptive error message for both cases.

## Test Coverage

`tests/integration/api/knowledge-bases.test.ts` — `describe('KB create: body validation')` — two `[DISCOVERY]` tests document and lock in this behavior so any future backend fix is immediately visible in CI.
