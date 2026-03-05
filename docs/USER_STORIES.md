# User Stories

> **Quality bar**: Each story must satisfy the Definition of Done in ACCEPTANCE_CRITERIA.md.
> Stories are ordered by implementation priority. Complete Tier 1 fully before Tier 2.

---

## Epic 1: Foundation (Build First)

### US-1.0: Project Scaffold & Configuration

**As a** developer  
**I need** a properly configured Next.js 16 project with all tooling  
**So that** every subsequent feature is built on solid foundations

**Acceptance Criteria:**

- [x] Next.js 16 App Router with `src/` directory structure matching architecture spec
- [x] TypeScript `strict: true` with zero errors
- [x] Tailwind CSS v4 with Shadcn UI components installed and themed
- [x] TanStack Query v5 provider wrapping the app
- [x] Path aliases configured: `@/components`, `@/hooks`, `@/lib`, `@/types`
- [x] ESLint configured with zero warnings
- [x] `.env.example` with all required environment variables documented
- [x] `.env.local` excluded from git

**WOW Detail:**

- [x] Shadcn theme customized to feel like a Stack AI enterprise product (neutral palette, professional typography)
- [x] `cn()` utility available from `@/lib/utils`

---

## Epic 2: Data Layer (Types → API → Hooks)

### TS-1: Type Definitions

**As a** developer  
**I need** comprehensive TypeScript types with Zod validation  
**So that** every data boundary is type-safe and runtime-validated

**Acceptance Criteria:**

- [x] Map API `inode_type: "directory" | "file"` → internal `type: 'folder' | 'file'` discriminated union
- [x] `ResourceStatus` type: `'indexed' | 'pending' | null` (matches API — `null` = not indexed)
- [x] Zod schemas validating API response shapes: `PaginatedResponse<T>`, `ConnectionResource`, `KBResource`
- [x] API paginated response type: `{ data: T[]; next_cursor: string | null; current_cursor: string | null }`
- [x] BFF response envelope: `{ data: T } | { error: string; status: number }`
- [x] File type mapping: `Record<string, { icon: LucideIcon; label: string }>` for extensibility (OCP)
- [x] Connection type: `{ connection_id, name, connection_provider, created_at, updated_at }`
- [x] No `any` — use `unknown` with type narrowing where needed

**WOW Detail:**

- [x] Const assertions on query key factories
- [x] Resource `inode_path.path` extracted as `name` for display (API shape → UI shape)

---

### TS-2: API Proxy Routes (BFF)

**As a** developer  
**I need** Next.js API routes to proxy all Stack AI calls  
**So that** credentials never reach the client and errors are consistent

**Acceptance Criteria (maps to actual Stack AI API — see `docs/API_REFERENCE.md`):**

- [x] Auth route: server-side token acquisition from Supabase (`POST sb.stack-ai.com/auth/v1/token`)
- [x] `GET /api/organizations/me` → proxies `GET /organizations/me/current` (returns `org_id`, needed for sync)
- [x] `GET /api/connections` → proxies `GET /connections?connection_provider=gdrive&limit=1`
- [x] `GET /api/connections/[connectionId]/resources?resource_id=X` → proxies `GET /connections/{id}/resources/children?resource_id=X`
- [x] `POST /api/knowledge-bases` → proxies `POST /knowledge_bases` (create KB with `connection_source_ids`)
- [x] `GET /api/knowledge-bases/[kbId]/sync` → proxies `GET /knowledge_bases/sync/trigger/{kbId}/{orgId}`
- [x] `GET /api/knowledge-bases/[kbId]/resources?resource_path=X` → proxies `GET /knowledge_bases/{kbId}/resources/children?resource_path=X`
- [x] `DELETE /api/knowledge-bases/[kbId]/resources?resource_path=X` → proxies `DELETE /knowledge_bases/{kbId}/resources?resource_path=X`
- [x] Handle pagination: forward `next_cursor` / `current_cursor` transparently
- [x] Consistent BFF error shape: `{ error: string; status: number }`
- [x] Zod validation on incoming request bodies
- [x] Proper HTTP status codes: 200, 400, 401, 404, 500

**WOW Detail:**

- [x] Shared auth helper: `getStackAIHeaders()` — acquires and caches token server-side
- [x] Auth token cached in memory with expiry check (don't re-auth every request)
- [x] Rate limit awareness: return `Retry-After` header on 429

---

### TS-3: TanStack Query Hooks

**As a** developer  
**I need** a complete data fetching layer with proper caching  
**So that** the UI is fast, consistent, and resilient

**Acceptance Criteria:**

- [x] Query key factory: `resourceKeys.all`, `.lists()`, `.list(connId, folderId)`
- [x] `useConnection()` — fetches first gdrive connection, caches aggressively
- [x] `useResources(connectionId, folderId?)` — returns typed resource list with pagination
- [x] `useKBResources(kbId, resourcePath)` — returns KB resources with indexed status
- [x] `useCreateKB()` — mutation to create knowledge base with `connection_source_ids`
- [x] `useSyncKB()` — triggers sync and sets up polling for status changes
- [x] `useDeleteKBResource()` — mutation with optimistic removal + rollback
- [x] QueryClient defaults: `staleTime: 5 * 60 * 1000`, `gcTime: 10 * 60 * 1000`
- [x] Previously visited folders show cached data instantly on re-navigation
- [x] Handle API pagination (`next_cursor`) — either load all pages or implement infinite scroll

**WOW Detail:**

- [x] Optimistic update helper utility used across all mutations (DRY, teachable pattern)
- [x] `onMutate` → snapshot previous state, apply optimistic change
- [x] `onError` → rollback from snapshot, show error toast with specific message
- [x] `onSettled` → invalidate to sync with server truth
- [x] `select` used to transform `inode_type`/`inode_path` shapes into clean Resource type
- [x] Smart de-duplication: when indexing a folder, auto-exclude its children from `connection_source_ids`

---

## Epic 3: File Browsing (Core UX)

### US-1.1: View Root Files and Folders

**As a** Knowledge Base manager  
**I want to** see files and folders from my connected Google Drive  
**So that** I can decide what content to include in my Knowledge Base

**Acceptance Criteria:**

- [ ] On mount, fetch and display root-level resources
- [ ] Each row shows: file type icon, name, status badge, modified date, actions
- [ ] Folders visually distinguishable (folder icon, bolder text or different weight)
- [ ] Folders appear before files in the list (always, regardless of sort)
- [ ] Loading: skeleton rows matching exact row height and layout (zero CLS)
- [ ] Error: full-width error card with message + "Try Again" button
- [ ] Empty: illustration or icon + "No files found" message

**WOW Detail:**

- [ ] Skeleton rows animate with Tailwind `animate-pulse`
- [ ] File icons are contextual: different icons for PDF, Doc, Sheet, Slide, Image, Folder
- [ ] Row hover shows subtle background change (`bg-muted/50`)
- [ ] First load feels instant via staleTime preventing flash

---

### US-1.2: Navigate Into Folders

**As a** user  
**I want to** double-click or click a folder to browse into it  
**So that** I can explore the file hierarchy like a native file manager

**Acceptance Criteria:**

- [ ] Clicking/double-clicking a folder navigates into it, showing its children
- [ ] Breadcrumb trail: `Root > Documents > Reports` with clickable segments
- [ ] Loading skeleton during folder content fetch
- [ ] Empty folder: "This folder is empty" with folder icon
- [ ] Navigating to a previously cached folder shows data instantly (no spinner)
- [ ] URL or internal state tracks current folder ID for potential deep-linking

**WOW Detail:**

- [ ] Smooth content transition on navigation (opacity fade, subtle on purpose)
- [ ] Breadcrumb truncates with `...` dropdown for paths > 4 segments deep
- [ ] Keyboard: Enter on focused folder opens it

---

### US-1.3: Navigate Back

**As a** user  
**I want to** navigate up the folder hierarchy  
**So that** I can go back to where I came from

**Acceptance Criteria:**

- [ ] Each breadcrumb segment is clickable → navigates to that folder
- [ ] Back arrow button at top left navigates to parent
- [ ] Cache is preserved — going back shows previous data without loading
- [ ] Back at root: back button is disabled or hidden

**WOW Detail:**

- [ ] Keyboard: Backspace or Alt+← navigates up
- [ ] Breadcrumb segments have hover underline for affordance

---

## Epic 4: File Management

### US-2.1: Delete (De-list) a Resource

**As a** user  
**I want to** remove a file from the listing  
**So that** I can exclude irrelevant files from my Knowledge Base scope

**Acceptance Criteria:**

- [ ] Each row has a delete action (trash icon, revealed on hover or in actions menu)
- [ ] Confirmation dialog: "Remove '[filename]'? This won't delete it from Google Drive."
- [ ] Optimistic removal: file disappears immediately from list
- [ ] On error: file reappears in its original position, error toast with message
- [ ] Delete action disabled during pending delete

**WOW Detail:**

- [ ] Row exit animation (fade out + slight scale down) before removal
- [ ] Confirmation uses `AlertDialog` from Shadcn (not browser `confirm()`)
- [ ] Toast shows undo option (soft delete with timer) — if API supports it
- [ ] Batch delete when multiple items selected

---

## Epic 5: Indexing & Knowledge Base

### US-3.1: Index Files for Knowledge Base

**As a** Knowledge Base manager  
**I want to** select files and index them  
**So that** the AI can use those files as context for answering questions

**Acceptance Criteria:**

- [ ] Per-row "Index" action button (or toggle)
- [ ] Status changes optimistically to "Indexed" with green badge
- [ ] Success toast: "Successfully indexed '[filename]'"
- [ ] Error: status reverts, error toast with specific message
- [ ] Batch indexing: select multiple → "Index Selected" toolbar button

**WOW Detail:**

- [ ] Status badge animates on transition (not indexed → pending → indexed)
- [ ] Pending state shows a subtle spinner/pulse on the badge
- [ ] Index button transforms to "Indexed ✓" preventing accidental double-tap

---

### US-3.2: View Indexing Status

**As a** user  
**I want to** see which files are indexed at a glance  
**So that** I know exactly what's in my Knowledge Base

**Acceptance Criteria:**

- [ ] Status badge on each row: green "Indexed" / gray "Not Indexed"
- [ ] Badge has consistent width (no layout shift on status change)
- [ ] Toolbar shows summary: "X of Y files indexed"
- [ ] Status is fetched from API and reflects server truth

**WOW Detail:**

- [ ] Badge uses filled/outline variant for clear visual distinction
- [ ] Icon inside badge (check for indexed, minus for not indexed)
- [ ] Filter option: "Show indexed only" / "Show not indexed only"

---

### US-3.3: De-index a File

**As a** user  
**I want to** remove a file from the index without removing it from the listing  
**So that** I can fine-tune my Knowledge Base contents

**Acceptance Criteria:**

- [ ] Indexed files show a "De-index" action (dropdown or direct button)
- [ ] Optimistic: status immediately changes to "Not Indexed"
- [ ] File remains in the listing
- [ ] On error: status reverts to "Indexed", error toast
- [ ] Batch de-index supported when multiple indexed items selected

**WOW Detail:**

- [ ] Confirmation for batch de-index: "Remove X files from Knowledge Base?"
- [ ] Status transition animates smoothly (green → gray)

---

## Epic 6: Sorting, Filtering & Search (Bonus — High Impact)

### US-4.1: Sort Files

**As a** user  
**I want to** sort the file list by name or date  
**So that** I can organize and find files efficiently

**Acceptance Criteria:**

- [ ] Column headers ("Name", "Modified") are clickable for sorting
- [ ] Sort direction indicators: ▲ ascending, ▼ descending
- [ ] Sort options: Name A-Z, Name Z-A, Date Newest, Date Oldest
- [ ] Folders always grouped before files regardless of sort order
- [ ] Sort is client-side (no API call needed — instant)
- [ ] Sort preference persists within session (not reset on folder navigation)

**WOW Detail:**

- [ ] Default sort: folders first, then files alphabetically
- [ ] Active sort column highlighted
- [ ] No layout shift on sort change (items animate into new positions if feasible)

---

### US-4.2: Filter & Search Files

**As a** user  
**I want to** search/filter files by name  
**So that** I can quickly find specific files in large directories

**Acceptance Criteria:**

- [ ] Search input in toolbar area
- [ ] Client-side filtering as user types (debounced 300ms)
- [ ] "No results matching '[query]'" empty state
- [ ] Clear button (X icon) to reset filter
- [ ] Filter resets when navigating to a different folder
- [ ] Results update smoothly without layout shift

**WOW Detail:**

- [ ] Keyboard shortcut: `Cmd+K` or `/` focuses search input
- [ ] Search input has `magnifying glass` icon prefix
- [ ] Matching text highlighted in results (bold the matching substring)
- [ ] Escape key clears search and returns focus to file list

---

## Epic 7: Multi-Selection & Batch Actions

### US-5.1: Select Multiple Resources

**As a** user  
**I want to** select multiple files at once  
**So that** I can perform batch index/de-index/delete efficiently

**Acceptance Criteria:**

- [ ] Checkbox on each row
- [ ] "Select All" checkbox in table header
- [ ] Selection count in toolbar: "X selected"
- [ ] Batch action buttons appear when ≥1 item selected: "Index", "De-index", "Delete"
- [ ] Selection clears on folder navigation
- [ ] Select All checkbox shows indeterminate state when partially selected

**WOW Detail:**

- [ ] Shift+Click for range selection (like native file managers)
- [ ] Selected rows have distinct background (`bg-primary/5`)
- [ ] Toolbar transitions smoothly between default and selection mode

---

## Technical Stories

### TS-4: Error Handling Strategy

**As a** developer  
**I need** consistent error handling across the application  
**So that** failures are graceful and users always know what happened

**Acceptance Criteria:**

- [x] Global `error.tsx` boundary at app level
- [x] Toast notification system (Shadcn Sonner)
- [ ] All mutations have `onError` with user-friendly message
- [ ] API routes return structured errors (never raw stack traces)
- [ ] Network errors show "Connection lost — check your internet" (not technical jargon)

---

### TS-5: Loading & Skeleton Strategy

**As a** developer  
**I need** loading states that prevent layout shift  
**So that** the UI feels stable and professional

**Acceptance Criteria:**

- [ ] Skeleton component matches FileRow height and layout exactly
- [ ] Number of skeleton rows matches expected content or fills viewport
- [x] `loading.tsx` file for app-level suspense
- [ ] Transitions between loading → loaded are smooth (no flash)
- [ ] Second visit to same folder: no loading state (cached data)
