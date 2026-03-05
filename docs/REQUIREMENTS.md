# Requirements & Constraints

## Project Overview

Custom File Picker component for managing Google Drive files within Stack AI platform.
The File Picker enables users to browse, select, index, and manage files/folders
from a connected Google Drive for building Knowledge Bases.

**Evaluation context**: This is a Senior Frontend Engineer take-home task.
Stack AI serves enterprise clients (banks, defense, government). Code quality and
UI polish are equally weighted with functionality.

> See `ACCEPTANCE_CRITERIA.md` for the full WOW factor checklist.
> See `USER_STORIES.md` for implementation specs per feature.

---

## Functional Requirements

### FR-1: File/Folder Browsing (Read)

- **FR-1.1**: Display files and folders from a Google Drive connection in a list view.
- **FR-1.2**: Navigate into folders (drill-down) — equivalent to `ls <folder>`.
- **FR-1.3**: Navigate back to parent folder via breadcrumb navigation (clickable segments).
- **FR-1.4**: Show file metadata: name, type (file/folder), modified date, size.
- **FR-1.5**: Show appropriate icons for different file types (folder, doc, sheet, pdf, image, etc.).
- **FR-1.6**: Folders always appear before files in the listing.

### FR-2: File Deletion (De-listing)

- **FR-2.1**: User can remove a file from the listed items (API only supports file deletion, not folders).
- **FR-2.2**: Deletion does NOT remove the file from Google Drive — it only stops indexing/listing.
- **FR-2.3**: Confirm before deletion using Shadcn AlertDialog (not browser `confirm()`).
- **FR-2.4**: Optimistic update — file disappears immediately, reappears on error with toast.

### FR-3: File/Folder Indexing

- **FR-3.1**: User can select one or more files/folders for indexing.
- **FR-3.2**: Trigger indexing via API for selected items.
- **FR-3.3**: Visual status indicator: "Indexed" (green badge) / "Not Indexed" (gray badge) / "Pending" (pulse).
- **FR-3.4**: Batch indexing via multi-selection + toolbar action.

### FR-4: File/Folder De-indexing

- **FR-4.1**: User can de-index a previously indexed file/folder.
- **FR-4.2**: De-indexing does NOT delete the file from the listing.
- **FR-4.3**: Status transitions immediately (optimistic update) with rollback on error.

### FR-5: Sorting (Bonus — High Impact)

- **FR-5.1**: Sort files/folders by name (A-Z, Z-A) via clickable column headers.
- **FR-5.2**: Sort files/folders by modified date (newest first, oldest first).
- **FR-5.3**: Folders always appear before files (convention, regardless of sort).
- **FR-5.4**: Sort is client-side (instant, no API call).
- **FR-5.5**: Sort preference persists within session.

### FR-6: Filtering & Search (Bonus — High Impact)

- **FR-6.1**: Filter displayed items by name (real-time, client-side, debounced 300ms).
- **FR-6.2**: Search input with clear button and keyboard shortcut (`/` or `Cmd+K`).
- **FR-6.3**: "No results" empty state with clear action.
- **FR-6.4**: Filter resets on folder navigation.

### FR-7: Multi-Selection (Bonus)

- **FR-7.1**: Checkbox on each row for selection.
- **FR-7.2**: "Select All" checkbox in header with indeterminate state.
- **FR-7.3**: Batch actions toolbar: "Index", "De-index", "Delete".
- **FR-7.4**: Selection count in toolbar.
- **FR-7.5**: Selection clears on folder navigation.

---

## Non-Functional Requirements

### NFR-1: Performance (CLS = 0 is the Goal)

- **NFR-1.1**: Zero unnecessary re-renders — `React.memo`, `useMemo`, `useCallback` where appropriate.
- **NFR-1.2**: Optimistic updates on ALL mutations (delete, index, de-index).
- **NFR-1.3**: Skeleton loaders matching EXACT dimensions of loaded content (zero CLS).
- **NFR-1.4**: `staleTime` preventing refetches — cached folders load instantly on re-visit.
- **NFR-1.5**: No waterfall requests — parallel data loading where possible.
- **NFR-1.6**: Debounced search input (300ms).

### NFR-2: Code Quality (This Is What Gets You Hired)

- **NFR-2.1**: SOLID principles applied consistently (see copilot-instructions).
- **NFR-2.2**: TypeScript strict mode — zero `any` types.
- **NFR-2.3**: Zod validation at API boundaries (external data entering the system).
- **NFR-2.4**: Clear separation: Types → API Routes → Hooks → Components.
- **NFR-2.5**: Named exports only (no `export default` except Next.js route files and framework configs).
- **NFR-2.6**: Consistent import order: react → next → external → internal → types.
- **NFR-2.7**: Components <100 lines ideal, <150 max (SRP enforcement).
- **NFR-2.8**: Comments on "why" not "what" — only where non-obvious.
- **NFR-2.9**: Zero `console.log` in production code.

### NFR-3: UI/UX (Enterprise Polish)

- **NFR-3.1**: Responsive design (desktop primary, tablet functional).
- **NFR-3.2**: Keyboard accessible: Tab navigation, Enter to open, Space to select.
- **NFR-3.3**: ARIA labels on icon-only buttons.
- **NFR-3.4**: Visually consistent with Shadcn UI design system.
- **NFR-3.5**: Empty states: icon + message (not blank space).
- **NFR-3.6**: Error states: message + "Try Again" button.
- **NFR-3.7**: Hover states on all interactive elements.
- **NFR-3.8**: Smooth transitions on state changes (0.15-0.2s, ease-out).
- **NFR-3.9**: Toast notifications with specific messages (not generic "Error").
- **NFR-3.10**: Professional typography and spacing consistent with enterprise SaaS.

### NFR-4: Architecture

- **NFR-4.1**: Next.js App Router with proper server/client component boundaries.
- **NFR-4.2**: API routes as BFF — credentials NEVER reach the client.
- **NFR-4.3**: TanStack Query for all server state, with query key factory pattern.
- **NFR-4.4**: Environment variables for ALL config — `.env.example` documented.
- **NFR-4.5**: `error.tsx` and `loading.tsx` at app level.

### NFR-5: Security

- **NFR-5.1**: No API tokens/keys in client-side code.
- **NFR-5.2**: Zod validation on all incoming request bodies in API routes.
- **NFR-5.3**: No `dangerouslySetInnerHTML`.
- **NFR-5.4**: Environment variables validated on server startup.
- **NFR-5.5**: `.env.local` in `.gitignore`.

---

## Technical Constraints

### TC-1: Tech Stack (Mandated — Deviation = Rejection)

- Next.js (latest stable — v16.x)
- TanStack Query v5 + fetch
- Tailwind CSS v4
- Shadcn UI (latest)
- TypeScript strict mode
- Zod for runtime validation

### TC-2: API Constraints (see `docs/API_REFERENCE.md` for full details)

- **Base URL**: `https://api.stack-ai.com`
- **Auth**: Supabase token via `https://sb.stack-ai.com/auth/v1/token?grant_type=password`
- **Anon Key**: Required for auth request (store in env var)
- API uses `inode_type: "directory" | "file"` — map to internal `type: 'folder' | 'file'`
- API uses `inode_path.path` for display name
- Responses are **paginated** with `next_cursor` / `current_cursor`
- Indexing is **async** — `sync/trigger` starts background job, resources go `"pending"` → `"indexed"`
- **De-duplication**: Don't index a folder AND its children individually (wastes API work)
- Delete uses `resource_path` (not `resource_id`), only works on files (not folders)
- Rate limits may apply — TanStack Query handles deduplication

### TC-3: Required Environment Variables

```env
# .env.example
STACK_AI_BASE_URL=https://api.stack-ai.com
STACK_AI_SUPABASE_URL=https://sb.stack-ai.com
STACK_AI_SUPABASE_ANON_KEY=<supabase_anon_key>
STACK_AI_EMAIL=<service_account_email>
STACK_AI_PASSWORD=<service_account_password>
```

### TC-4: Deployment

- Must deploy to Vercel.
- Environment variables configured in Vercel dashboard.
- No build errors or warnings in Vercel build log.

---

## Out of Scope

- File creation (upload new files to Google Drive).
- File content editing/updating.
- Multi-connection support (only one Google Drive connection).
- Real-time sync with Google Drive changes.
- Mobile-first design (desktop priority, tablet functional).
