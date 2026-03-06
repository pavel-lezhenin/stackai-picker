# ISS-10: Omitting `resource_path` on KB resources endpoint causes 500

**Severity:** Medium (backend bug — mitigation already in BFF)
**Found:** 2026-03-06

## Problem

`GET /v1/knowledge-bases/{kbId}/resources/children` requires a `resource_path` query parameter. When the parameter is **omitted entirely**, the server returns `500 Internal Server Error` instead of validating the input and returning `422 Unprocessable Entity` (or defaulting to `/`).

## How to Reproduce

```bash
# Missing resource_path — returns 500
curl "https://api.stackai.com/v1/knowledge-bases/{kbId}/resources/children" \
  -H "Authorization: Bearer <token>"

# With resource_path — returns 200
curl "https://api.stackai.com/v1/knowledge-bases/{kbId}/resources/children?resource_path=/" \
  -H "Authorization: Bearer <token>"
```

## Expected vs Actual

| Scenario                     | Expected              | Actual                          |
| ---------------------------- | --------------------- | ------------------------------- |
| `resource_path=/`            | 200 OK                | 200 OK ✓                        |
| `resource_path` omitted      | 422 or default to `/` | **500 Internal Server Error** ✗ |
| `resource_path=/nonexistent` | 200 with empty `data` | 400 Bad Request                 |

The 500 indicates an unhandled exception on the server — the missing parameter propagates into internal logic instead of being caught at the input validation layer.

## Impact

- Any client bug that forgets to include `resource_path` (e.g. race condition, stale state) will surface as a confusing 500 rather than a clear validation error.
- Difficult to distinguish from a genuine server outage in monitoring/alerting.

## Mitigation (BFF layer — already in place)

The BFF route at `src/app/api/knowledge-bases/[kbId]/resources/route.ts` defaults `resource_path` to `"/"` before forwarding, so the upstream 500 is never reachable through the application:

```typescript
const resourcePath = request.nextUrl.searchParams.get('resource_path') ?? '/';
```

This means production users are protected, but anyone calling the API directly (e.g. integration tests, external scripts) is exposed.

## Recommended Backend Fix

Add input validation for `resource_path` at the start of the handler:

- If missing: default to `"/"` **or** return `422 Unprocessable Entity` with a clear message.
- Never allow the missing parameter to reach internal path-processing logic.

## Test Coverage

`tests/integration/api/knowledge-bases.test.ts` — `describe('KB resources: sub-path listing')`:

- `[ISS-10]` test: directly calls the endpoint without `resource_path` and asserts `status === 500`, locking in the current broken behavior so any backend fix is immediately visible in CI.
