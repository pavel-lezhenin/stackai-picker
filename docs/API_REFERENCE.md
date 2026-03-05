# Stack AI API Reference

> Extracted from the official `knowledge_base_workflow.ipynb` notebook.
> This is the single source of truth for all API endpoints used in the File Picker.

---

## Authentication

### Supabase Auth (Token Acquisition)

```
POST https://sb.stack-ai.com/auth/v1/token?grant_type=password
```

**Headers:**

```json
{
  "Content-Type": "application/json",
  "Apikey": "<SUPABASE_ANON_KEY>"
}
```

**Body:**

```json
{
  "email": "<email>",
  "password": "<password>",
  "gotrue_meta_security": {}
}
```

**Response:**

```json
{
  "access_token": "<jwt_token>",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "<refresh_token>"
}
```

**Usage:** All subsequent requests use:

```
Authorization: Bearer <access_token>
```

### Supabase Anon Key

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZic3VhZGZxaGtseG9rbWxodHNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NzM0NTg5ODAsImV4cCI6MTk4OTAzNDk4MH0.Xjry9m7oc42_MsLRc1bZhTTzip3srDjJ6fJMkwhXQ9s
```

> **SECURITY**: This key and all tokens MUST only exist in server-side code (API routes).
> Never expose in client-side JavaScript.

---

## Base URL

```
https://api.stack-ai.com
```

---

## Endpoints

### 1. Get Current Organization

```
GET /organizations/me/current
```

**Response:**

```json
{
  "org_id": "<uuid>"
}
```

**Usage:** Required for sync endpoint and scoping operations.

---

### 2. List Connections

```
GET /connections?connection_provider=gdrive&limit=1
```

**Response:** Array of connection objects:

```json
[
  {
    "connection_id": "<uuid>",
    "name": "Google Drive",
    "connection_provider": "gdrive",
    "connection_provider_data": { ... },
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
]
```

---

### 3. List Resources (Children of Folder)

```
GET /connections/{connection_id}/resources/children
GET /connections/{connection_id}/resources/children?resource_id={resource_id}
```

**Parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| `connection_id` | path | Yes | Connection UUID |
| `resource_id` | query | No | Folder resource_id. Omit for root listing. |

**Response:** Paginated list of resources:

```json
{
  "data": [
    {
      "resource_id": "1YeS8H92ZmTZ3r2tLn1m43GG58gRzvYiM",
      "inode_type": "directory",
      "inode_path": {
        "path": "papers"
      },
      "status": null,
      "created_at": "2024-01-01T00:00:00Z",
      "modified_at": "2024-01-01T00:00:00Z"
    },
    {
      "resource_id": "1GYpHUOiSYXGz_9GeUGgQkwQUJqCAxibGd9szwMJQSIg",
      "inode_type": "file",
      "inode_path": {
        "path": "Very Important notes.txt"
      },
      "status": null,
      "created_at": "2024-01-01T00:00:00Z",
      "modified_at": "2024-01-01T00:00:00Z"
    }
  ],
  "next_cursor": "<string | null>",
  "current_cursor": "<string | null>"
}
```

**Key fields on each resource:**
| Field | Type | Description |
|---|---|---|
| `resource_id` | `string` | Unique ID (Google Drive file/folder ID) |
| `inode_type` | `"directory" \| "file"` | Resource type |
| `inode_path.path` | `string` | Display name / path segment |
| `status` | `string \| null` | Indexing status (only in KB context) |
| `created_at` | `string` | ISO timestamp |
| `modified_at` | `string` | ISO timestamp |

**Pagination:** Use `next_cursor` to fetch next page:

```
GET /connections/{connection_id}/resources/children?resource_id={id}&cursor={next_cursor}
```

---

### 4. Create Knowledge Base

```
POST /knowledge_bases
```

**Body:**

```json
{
  "connection_id": "<connection_id>",
  "connection_source_ids": ["<resource_id_1>", "<resource_id_2>"],
  "indexing_params": {
    "ocr": false,
    "unstructured": true,
    "embedding_params": {
      "embedding_model": "text-embedding-ada-002",
      "api_key": null
    },
    "chunker_params": {
      "chunk_size": 1500,
      "chunk_overlap": 500,
      "chunker": "sentence"
    }
  },
  "org_level_role": null,
  "cron_job_id": null
}
```

**Response:**

```json
{
  "knowledge_base_id": "<uuid>",
  ...
}
```

**Important Note from notebook:**

> Avoid passing both a folder AND its children in `connection_source_ids`.
> If you pass `test_folder` and `test_folder/test_file.pdf`, the backend will work
> but there will be duplicate indexing work. The frontend should prevent this.

---

### 5. Sync Knowledge Base (Trigger Indexing)

```
GET /knowledge_bases/sync/trigger/{knowledge_base_id}/{org_id}
```

**Note:** This triggers a background task. Indexing is NOT instant.
Resources will be in `"pending"` status until indexing completes (~1 minute).

---

### 6. List Knowledge Base Resources

```
GET /knowledge_bases/{knowledge_base_id}/resources/children?resource_path={path}
```

**Parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| `knowledge_base_id` | path | Yes | KB UUID |
| `resource_path` | query | Yes | Path to list. Use `/` for root. |

**Response:** Same paginated structure as connection resources, but with `status` field:

```json
{
  "data": [
    {
      "resource_id": "...",
      "inode_type": "file",
      "inode_path": { "path": "papers/self_rag.pdf" },
      "status": "indexed"
    }
  ],
  "next_cursor": null,
  "current_cursor": null
}
```

**Status values:**
| Status | Meaning |
|---|---|
| `"indexed"` | File is fully indexed in vector DB |
| `"pending"` | Indexing in progress |
| `null` | Not indexed (connection resource, not in KB) |

---

### 7. Delete Knowledge Base Resource

```
DELETE /knowledge_bases/{knowledge_base_id}/resources?resource_path={path}
```

**Parameters:**
| Param | Type | Description |
|---|---|---|
| `resource_path` | query + body | Path of resource to delete (e.g., `"papers/self_rag.pdf"`) |

**Body:**

```json
{
  "resource_path": "papers/self_rag.pdf"
}
```

**Note:** Only files can be deleted. Deletion is async — takes ~5 seconds.

---

## Data Model Summary

### Resource (from Connection)

```typescript
interface ConnectionResource {
  resource_id: string; // Google Drive file/folder ID
  inode_type: 'directory' | 'file';
  inode_path: {
    path: string; // Display name or relative path
  };
  created_at: string; // ISO 8601
  modified_at: string; // ISO 8601
}
```

### Resource (from Knowledge Base)

```typescript
interface KBResource extends ConnectionResource {
  status: 'indexed' | 'pending' | null;
}
```

### Paginated Response

```typescript
interface PaginatedResponse<T> {
  data: T[];
  next_cursor: string | null;
  current_cursor: string | null;
}
```

### Connection

```typescript
interface Connection {
  connection_id: string;
  name: string;
  connection_provider: 'gdrive';
  created_at: string;
  updated_at: string;
}
```

---

## API Flow for File Picker

```
1. Auth → Get access_token
2. GET /organizations/me/current → org_id
3. GET /connections?connection_provider=gdrive → connection_id
4. GET /connections/{id}/resources/children → root files/folders
5. GET /connections/{id}/resources/children?resource_id={folder_id} → folder contents
6. POST /knowledge_bases → create KB with selected resource IDs
7. GET /knowledge_bases/sync/trigger/{kb_id}/{org_id} → trigger indexing
8. GET /knowledge_bases/{kb_id}/resources/children?resource_path=/ → check status
9. DELETE /knowledge_bases/{kb_id}/resources?resource_path=X → remove from KB
```

---

## Critical Implementation Notes

1. **Pagination**: Both connection resources and KB resources are paginated.
   Must handle `next_cursor` to load all items.

2. **De-duplication**: When indexing a folder, don't also index its children
   individually — the backend handles recursive indexing.

3. **Async indexing**: After `sync/trigger`, resources go to `"pending"` state.
   Poll or use `staleTime` to eventually show `"indexed"` status.

4. **inode_type vs type**: The API uses `inode_type` (not `type`) for
   `"directory"` | `"file"`. Map to our internal `type: 'file' | 'folder'`.

5. **inode_path.path**: This is the display name, not a full path.
   For nested navigation, the `resource_id` is what you pass to list children.

6. **Delete scope**: Only files can be deleted from KB, not folders.
   The delete endpoint uses `resource_path`, not `resource_id`.
