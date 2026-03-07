# ISS-11: Files stuck in "pending" after folder indexing

**Severity**: Critical — functional regression  
**Status**: In Progress — solution designed, pending implementation  
**Affects**: `useIndexing`, `useResourceMerge`, `useKnowledgeBase`, `useFileBrowser`, `useActionButtonHandlers`

---

## 1. Problem

When a user indexes a **folder** and then navigates into that folder (or any
subfolder, or any unrelated folder), files appear stuck in **"pending"** status
indefinitely. They never transition to "indexed" and cannot be selected or
de-indexed.

Additionally: the UI never tells the user that certain files were **silently
skipped** by the backend (e.g. `.DS_Store`) — they just show "pending" forever.

---

## 2. Root Causes

### 2.1 Backend silently skips certain files (cannot fix)

The Stack AI KB API (`GET /v1/knowledge-bases/{id}/resources/children`) does
**not** return files it cannot process. They are completely absent from the
response — no `status: null`, no `status: "skipped"`, nothing. They
simply do not exist in any KB response at any `resource_path`.

This affects: `.DS_Store`, zero-byte files, files with unsupported encodings,
Windows metadata files (`desktop.ini`, `Thumbs.db`), and any file the backend
decides to skip without documentation.

**There is no way to distinguish "still processing" from "permanently skipped"
via the API.** The only signal is: after indexing completes, the file is absent.

### 2.2 `localStatuses: Map<name, status>` marks ALL children as `'pending'`

`handleIndex` for a folder calls `fetchFolderChildren` recursively and sets
every child (including `.DS_Store`) in `localStatuses` as `'pending'`.

Merge rule: `statusPriority('pending') = 2 > statusPriority(null) = 0` →
`localStatus` wins → `.DS_Store` shows `'pending'` forever.

### 2.3 No `clearLocalStatuses()` call anywhere

`useFileBrowser` has no `kbDoneIndexing` effect. The mechanism that was
designed to clear `localStatuses` when the server confirms all files are
indexed was removed in a prior refactor. Without it, `localStatuses` is
never cleaned up — every `'pending'` entry set during indexing lives for
the entire page session.

### 2.4 `data.length === 0 → poll every 1s` causes infinite requests

```typescript
refetchInterval: (query) => {
  if (data.length === 0) return 1000; // ← no guard: polls forever
  ...
}
```

When the user navigates to a folder that has no KB resources (e.g. an
unrelated folder, or a nested path before the KB hierarchy is built),
`data = []` and polling fires every second indefinitely — even when there
is nothing being indexed.

### 2.5 `handleDeindex` uses `path` (string), not `resourceId`

With a `Set<resourceId>`-based approach, `handleDeindex(path)` cannot
remove the correct entry from `submittedIds`. The `resourceId` must be
passed through the call chain.

### 2.6 Async gap: `isPendingIndex` not tracked during `fetchFolderChildren`

Between `handleIndex` start and mutation `onSuccess`, there is an `await`
for `fetchFolderChildren`. During this window `isIndexing = false` (mutation
hasn't started yet). A premature `kbDoneIndexing` effect could fire and clear
`submittedIds` before the mutation even fires.

---

## 3. Navigation Scenarios

| #   | Scenario                                                          | Problem with current code                                                                      |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A   | Index folder, stay at root                                        | `clearLocalStatuses` never fires → `.DS_Store` stuck                                           |
| B   | Index folder, immediately navigate into it                        | `localStatuses` not cleared, stale entries follow user                                         |
| C   | Index folder, navigate into a subfolder                           | Same — cross-level name collision if siblings share filename                                   |
| D   | Index folder, navigate to **unrelated** folder                    | `kbRootQuery` still resolves → but no `kbDoneIndexing` effect → never cleared                  |
| E   | Index folder, navigate deeply before KB builds hierarchy          | `data = []` → infinite polling; `kbDoneIndexing = false` → never clears                        |
| F   | Index single file (control)                                       | Works — user stays on same level, server confirms quickly                                      |
| G   | Index → De-index during pending                                   | `.DS_Store` in `pending` → selectable filter blocks it → can't de-index                        |
| H   | Double-click into folder during `fetchFolderChildren` (async gap) | `isIndexing=false`, if `kbDoneIndexing=true`, effect fires → clears `submittedIds` prematurely |

---

## 4. Decision Tables

### 4.1 Merge rule — per resource

| `submittedIds.has(id)` | `serverStatus` | Displayed status | Correct?                   |
| ---------------------- | -------------- | ---------------- | -------------------------- |
| false                  | null           | null             | ✓ Not indexed              |
| false                  | 'pending'      | 'pending'        | ✓ Server in progress       |
| false                  | 'indexed'      | 'indexed'        | ✓ Done                     |
| true                   | null           | 'pending'        | ✓ Waiting for confirmation |
| true                   | 'pending'      | 'pending'        | ✓ Both agree               |
| true                   | **'indexed'**  | **'indexed'**    | ✓ Server always wins       |

Server `'indexed'` unconditionally overrides `submittedIds`. This means
there is no "stuck" state — if server confirms, it shows; if server never
returns the file, `submittedIds` is cleared by `kbDoneIndexing` and the
file reverts to `null`.

### 4.2 `kbDoneIndexing` clear effect

Variables:

- `D` = `kbRootResources.length > 0`
- `A` = `kbRootResources.every(r => r.status === 'indexed')`
- `Z` = `submittedIds.size > 0`
- `M` = `isIndexing` (mutation `.isPending`)
- `P` = `isPendingIndex` (async gap guard: true from handleIndex start to onSuccess/onError)

`kbDoneIndexing = D && A`

| D        | A        | Z        | M         | P         | Effect fires? | Reason                          |
| -------- | -------- | -------- | --------- | --------- | ------------- | ------------------------------- |
| false    | —        | —        | —         | —         | no            | KB empty / not built yet        |
| true     | false    | —        | —         | —         | no            | Still processing                |
| true     | true     | false    | —         | —         | no            | Nothing to clear                |
| true     | true     | true     | true      | —         | no            | Mutation running                |
| true     | true     | true     | false     | true      | no            | Async gap (fetchFolderChildren) |
| **true** | **true** | **true** | **false** | **false** | **YES**       | ✓ Safe to clear                 |

### 4.3 Polling (`refetchInterval`)

Variables:

- `K` = `kbId` is set
- `D0` = `data === undefined` (query not yet run)
- `L0` = `data.length === 0`
- `Z` = `submittedIds.size > 0` (`hasLocalPending`)
- `AI` = `data.every(r => r.status === 'indexed')`

| K     | D0    | L0    | Z         | AI    | interval  | Correct?                |
| ----- | ----- | ----- | --------- | ----- | --------- | ----------------------- |
| false | —     | —     | —         | —     | disabled  | ✓                       |
| true  | true  | —     | —         | —     | false     | ✓ Wait for first fetch  |
| true  | false | true  | **false** | —     | **false** | ✓ Nothing pending, stop |
| true  | false | true  | true      | —     | 1000      | ✓ KB building hierarchy |
| true  | false | false | —         | false | 1000      | ✓ Waiting for indexed   |
| true  | false | false | —         | true  | false     | ✓ All done, stop        |

Row 3 is the critical fix: previously this returned `1000` unconditionally.

### 4.4 Navigation scenarios — final state after fix

| Scenario                        | kbRootResources         | Z    | kbDoneIndexing | P=false? | Effect fires?     | `.DS_Store` status       |
| ------------------------------- | ----------------------- | ---- | -------------- | -------- | ----------------- | ------------------------ |
| A: Stay at root                 | [refs/ indexed]         | true | true           | yes      | YES               | null ✓                   |
| B: Navigate into indexed folder | [refs/ indexed]         | true | true           | yes      | YES               | null ✓                   |
| C: Navigate into subfolder      | [refs/ indexed]         | true | true           | yes      | YES               | null ✓                   |
| D: Navigate to unrelated folder | [refs/ indexed]         | true | true           | yes      | YES               | null ✓                   |
| E: Navigate before KB builds    | []                      | true | false          | yes      | no (Z poll)       | pending (brief) → null ✓ |
| F: Single file index            | [file indexed]          | true | true           | yes      | YES               | n/a ✓                    |
| G: De-index during pending      | submittedIds removes id | —    | —              | —        | —                 | null ✓                   |
| H: Async gap protection         | P=true                  | —    | false          | **no**   | **no** (P blocks) | pending ✓                |

---

## 5. Proposed Implementation

### 5.1 `useIndexing.ts` — replace `localStatuses: Map<name>` with `submittedIds: Set<resourceId>`

```typescript
const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());
const [isPendingIndex, setIsPendingIndex] = useState(false);

// handleIndex for folder:
setIsPendingIndex(true);
setSubmittedIds(prev => new Set([...prev, resource.resourceId, ...children.map(c => c.resourceId)]));
mutate(..., {
  onSuccess: () => { setKbId(...); setIsPendingIndex(false); toast... },
  onError:   () => { setSubmittedIds(prev => remove added ids); setIsPendingIndex(false); },
});

// handleDeindex: signature becomes (resourceId: string, path: string)
setSubmittedIds(prev => { next.delete(resourceId); return next; });
deleteMutation.mutate(path);

// clearSubmittedIds:
const clearSubmittedIds = useCallback(() => setSubmittedIds(new Set()), []);
```

Remove `isSystemFile()` — not needed with this approach.

### 5.2 `useResourceMerge.ts` — new merge rule

```typescript
// Drop statusPriority function entirely.
// New merge per resource:
const serverStatus = statusById.get(r.resourceId) ?? statusByName.get(r.name) ?? r.status;
const status =
  serverStatus === 'indexed'
    ? 'indexed'
    : submittedIds.has(r.resourceId)
      ? 'pending'
      : serverStatus;
```

### 5.3 `useKnowledgeBase.ts` — guard empty-list polling

```typescript
export function useKBResources(
  kbId: string | undefined,
  resourcePath: string = '/',
  hasLocalPending: boolean = false,   // ← new param
) {
  ...
  refetchInterval: (query) => {
    const data = query.state.data;
    if (!data) return false;
    if (data.length === 0) return hasLocalPending ? 1000 : false;  // ← fix
    return data.every(r => r.status === 'indexed') ? false : 1000;
  },
```

### 5.4 `useFileBrowser.ts` — two KB queries + kbDoneIndexing effect

```typescript
const { submittedIds, isPendingIndex, clearSubmittedIds } = indexing;
const hasLocalPending = submittedIds.size > 0;

// Display query — follows navigation level (for status badges in current folder)
const { data: kbResources = [] } = useKBResources(kbId, currentFolder.path, hasLocalPending);

// Root query — ALWAYS at '/' to detect overall indexing completion
// (KB virtual dirs at root are the most reliable terminal signal)
const { data: kbRootResources = [] } = useKBResources(kbId, '/', hasLocalPending);

const kbDoneIndexing =
  kbRootResources.length > 0 && kbRootResources.every((r) => r.status === 'indexed');

useEffect(() => {
  if (!kbDoneIndexing || submittedIds.size === 0 || indexing.isIndexing || isPendingIndex) return;

  // Notify user about files the backend silently skipped
  const kbIds = new Set(kbResources.map((r) => r.resourceId));
  // connectionResources is scoped to current level — not reliable for all submitted IDs.
  // Just count: submitted - confirmed by server at root level.
  const kbRootIds = new Set(kbRootResources.flatMap((r) => [r.resourceId, r.name]));
  // We can detect skipped only if we keep the submitted list — emit a generic warning
  // if any submitted IDs are absent from KB (requires tracking names alongside IDs).

  clearSubmittedIds();
}, [kbDoneIndexing, submittedIds.size, indexing.isIndexing, isPendingIndex, clearSubmittedIds]);
```

### 5.5 `useActionButtonHandlers.ts` — pass `resourceId` to `onDeindex`

```typescript
onDeindex: (resourceId: string, path: string) => void;

const handleDeindex = useCallback((e: React.MouseEvent) => {
  e.stopPropagation();
  onDeindex(resourceId, path);
}, [resourceId, path, onDeindex]);
```

Update call sites: `FileBrowser.tsx` (`onDeindex`), `useBatchActions.ts` (`handleDeindex`).

---

## 6. Skipped-file Notifications

To tell the user which files the backend silently skipped, we need to track
submitted resource names alongside IDs. Approach:

```typescript
// submittedIds: Map<resourceId, name>  (instead of Set<resourceId>)
// On kbDoneIndexing: check which IDs never appeared in any KB response
```

This adds ~10 LOC complexity but delivers proper UX: "2 files could not be
indexed: .DS_Store, ~$notes.docx". This is the correct treatment of a
backend constraint — surface it explicitly rather than silently showing a
permanent pending badge.

---

## 7. Files Changed

| File                                         | Type of change                                                   |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `src/hooks/useIndexing.ts`                   | Rewrite state: `localStatuses` → `submittedIds + isPendingIndex` |
| `src/hooks/useResourceMerge.ts`              | Replace `statusPriority` merge with `submittedIds.has()`         |
| `src/hooks/useKnowledgeBase.ts`              | Add `hasLocalPending` param to `useKBResources`                  |
| `src/hooks/useFileBrowser.ts`                | Add root KB query, `kbDoneIndexing` effect                       |
| `src/hooks/useActionButtonHandlers.ts`       | `onDeindex(id, path)` signature                                  |
| `src/hooks/useBatchActions.ts`               | Pass `resourceId` to `handleDeindex`                             |
| `src/components/file-picker/FileBrowser.tsx` | Update `onDeindex` prop                                          |

---

## 8. Revised Solution: Derived Folder Status + IndexingJob Tracker

### 8.1 Core Principle

Folders and unprocessable files will NEVER receive `indexed` from the server.
Their status is **derived** from their children — computed client-side.

This eliminates the root cause: we no longer wait for a server signal that
will never come.

### 8.2 Hypotheses to Verify (via integration tests)

Before implementing, four API behavior hypotheses must be confirmed:

| #   | Hypothesis                                                              | Test                                            |
| --- | ----------------------------------------------------------------------- | ----------------------------------------------- |
| H1  | KB API never returns `status: 'indexed'` for `inode_type: 'directory'`  | Index folder → poll → check directory entries   |
| H2  | Unprocessable files (`.DS_Store`) are completely absent from KB         | Index folder with mixed content → compare lists |
| H3  | `resource_path=/folderName` returns children of that folder             | Poll KB at sub-path → check response            |
| H4  | When all files are `indexed`, root-level folder entry is also `indexed` | Wait for full indexing → check root entries     |

Test file: `tests/integration/api/folder-indexing-lifecycle.test.ts`

### 8.2.1 Verified Results (2026-03-07)

Test run against real Stack AI API. Folder: `acme` (5 PDF/CSV files, 0 subfolders).

| #   | Hypothesis                                            | Result                                              | Evidence                                                                                                                    |
| --- | ----------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| H1  | Directories never get `status: 'indexed'`             | **✅ CONFIRMED**                                    | `acme` directory at root has `status: undefined` (not even `null`) after all 5 children are `indexed`                       |
| H2  | Unprocessable files are absent from KB                | **⚠️ INCONCLUSIVE** (no `.DS_Store` in test folder) | All 5 submitted files appeared in KB with `indexed`. Need test with unprocessable files to confirm.                         |
| H3  | `resource_path=/folderName` returns children          | **✅ CONFIRMED**                                    | `resource_path=/acme` returned all 5 files with `indexed` status. Sub-path polling works.                                   |
| H4  | Root dirs become `indexed` when all children are done | **❌ REJECTED**                                     | Root dir `acme` has `status: undefined` even after all 5 files at `/acme` are `indexed`. **Directories NEVER get indexed.** |

#### Critical Discovery: Root poll is broken by design

The ISS-11 section 5.4 approach (`kbDoneIndexing = kbRootResources.every(r => r.status === 'indexed')`)
**will NEVER resolve** because root contains a directory entry with `status: undefined`.

`[].every(...)` returns `true` (vacuous truth), but `[{status: undefined}].every(r => r.status === 'indexed')` returns `false` — permanently.

This proves the derived-status approach (Section 8.3+) is the **only** viable solution:

- Poll at the **subfolder level** (`resource_path=/folderName`) where actual files live
- Compute folder status from children — server will never provide it
- Use `data.filter(r => r.inode_type === 'file')` for completion checks — ignore directories in every()/some() checks

#### API Behavior Summary

```
KB Root (resource_path=/):
  directory  status=undefined  acme          ← NEVER becomes 'indexed'

KB Sub-path (resource_path=/acme):
  file       status=indexed    acme/ACME_Earnings_Report_Q2_2024.pdf
  file       status=indexed    acme/ACME_Inc_Customer_Data.csv
  file       status=indexed    acme/ACME_Information_Security_Policies.pdf
  file       status=indexed    acme/ACME_Investment_Committee_Memo_Q3_2024.pdf
  file       status=indexed    acme/ACME_Knowledge_Base_RFP_Responses.pdf
```

Root only contains directory nodes. Files are ONLY visible at sub-paths.

### 8.3 Data Model

```typescript
/** Tracks one indexing operation (user clicked "Index" on a file or folder) */
type IndexingJob = {
  /** Unique job identifier */
  jobId: string;
  /** The resource the user clicked Index on */
  rootResourceId: string;
  rootResourceName: string;
  rootResourceType: 'file' | 'folder';
  /** All FILES submitted to KB (flattened from folder hierarchy) */
  submittedFiles: Map<string, SubmittedFile>;
  /** All FOLDERS in the hierarchy (for derived status) */
  submittedFolders: Map<string, SubmittedFolder>;
  /** Timestamp of mutation onSuccess — timeout starts here */
  startedAt: number;
  /** Last time a new file transitioned to 'indexed' — for progress-based timeout */
  lastProgressAt: number;
  /** kbId returned by the create mutation */
  kbId: string;
};

type SubmittedFile = {
  name: string;
  path: string;
  parentFolderId: string;
  resolvedStatus: 'pending' | 'indexed' | 'error';
};

type SubmittedFolder = {
  name: string;
  path: string;
  parentFolderId: string | null; // null = root folder user clicked
  childFileIds: string[];
  childFolderIds: string[];
  resolvedStatus: 'pending' | 'indexed' | 'error';
};
```

### 8.4 Resolution Algorithm

Resolution runs on EVERY KB poll response, independent of navigation:

1. **Update files from server**: if KB has resourceId with `'indexed'` → set resolved
2. **Detect skipped** (all-siblings-done): if every KB resource is `'indexed'`,
   any submitted file absent from KB → `'error'`
3. **Timeout fallback** (progress-based, 60s): if no progress for 60s →
   remaining pending files → `'error'`
4. **Resolve folders** (bottom-up): sort by depth, if all children resolved →
   folder = `'indexed'` if any child indexed, else `'error'`
5. **Check job done**: if root resource resolved → emit notifications → cleanup

### 8.5 Polling Strategy

**CRITICAL (from H1/H4 results):** Root poll at `resource_path=/` returns only
directory entries with `status: undefined`. It **cannot** be used as a completion
signal. Files only appear at sub-paths like `/acme`.

KB poll must track the **submitted folder paths**, not just root:

- For each submitted folder, poll `resource_path=/<folderName>` to get file statuses
- For nested folders, poll recursively: `/<parent>/<child>`
- Resolution checks only `inode_type === 'file'` entries — directories are skipped
- `refetchInterval` guard: `data.length === 0` returns `1000` only if
  `hasActiveJob`, else `false` (fixes infinite poll bug)
- Completion signal: all **files** (not directories) at all tracked paths are `indexed`

```typescript
// Poll per submitted folder path — NOT root
const pathsToTrack = [...job.submittedFolders.values()].map((f) => f.path);
// e.g. ['/acme', '/acme/subfolder']

for (const path of pathsToTrack) {
  const { data } = useKBResources(kbId, path, !!job);
  // Only check files — directories have status=undefined always
  const files = data?.filter((r) => r.type === 'file') ?? [];
  // Update resolution from these files...
}
```

### 8.6 Navigation Safety

| State                 | Stored in                        | Survives navigation?   |
| --------------------- | -------------------------------- | ---------------------- |
| `IndexingJob`         | `useState` in `useIndexing`      | ✅ Yes                 |
| `connectionResources` | TanStack Query cache by folderId | ✅ Cached              |
| `kbRootResources`     | TanStack Query, always at `/`    | ✅ Never changes       |
| `kbCurrentResources`  | TanStack Query, follows nav      | Changes (display only) |

Merge uses `resourceId` lookup into the job — works at any navigation level.

### 8.7 `'error'` Status in UI

Add `'error'` to `ResourceStatus`. `StatusBadge` renders error as a red badge
with retry button. Retry re-submits that single file to the KB.

### 8.8 Files Changed (Revised)

| File                                         | Change                                                        |
| -------------------------------------------- | ------------------------------------------------------------- |
| `src/types/resource.ts`                      | Add `'error'` to `ResourceStatus`                             |
| `src/hooks/useIndexing.ts`                   | Replace `localStatuses` with `IndexingJob` + resolution logic |
| `src/hooks/useResourceMerge.ts`              | Replace `statusPriority` with `getDisplayStatus` from job     |
| `src/hooks/useKnowledgeBase.ts`              | Add `hasActiveJob` param to guard empty-list polling          |
| `src/hooks/useFileBrowser.ts`                | Two KB queries (root + current), pass job to merge            |
| `src/hooks/useActionButtonHandlers.ts`       | `onDeindex(resourceId, path)` signature                       |
| `src/hooks/useBatchActions.ts`               | Pass `resourceId` to deindex                                  |
| `src/components/file-picker/StatusBadge.tsx` | Render `'error'` variant with retry                           |
| `src/components/file-picker/FileBrowser.tsx` | Wire `onDeindex`, `onRetry` props                             |
