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
