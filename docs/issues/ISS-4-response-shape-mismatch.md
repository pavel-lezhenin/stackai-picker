# ISS-4: API response shapes differ from documentation

**Severity:** Major
**Found:** 2026-03-05
**Time lost:** ~30 min

## Problem

Multiple field names and response structures differ from the notebook documentation:

| Documented                                          | Actual                                                                                              | Impact                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `connection_provider`                               | `provider_id`                                                                                       | ConnectionSchema validation fails              |
| Cursor pagination (`next_cursor`, `current_cursor`) | Simple `{ data: [...] }` wrapper                                                                    | PaginatedResponseSchema validation fails       |
| `status: "indexed" \| "pending"`                    | `status: "resource"`                                                                                | ConnectionResourceSchema enum validation fails |
| —                                                   | Extra fields: `knowledge_base_id`, `indexed_at`, `dataloader_metadata`, `user_metadata`, `inode_id` | Strict schema rejects unknown fields           |

## Fix

1. Changed `ConnectionSchema.connection_provider` → `provider_id`
2. Replaced `PaginatedResponseSchema` with inline `z.object({ data: z.array(...) })` for resources endpoint
3. Changed `status` from `z.enum(['indexed', 'pending'])` to `z.string()` to accept any value from API
4. Added `'resource'` to `ResourceStatus` union type
5. Added `'resource'` entry to `StatusBadge` config (renders as "Not Indexed")
