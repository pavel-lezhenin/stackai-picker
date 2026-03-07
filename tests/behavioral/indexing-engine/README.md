# IndexingEngine — Behavioral Tests

## Structure

| File                     | Categories                                   | Tests |
| ------------------------ | -------------------------------------------- | ----- |
| `utilities.test.ts`      | `isKBDone`, `getFileDescendants`             | 9     |
| `indexing-basic.test.ts` | A (single resource), B (display status)      | 12    |
| `indexing-flows.test.ts` | C (sequential), D (concurrent), E (batch)    | 10    |
| `error-recovery.test.ts` | F (errors & recovery), G (edge cases)        | 10    |
| `resolution.test.ts`     | I (mutation sequences), J (resolution rules) | 11    |
| `deindex.test.ts`        | H (basics), K (advanced), M (interactions)   | 17    |

| Support file            | Purpose                                                  |
| ----------------------- | -------------------------------------------------------- |
| `_helpers.ts`           | Shared factories: `mkResource`, `mkKBFile`, `mkChildren` |
| `indexing-scenarios.md` | Scenario descriptions & acceptance criteria              |

## Why no stubs/mocks?

IndexingEngine is a **pure state machine** with no I/O — no fetch, no timers, no DOM.
Tests drive it directly: create → call methods → assert state.
There is nothing to stub.

## Why inline `Map<string, SubmittedEntry>` in `getFileDescendants` tests?

Those 3 tests (`getFileDescendants` describe block) build custom entry maps with
edge-case topologies (self-reference, nested subfolders, specific parentId chains).
Extracting them into a generic factory would add complexity without reducing boilerplate —
each map is intentionally unique. **Do not refactor these into `_helpers.ts`.**

## Test categories

- **A** — Single resource indexing (folder, file, empty folder)
- **B** — Display status & timeout
- **C** — Sequential indexing (submit → resolve → submit again)
- **D** — Rapid-fire re-submits
- **E** — Batch indexing (multiple resources at once)
- **F** — Error scenarios
- **G** — Edge cases
- **H** — Deindex basics
- **I** — Mutation sequences (index → deindex → re-index)
- **J** — Resolution rules (partial resolve, cross-job)
- **K** — Advanced deindex (folder cascade, children removal)
- **M** — Deindex + active indexing interactions
