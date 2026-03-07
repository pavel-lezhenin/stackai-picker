# ISS-11: Indexing Status — Manual Test Scenarios

All scenarios start from a **fresh page reload** unless noted otherwise.

## Prerequisites

- Connection with Google Drive containing:
  - Root folders: `acme/`, `books/`, `clients/`
  - Root files: `readme.txt`, `notes.txt`
  - `acme/` contains files (`report.pdf`, `data.csv`)
  - `books/` contains subfolder `chapters/` and file `summary.txt`
  - `chapters/` contains files (`chapter1.txt`, `chapter2.txt`)
  - `clients/` contains subfolder `archived/` with files
  - `archived/` contains subfolder `2024/` with files (3 levels deep)
  - An empty folder `empty/` with no files
  - A folder `mixed/` with both files and a subfolder containing files

---

## Category A: Single Resource Indexing

### A1: Single folder with only files — wait for completion

**Steps:**

1. Navigate to root
2. Click "Index" on `acme/` (contains only files)
3. Wait until status changes

**Expected:**

- Folder shows "Pending" immediately
- After server processing, folder shows "Indexed" (green)
- Polling stops after all files are indexed

### A2: Single FILE — click index on a file (not a folder)

**Steps:**

1. Navigate to root
2. Click "Index" on `readme.txt` (a root-level file)
3. Wait

**Expected:**

- File shows "Pending" immediately
- File transitions to "Indexed"
- No folder resolution needed (no fetchFolderChildren call)

### A3: Single file inside a folder — navigate inside, then index

**Steps:**

1. Navigate into `acme/`
2. Click "Index" on `report.pdf` (single file inside folder)
3. Wait

**Expected:**

- `report.pdf` shows "Pending" → "Indexed"
- Other files in `acme/` remain "Not Indexed"
- `acme/` at root does NOT show "Indexed" (only one file was indexed)

### A4: Empty folder — no files inside

**Steps:**

1. Navigate to root
2. Click "Index" on `empty/`

**Expected:**

- Toast: "'empty' is empty — skipped"
- Folder does NOT show "Pending" (reverts immediately)
- No KB mutation sent

### A5: Folder with nested subfolders — wait for completion

**Steps:**

1. Click "Index" on `books/` (contains `chapters/` subfolder + `summary.txt`)
2. Wait for pending → completion

**Expected:**

- `books/` shows "Pending" then "Indexed"
- Navigate inside: `chapters/` shows "Indexed", `summary.txt` shows "Indexed"
- Navigate into `chapters/`: `chapter1.txt`, `chapter2.txt` show "Indexed"

### A6: Deeply nested folder (3+ levels)

**Steps:**

1. Click "Index" on `clients/` from root
2. Wait for completion

**Expected:**

- `clients/` shows "Pending" then "Indexed"
- Navigate inside: `archived/` shows "Indexed"
- Navigate into `archived/`: `2024/` shows "Indexed"
- Navigate into `2024/`: all files show "Indexed"
- All levels resolved correctly through recursive fetchFolderChildren

### A7: Folder with only subfolders (no direct files)

**Steps:**

1. Have a folder that contains only subfolders (no direct files), each subfolder has files
2. Click "Index" on that folder
3. Wait

**Expected:**

- Folder shows "Pending" → "Indexed"
- Subfolders inside show "Indexed" (derived from their children)
- All leaf files at every level show "Indexed"

---

## Category B: Navigation During Indexing

### B1: Navigate inside immediately after clicking Index

**Steps:**

1. Click "Index" on `acme/`
2. Immediately double-click to navigate inside (don't wait)

**Expected:**

- Inside the folder, all files show "Pending"
- Files transition to "Indexed" as server processes them
- No files get stuck in "Pending"

### B2: Navigation persistence — cached statuses after completion

**Steps:**

1. Index `acme/`, wait for "Indexed"
2. Navigate to root
3. Navigate back into `acme/`

**Expected:**

- All files still show "Indexed" (cached via TanStack Query staleTime)
- No flash of "Not Indexed"

### B3: Navigate between indexed and unindexed folders

**Steps:**

1. Index `acme/`, wait for "Indexed"
2. Navigate to root
3. Navigate into `clients/` (unindexed)
4. Navigate back to root
5. Navigate into `acme/`

**Expected:**

- `acme/` files still show "Indexed"
- `clients/` files show "Not Indexed"
- No cross-contamination of statuses

### B4: Navigate inside nested folder during indexing

**Steps:**

1. Click "Index" on `books/` from root
2. Navigate into `books/`
3. Navigate into `chapters/`

**Expected:**

- `chapters/` shows "Pending" (derived from its children)
- `summary.txt` shows "Pending" then "Indexed"
- Inside `chapters/`: files show "Pending" then "Indexed"
- Navigate back to `books/`: `chapters/` shows "Indexed"

### B5: Navigate to completely different folder tree during pending

**Steps:**

1. Click "Index" on `books/` from root
2. Navigate into `clients/` (different branch)
3. Wait a bit
4. Navigate back to root

**Expected:**

- `books/` is still "Pending" or already "Indexed" (not lost)
- Indexing continues in background regardless of navigation
- No "Error" on `books/`

### B6: Navigate away and back — then check subfolder statuses

**Steps:**

1. Click "Index" on `books/` from root
2. Navigate into `acme/` (different folder)
3. Wait ~20 seconds
4. Navigate back to root
5. Navigate into `books/`
6. Navigate into `chapters/`

**Expected:**

- If indexing completed: all files show "Indexed"
- If still pending: files show "Pending" (poll catches up)
- No stuck states

---

## Category C: Sequential Indexing (One After Another)

### C1: Two folders — second after first completes

**Steps:**

1. Click "Index" on `books/`, wait → "Indexed"
2. Click "Index" on `clients/`, wait → "Indexed"

**Expected:**

- Both folders show "Indexed"
- No errors on either folder
- Second mutation includes files from first (via allSubmittedResources ref)

### C2: Second folder indexed from a different directory level

**Steps:**

1. Click "Index" on `books/` from root, wait → "Indexed"
2. Navigate into `clients/archived/`
3. Click "Index" on a file inside `archived/`
4. Wait → "Indexed"
5. Navigate back to root

**Expected:**

- `books/` still shows "Indexed"
- The file inside `archived/` shows "Indexed"
- No folder reverts to "Error"

### C3: Cross-job — one job completes while another is pending

**Steps:**

1. Click "Index" on `clients/` (job A — large, takes longer)
2. Navigate into `books/` → click "Index" on `chapters/` (job B — smaller, finishes first)
3. Wait for `chapters/` → "Indexed"
4. Navigate back to root

**Expected:**

- `clients/` stays "Pending" (NOT "Error") while its job still processes
- Rule 2 does NOT fire across jobs (scoped by jobRootId)
- `clients/` eventually becomes "Indexed"
- `books/` shows partial status derived from `chapters/` being indexed

### C4: Index parent folder, then separately index a child subfolder

**Steps:**

1. Click "Index" on `books/` from root, wait → "Indexed"
2. Navigate into `books/`
3. Click "Index" on `chapters/` specifically

**Expected:**

- `chapters/` is already indexed (from parent indexing)
- Second index is a no-op or deduplicates correctly via alreadyIndexed
- No duplicate entries, no errors

### C5: Index a file inside an already-indexed folder

**Steps:**

1. Click "Index" on `acme/` from root, wait → "Indexed"
2. Navigate into `acme/`
3. Click "Index" on `report.pdf` (already indexed)

**Expected:**

- File already shows "Indexed" — the Index button should be disabled/hidden
- If somehow triggered: deduplication via alreadyIndexed prevents double-submit
- No error, no state corruption

---

## Category D: Rapid-Fire / Concurrent Indexing

### D1: Three folders indexed in quick succession (single clicks)

**Steps:**

1. Fresh page reload
2. Click "Index" on `acme/`
3. Immediately click "Index" on `books/`
4. Immediately click "Index" on `clients/`
5. Wait

**Expected:**

- All 3 show "Pending" immediately (handleIndex shows pending before queue runs)
- Queue serializes: acme mutation → books mutation (includes acme files) → clients mutation (includes all)
- All 3 eventually show "Indexed"
- mutationSeqRef ensures only the LAST KB id is kept

### D2: Two rapid clicks on the SAME folder

**Steps:**

1. Click "Index" on `acme/`
2. Immediately click "Index" on `acme/` again (double-click on index button)

**Expected:**

- Only one indexing job runs (or second is a no-op via dedup)
- Folder shows "Pending" → "Indexed"
- No stuck state, no error

### D3: Rapid single clicks with folders of different sizes

**Steps:**

1. Click "Index" on `acme/` (2 files — fast to process)
2. Immediately click "Index" on `clients/` (many nested files — slow to process)
3. Wait

**Expected:**

- Both show "Pending"
- `acme/` resolves to "Indexed" earlier
- `clients/` stays "Pending" until its files are done (Rule 2 jobRootId scoping)
- `clients/` eventually shows "Indexed"
- No cross-job contamination

---

## Category E: Batch Indexing

### E1: Batch select folders + Index Selected

**Steps:**

1. Fresh page reload
2. Select `acme/`, `books/`, `clients/` using checkboxes
3. Click "Index Selected"
4. Wait

**Expected:**

- All 3 show "Pending" immediately
- Single mutation with ALL files from all 3 folders
- All 3 transition to "Indexed"
- Selection is cleared after action

### E2: Batch select mix of files and folders

**Steps:**

1. Select `acme/` (folder) + `readme.txt` (file) using checkboxes
2. Click "Index Selected"
3. Wait

**Expected:**

- Both show "Pending"
- Folder is resolved to its children, file is included directly
- All files indexed in one mutation
- Both show "Indexed"

### E3: Batch index, then immediately single-click index another

**Steps:**

1. Select `acme/`, `books/` → click "Index Selected"
2. Immediately click "Index" on `clients/` (single click)
3. Wait

**Expected:**

- All 3 folders show "Pending"
- Queue serializes: batch mutation → single mutation (includes previous files)
- All 3 eventually show "Indexed"
- No folder stuck or errored

### E4: Batch select skips already-indexed resources

**Steps:**

1. Index `acme/`, wait → "Indexed"
2. Select `acme/` (indexed) + `books/` (not indexed)
3. Click "Index Selected"

**Expected:**

- Only `books/` gets indexed (handleBatchIndex filters: `status === null || status === 'resource'`)
- `acme/` remains "Indexed" — not re-submitted
- No error

### E5: Batch with only already-indexed resources

**Steps:**

1. Index `acme/` and `books/`, wait → both "Indexed"
2. Select both
3. Click "Index Selected"

**Expected:**

- Nothing happens (toIndex.length === 0, mutation not fired)
- No toast, no state change
- Selection cleared

---

## Category F: Error Cases & Recovery

### F1: Network error during folder resolution (fetchFolderChildren fails)

**Steps:**

1. Disconnect network / simulate API failure
2. Click "Index" on `acme/`

**Expected:**

- Folder shows "Pending" briefly
- Toast: "Failed to load folder contents"
- Folder status reverts (submitted entry cleaned up)
- No stuck "Pending"

### F2: KB creation mutation fails (server error)

**Steps:**

1. Simulate API error on knowledge-base creation endpoint
2. Click "Index" on `acme/`

**Expected:**

- Folder shows "Pending" during attempt
- After failure: submitted entries cleaned up
- `isPendingIndex` resets to false
- No stuck "Pending", folder returns to original status

### F3: Timeout — server never processes files (60 seconds)

**Steps:**

1. Index a folder
2. Server accepts but never transitions files from pending to indexed
3. Wait >60 seconds

**Expected:**

- After `INDEXING_TIMEOUT_MS` (60s), file entries resolve to "Error"
- Folder status becomes "Error" (derived from children)
- `resolveTimeouts` periodic check catches entries even if user doesn't navigate
- User can attempt to re-index

### F4: Partial server failure — some files indexed, some absent from KB

**Steps:**

1. Index `books/` (contains `summary.txt`, `chapter1.txt`, `chapter2.txt`)
2. Server indexes `summary.txt` and `chapter1.txt` but `chapter2.txt` never appears in KB

**Expected:**

- `summary.txt` and `chapter1.txt` → "Indexed" (Rule 1)
- `chapter2.txt`: if all KB files done + job sibling in KB → "Error" (Rule 2)
- `books/` shows "Indexed" or "Error" depending on timing
  - If timeout triggers first → "Error" for ch2 → folder derives to "Indexed" (has at least one indexed child)

### F5: Re-index after error/timeout

**Steps:**

1. Index `acme/`, wait for timeout → files show "Error"
2. Click "Index" on `acme/` again

**Expected:**

- Files reset to "Pending" (submittedIds entries overwritten with new timestamp)
- Fresh indexing attempt with new mutation
- If server works this time → files transition to "Indexed"
- Old error state replaced by new pending → success flow

### F6: Re-index a folder after partial error

**Steps:**

1. Index `books/`, some files error out (Rule 2 or timeout)
2. Click "Index" on `books/` again

**Expected:**

- All children re-submitted as "Pending" with new `submittedAt` timestamp
- Previously errored files get a fresh chance
- allSubmittedResources updated with new entries
- If server processes all → everything "Indexed"

---

## Category G: Edge Cases & Deduplication

### G1: Same file name in different folders (name collision)

**Steps:**

1. Have `books/readme.txt` and `clients/readme.txt`
2. Index `books/` → wait → "Indexed"
3. Index `clients/` → wait

**Expected:**

- Both resolve correctly — matching uses resourceId first, name as fallback
- `clients/readme.txt` does NOT inherit status from `books/readme.txt`
- No cross-folder name collision

### G2: File with unusual extension or no extension

**Steps:**

1. Have a file like `.DS_Store` or `Makefile` (no extension) in a folder
2. Index the folder

**Expected:**

- All files submitted regardless of extension (no client-side filtering)
- Server decides what to process
- If server skips a file → it stays absent from KB → Rule 2 marks "Error" or timeout

### G3: Already-indexed resource — UI guard

**Steps:**

1. Index `acme/`, wait → "Indexed"
2. Look at the Index button on `acme/`

**Expected:**

- Index button should be hidden/disabled for "Indexed" resources
- `canBatchIndex` filters: only `status === null || status === 'resource'`
- User cannot accidentally re-trigger indexing on an indexed item

### G4: Index while pending — double-trigger guard

**Steps:**

1. Click "Index" on `books/`
2. While `books/` is still "Pending", click "Index" on `books/` again

**Expected:**

- Second click either blocked by UI (disabled while pending) or queued
- If queued: deduplication prevents duplicate entries
- No orphaned "Pending" states

### G5: Multiple single files from root

**Steps:**

1. Click "Index" on `readme.txt`
2. Immediately click "Index" on `notes.txt`
3. Wait

**Expected:**

- Both files show "Pending"
- Queue serializes: first mutation → second mutation (includes first file)
- Both show "Indexed"

---

## Category H: Interaction with UI Features

### H1: Index with active search filter

**Steps:**

1. Type "chapter" in search bar → only `chapter1.txt`, `chapter2.txt` visible (if inside `books/chapters/`)
2. Select visible results and click "Index Selected"

**Expected:**

- Only visible/filtered items are submitted
- Selected items show "Pending"
- After indexing: items show "Indexed" in search results
- Clear search: other items in folder show correct original status

### H2: Index with status filter active ("Not Indexed")

**Steps:**

1. Set status filter to "Not Indexed"
2. Click "Index" on a visible item
3. Wait for completion

**Expected:**

- Item shows "Pending" → "Indexed"
- Once "Indexed", item disappears from "Not Indexed" filter view
- Switch to "All" → item shows "Indexed"

### H3: Indexing status survives sort change

**Steps:**

1. Click "Index" on `books/`
2. While pending, click sort header (change sort order)
3. Wait

**Expected:**

- Sort changes, but "Pending" status preserved on `books/`
- After completion: `books/` shows "Indexed" in new sort order
- No state loss from re-sort

### H4: Selection state during indexing

**Steps:**

1. Select `acme/`, click "Index Selected" → "Pending"
2. Try to select `acme/` again while pending

**Expected:**

- Pending items are NOT selectable (`selectableResourceIds` filters `status !== 'pending'`)
- Cannot batch-operate on pending items

---

## Category I: KB / Session State

### I1: Page reload while files are being indexed

**Steps:**

1. Click "Index" on `books/`, see "Pending"
2. Reload the page (F5)

**Expected:**

- `submittedIds` is lost (useState reset)
- If server already created KB: `kbResources` may show files with `status: 'indexed'` or `status: 'parsed'`
- `useResourceMerge` picks up server status → items show "Indexed"
- If server hasn't finished: items show "Not Indexed" (no submitted tracking)
- No crash, no stuck state

### I2: KB exists from prior indexing — then index more

**Steps:**

1. Index `acme/`, wait → "Indexed"
2. Note that kbId is set
3. Click "Index" on `books/`

**Expected:**

- New mutation includes BOTH `acme/` files (via alreadyIndexed from kbResources) + new `books/` files
- kbId updated to latest KB (via mutationSeqRef)
- All files end up in the same KB
- Both `acme/` and `books/` show "Indexed"

### I3: Polling stops after all active jobs complete

**Steps:**

1. Index `acme/`, wait → all "Indexed"
2. Check network tab

**Expected:**

- `hasActiveJobs` becomes false
- `useKBResources` refetchInterval returns false → polling stops
- No unnecessary network requests after completion

---

## Category K: Deindex (Remove from Knowledge Base)

> **Deindex** removes a file from the KB but keeps it visible in the file list.
> Uses `engine.deindex(resourceId)` → `deleteMutation.mutate(path)`.
> File returns to "Not Indexed" status. Available for files AND folders with status `indexed`.

### K1: Deindex a single indexed file

**Steps:**

1. Index `acme/`, wait → "Indexed"
2. Navigate into `acme/`
3. Hover over `report.pdf` "Indexed ✓" badge → click "De-index"

**Expected:**

- `report.pdf` status returns to `null` (not indexed) immediately
- Engine removes entry from `_entries` and `_allSubmittedResources`
- `getDisplayStatus('report.pdf')` returns `null`
- API call: `DELETE /knowledge-bases/{kbId}/resources` with `resource_path`
- Toast: "Removed 'report.pdf' from Knowledge Base"
- `acme/` folder status at root may change (depends on remaining indexed siblings)

### K2: Deindex one file — sibling stays indexed

**Steps:**

1. Index `acme/` (contains `report.pdf`, `data.csv`), wait → both "Indexed"
2. Deindex `report.pdf`

**Expected:**

- `report.pdf` → `null` (not indexed)
- `data.csv` stays "Indexed" — unaffected
- `acme/` folder at root: still shows "Indexed" (has at least one indexed child via KB)
- Engine: only `report.pdf` removed from tracking

### K3: Deindex all files in a folder → folder status reverts

**Steps:**

1. Index `acme/` (2 files), wait → "Indexed"
2. Deindex `report.pdf`
3. Deindex `data.csv`

**Expected:**

- Both files return to `null`
- `acme/` folder status: `null` (no children in engine or KB)
- `getDisplayStatus('acme')` returns `null`
- KB resources query returns empty after both removed

### K4: Deindex then re-index the same file

**Steps:**

1. Index `readme.txt`, wait → "Indexed"
2. Deindex `readme.txt` → `null`
3. Index `readme.txt` again

**Expected:**

- File goes: `null` → "Pending" → "Indexed"
- Engine creates fresh entry with new `submittedAt` timestamp
- New KB created (or existing KB updated) containing the file
- No stale state from prior indexing

### K5: Deindex during active polling (KB still refreshing)

**Steps:**

1. Index `books/` (3 files), some still "Pending"
2. While polling is active, deindex `summary.txt` (already indexed)

**Expected:**

- `summary.txt` removed from engine tracking immediately
- Engine still tracks `chapter1.txt`, `chapter2.txt` as pending
- Polling continues for remaining pending files
- `resolveFromKBData` does NOT re-add `summary.txt` to tracking (it's been deindexed)
- `books/` folder status: still "Pending" (has pending children)

### K6: Deindex API failure — no rollback in engine (known limitation)

**Steps:**

1. Index `acme/`, wait → "Indexed"
2. Simulate API error
3. Deindex `report.pdf`

**Expected (current behavior):**

- Engine removes entry immediately (optimistic)
- `getDisplayStatus` returns `null` immediately
- API call fails → `deleteMutation.onError` rolls back KB cache
- But engine state is NOT rolled back — `report.pdf` stays `null` in engine
- KB cache rollback means `kbResources` still contains `report.pdf` as indexed
- `useResourceMerge` picks up KB status → file may show "Indexed" from server truth
- **Known gap**: engine doesn't have rollback for deindex

### K7: Batch deindex — multiple selected indexed files

**Steps:**

1. Index `acme/` and `books/`, wait → "Indexed"
2. Navigate to root, select both folders
3. Click "De-index" in selection toolbar

**Expected:**

- `handleBatchDeindex` loops: calls `handleDeindex` for each resource with `status === 'indexed'`
- Each call fires separate API `DELETE` (N calls for N resources)
- All deindexed resources return to `null`
- Both folders show "Not Indexed"
- Selection cleared after action

### K8: Deindex a folder (not individual files)

**Steps:**

1. Index `acme/`, wait → "Indexed"
2. At root, deindex `acme/` folder directly (context menu → "Remove from Knowledge Base")

**Expected:**

- `engine.deindex('acme')` — removes folder from `_entries`
- But children (`report.pdf`, `data.csv`) may still be tracked with `jobRootId: 'acme'`
- `getDisplayStatus('acme')` derives from children via `jobRootId` — may still show "Indexed"
- **Question**: should deindex folder also deindex all children? Currently it does NOT.
- API call with folder's `resource_path` — server behavior for folder deindex unclear

---

## Category L: Delete (Remove from listing with confirmation)

> **Delete** removes a file from the KB AND hides it from the UI list.
> Uses `useDeleteFlow` with confirmation dialog + exit animation.
> Only available for **files** (not folders) with status `indexed`.
> Same API endpoint as deindex. Does NOT call `engine.deindex()`.

### L1: Delete a single indexed file (with confirmation)

**Steps:**

1. Index `acme/`, wait → "Indexed"
2. Click 🗑️ on `report.pdf`
3. Confirm in dialog

**Expected:**

- `DeleteConfirmDialog` opens: "Remove 'report.pdf'?"
- User clicks "Remove"
- `deletingId` set → exit animation (opacity/scale transition)
- After animation: row hidden via `hiddenResourceIds`
- API call: `DELETE /knowledge-bases/{kbId}/resources`
- Toast: "Removed 'report.pdf' from Knowledge Base"
- File disappears from list, does NOT come back on next render

### L2: Delete — cancel confirmation

**Steps:**

1. Click 🗑️ on `report.pdf`
2. Click "Cancel" in dialog

**Expected:**

- Dialog closes
- No API call fired
- No state changes — file stays "Indexed"

### L3: Delete API failure — row unhides (rollback)

**Steps:**

1. Delete `report.pdf`, confirm
2. API returns error

**Expected:**

- Row is hidden optimistically (animation → hide)
- API fails → `onError` removes resourceId from `hiddenResourceIds`
- Row reappears in list with "Indexed" status
- Toast: "Failed to remove 'report.pdf'"
- KB cache rolled back via `onMutate` snapshot

### L4: Delete does NOT affect engine tracking

**Steps:**

1. Index `acme/`, wait → "Indexed"
2. Delete `report.pdf`

**Expected:**

- `useDeleteFlow` handles hiding and API call
- `engine.deindex()` is NOT called (delete flow doesn't touch engine)
- Engine still has `report.pdf` in `_entries` with status `indexed`
- After KB cache invalidation, `kbResources` no longer contains `report.pdf`
- `useResourceMerge` won't find it in KB → merged status may be stale
- **Question**: should delete also call `engine.deindex()`?

### L5: Batch delete — multiple files, no confirmation dialog

**Steps:**

1. Index `acme/` and `books/`, wait → "Indexed"
2. Select `report.pdf`, `data.csv`, `summary.txt`
3. Click "Delete" in selection toolbar

**Expected:**

- No confirmation dialog (batch skips it — calls `handleBatchDelete` directly)
- All selected files immediately added to `hiddenResourceIds`
- N separate API calls fired (one per file)
- All files hidden from list
- Selection cleared
- If any API call fails → that specific row unhides

### L6: Delete is not available for folders

**Steps:**

1. Index `acme/`, wait → "Indexed"
2. Look at `acme/` folder row

**Expected:**

- No 🗑️ button visible (guard: `!isFolder && isIndexed`)
- Context menu does not show "Remove from listing" for folders
- `canBatchDelete` filters: `r.type !== 'folder'`

### L7: Interaction — deindex then delete same file (edge case)

**Steps:**

1. Index `readme.txt`, wait → "Indexed"
2. Deindex `readme.txt` → status `null`
3. Try to delete `readme.txt`

**Expected:**

- Delete button/menu item NOT available (status is `null`, not `indexed`)
- User cannot delete a non-indexed file

### L8: Interaction — delete then re-index (file was hidden)

**Steps:**

1. Index `readme.txt`, wait → "Indexed"
2. Delete `readme.txt` (hidden from list)
3. Navigate away and back (or page reload)

**Expected:**

- `hiddenResourceIds` is `useState` — lost on unmount/reload
- If file comes back in connection resource listing: shows as "Not Indexed"
- Can be re-indexed normally

---

## Category M: Delete/Deindex + Indexing Interactions

> Cross-cutting scenarios where delete/deindex happens during or around indexing operations.

### M1: Index a folder, then deindex one child before others finish

**Steps:**

1. Index `books/` (3 files), `summary.txt` finishes first → "Indexed"
2. Deindex `summary.txt` while `chapter1.txt` and `chapter2.txt` are still "Pending"

**Expected:**

- `summary.txt` removed from engine
- `chapter1.txt`, `chapter2.txt` continue pending → resolve normally
- `books/` folder status derived from remaining children only
- Rule 2 scoping: `summary.txt` is gone from entries, so no "job sibling" for Rule 2

### M2: Deindex a file, then index the parent folder

**Steps:**

1. Index `acme/` → both files "Indexed"
2. Deindex `report.pdf` → `null`
3. Index `acme/` again from root

**Expected:**

- `acme/` folder re-indexed: `fetchFolderChildren` returns both files
- `report.pdf` gets fresh pending entry
- `data.csv` included via `alreadyIndexed` (still in KB)
- Both files end up "Indexed"

### M3: Delete a file while its folder is being indexed

**Steps:**

1. Index `acme/`, files go to "Pending"
2. While pending, delete `report.pdf` (if delete button visible on pending — it shouldn't be)

**Expected:**

- Delete button should NOT be visible for "Pending" files (guard: `isIndexed`)
- If somehow triggered: `hiddenResourceIds` hides the row
- Engine still tracks `report.pdf` as pending
- Resolution continues — but file is hidden from view
- Potential inconsistency if file resolves to "Indexed" while hidden

### M4: Rapid deindex + re-index same file

**Steps:**

1. Index `readme.txt`, wait → "Indexed"
2. Click "De-index" on `readme.txt`
3. Immediately click "Index" on `readme.txt` (before API completes)

**Expected:**

- Deindex: engine removes entry, fires API DELETE
- Index: engine creates fresh pending entry, enqueues mutation
- Final state depends on race:
  - If deindex API completes first: file removed from KB, then re-added → "Indexed"
  - If index fires before deindex completes: new KB includes the file → "Indexed"
- Should not crash or leave stuck state

### M5: Batch mixed operation — some indexed (can deindex), some not (can index)

**Steps:**

1. Index `acme/`, wait → "Indexed"
2. `books/` is "Not Indexed"
3. Select both `acme/` and `books/`
4. Click "Index Selected"

**Expected:**

- `handleBatchIndex` filters: only `status === null || status === 'resource'` → only `books/`
- `acme/` already indexed → skipped (included in `alreadyIndexed`)
- `books/` gets indexed normally
- Both end up "Indexed"

### M6: Deindex folder while another folder is still indexing (polling active)

**Steps:**

1. Index folders `acme/`, `books/`, `clients/` — all complete → "Indexed"
2. Start indexing folder `mixed/` → "Pending", polling active
3. Deindex folder `books/` while polling runs

**Expected:**

- `books/` and ALL its children (`summary.txt`, `chapter1.txt`, `chapter2.txt`) removed from engine
- All child IDs added to `_deindexedIds` to prevent stale KB cache override
- `getDisplayStatus('books')` → `null`
- `getDisplayStatus('summary.txt')` → `null` (not 'indexed')
- `useResourceMerge` ignores stale server 'indexed' for all deindexed IDs
- `mixed/` folder indexing continues unaffected
- Polling does NOT re-add `books/`'s children back to engine

**Bug (current):** `engine.deindex('books')` only removes the folder pseudo-entry (already gone
after expand). Children entries remain with `status: 'indexed'` and `jobRootId: 'books'`.
`getDisplayStatus('books')` derives 'indexed' from children → folder reverts to "Indexed".
