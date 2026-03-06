# Implemented Features

> Snapshot of all features shipped in the current build.
> For requirements traceability see [`USER_STORIES.md`](./USER_STORIES.md).
> For the quality bar used during development see [`ACCEPTANCE_CRITERIA.md`](./ACCEPTANCE_CRITERIA.md).

---

## File Browsing

- **Root listing** — displays all Google Drive files and folders from the connected account on mount.
- **Folder navigation** — double-click (or single-click the folder name) to enter a folder; mirrors Finder / Google Drive behaviour.
- **Breadcrumb trail** — `Root > Documents > Reports` with clickable segments; ellipsis dropdown for paths deeper than 4 segments.
- **Back navigation** — back-arrow button + keyboard (`Backspace` / `Alt+←`) navigates to the parent folder; disabled at root.
- **Cache-first navigation** — returning to a previously visited folder shows data instantly with no spinner (`staleTime: 5 min`).
- **Folder-first sorting** — folders are always pinned above files regardless of active sort direction.

---

## File & Folder Display

- **File type icons** — contextual icons for PDF, Google Doc, Sheet, Slide, Image, Folder, and generic file; driven by an extensible `Record<mimeType, { icon, label }>` map (adding a new type requires zero component changes).
- **Status badge** — per-row pill showing `Indexed` (green), `Pending` (yellow + pulse animation), or `Not Indexed` (muted); consistent fixed width so status changes cause zero layout shift.
- **Modified date** — human-readable date column derived from the API `modified_at` field.
- **Highlighted search matches** — matching substring in file names is bolded in search results.
- **Empty folder state** — illustration + "This folder is empty" message when a folder has no children.

---

## Sorting

- **Clickable column headers** — "Name" and "Modified" columns are sortable; active column is highlighted.
- **Direction indicators** — ▲ / ▼ icons next to the active column header.
- **Sort options** — Name A→Z, Name Z→A, Date newest first, Date oldest first.
- **Client-side** — sort is applied instantly without an API round-trip; sort preference persists across folder navigations within the session.

---

## Search & Filter

- **Real-time search** — client-side filtering as the user types (300 ms debounce); no API call needed.
- **Keyboard shortcut** — `/` focuses the search input from anywhere in the file list; `Escape` clears the query and returns focus to the list.
- **Clear button** — × icon inside the input resets the query.
- **No-results state** — "No files matching '…'" message with a hint to clear the search.
- **Status filter bar** — one-click filter tabs to show All / Indexed / Pending / Not Indexed rows.
- **Auto-reset** — search query clears automatically when navigating into a different folder.

---

## Selection & Batch Actions

- **Per-row checkboxes** — click a checkbox to select an individual file or folder.
- **Select All** — header checkbox with three states: none / indeterminate (some) / all.
- **Shift+Click range selection** — selects a contiguous range, matching native file manager behaviour.
- **Drag (rubber-band) selection** — `Alt`+click-and-drag on the canvas to lasso multiple rows; regular clicks and text selection are unaffected.
- **Selection toolbar** — slides in when ≥ 1 item is selected; shows selection count and batch action buttons (Index, De-index, Delete).
- **Pending exclusion** — rows in `pending` state cannot be selected.
- **Selection cleared on navigation** — moving into a different folder resets the selection.

---

## Indexing

- **Per-row Index action** — index button/toggle on each file or folder row.
- **Batch Index** — "Index Selected" button in the selection toolbar indexes all selected items in one operation.
- **Optimistic status update** — status badge changes to `Pending` immediately; rolls back on error.
- **Folder de-duplication** — when a folder is indexed, its children are automatically excluded from `connection_source_ids` (no double-indexing).
- **Status polling** — after sync is triggered, the hook polls until all pending items resolve to `indexed` or an error state.
- **Success toast** — "Started indexing 'filename'" with the specific resource name.

---

## De-indexing

- **Per-row De-index action** — available on rows with `Indexed` status.
- **Batch De-index** — "De-index Selected" in the selection toolbar.
- **Optimistic update** — status reverts to `Not Indexed` immediately; rolls back on error.
- **File kept in listing** — de-indexing only removes the resource from the Knowledge Base; the row stays visible.

---

## Deletion

- **Per-row Delete** — trash icon revealed on row hover (or via right-click context menu).
- **Batch Delete** — "Delete Selected" in the selection toolbar.
- **Confirmation dialog** — Shadcn `AlertDialog` showing the exact file name: _"Remove 'Q4 Report.pdf'? This won't delete it from Google Drive."_
- **Optimistic removal** — row fades out and disappears immediately; reappears in its original position on error.
- **Error toast** — specific message including the file name if the API call fails.

---

## Context Menu

- **Right-click menu** — native-feeling context menu on file/folder rows with actions: Open folder, Index, De-index, Delete.
- **Keyboard-accessible** — context menu is reachable via the keyboard (`Shift+F10` / `Apps` key).

---

## Error Handling & Loading States

- **Skeleton loaders** — loading state uses skeleton rows that match the exact height, column widths, icon size, badge width, and checkbox dimensions of real rows — zero layout shift (CLS = 0).
- **Error card** — full-width error card with a human-readable message and a "Try Again" button.
- **Global error boundary** — `error.tsx` catches unhandled errors at the app level.
- **Component-level error boundary** — `FileBrowserErrorBoundary` isolates the file list from the rest of the page.
- **Toast notifications** — Shadcn Sonner for all user-facing feedback with contextual, specific messages (never generic "Something went wrong").
- **Optimistic rollback** — every mutation snapshots the previous cache state in `onMutate` and restores it in `onError`.

---

## Keyboard Navigation

| Key                   | Action                               |
| --------------------- | ------------------------------------ |
| `Enter`               | Open focused folder                  |
| `Backspace` / `Alt+←` | Navigate to parent folder            |
| `/`                   | Focus search input                   |
| `Escape`              | Clear search and blur input          |
| `Space`               | Toggle selection on focused row      |
| `Shift+Click`         | Range-select rows                    |
| `Tab`                 | Move focus through rows and controls |
| `Shift+F10`           | Open context menu on focused row     |

---

## Accessibility

- `role="grid"` / `role="row"` / `role="gridcell"` semantics on the file list.
- `aria-label` on all icon-only buttons.
- `aria-selected` on selected rows.
- `aria-live` regions announce status changes to screen readers.
- Focus trap inside confirmation dialogs.
- Focus-visible rings on all interactive elements (Shadcn defaults).
- Proper colour contrast on all text and interactive elements.

---

## BFF Proxy & Security

- **All API calls server-side** — no Stack AI credentials are ever sent to the browser; no `NEXT_PUBLIC_*` secrets.
- **Token caching** — Supabase auth token acquired once and cached in memory with TTL; not re-fetched on every request.
- **Zod validation** — every API response entering the system is validated against a Zod schema before being used.
- **Consistent error envelope** — all BFF routes return `{ data }` or `{ error, status }` — client code never guesses the error shape.
- **Rate-limit awareness** — `Retry-After` header is forwarded to the client on 429 responses.
