# Acceptance Criteria — WOW Factor

> This document defines the quality bar that differentiates a "works fine" submission
> from one that makes Stack AI say "we need this person on the team."

---

## Context: What Stack AI Values

Based on analysis of Stack AI's product, job description, and culture:

1. **Enterprise-grade quality** — Their customers are banks, defense, government, YMCA. The UI must feel trustworthy and professional.
2. **Execution over excitement** — They want someone who does excellent work on "boring" tasks. The file picker IS a boring task — that's the point. Excellence here proves you're the right fit.
3. **Incremental refinement** — The role is about polishing existing production code. Show you can build something that doesn't need polishing.
4. **Minimal code review** — The code must be so clean that a reviewer trusts it immediately.
5. **Technical teaching** — Code should demonstrate patterns the team could learn from.

---

## Tier 1: Baseline (Must Pass)

These are the minimum requirements from the task spec. Failing any of these = rejection.

### Functionality

- [ ] Browse files/folders from Google Drive connection
- [ ] Navigate into folders and back (breadcrumb)
- [ ] Delete (de-list) files with confirmation
- [ ] Index files/folders for Knowledge Base
- [ ] Show indexing status (indexed / not indexed)
- [ ] De-index files without deleting from listing
- [ ] Optimistic updates on all mutations

### Tech Stack Compliance

- [x] Next.js 16 with App Router
- [x] TanStack Query v5 for data fetching
- [x] Tailwind CSS v4 for styling
- [x] Shadcn UI for components
- [x] TypeScript strict mode, zero `any`

### Deployment

- [ ] Deployed to Vercel with working URL
- [ ] Environment variables properly configured
- [ ] No console errors in production

---

## Tier 2: Quality Bar (Must Excel)

This is where most candidates stop. Exceeding here gets you to the interview.

### Code Architecture (SOLID in Practice)

- [ ] **SRP**: Every component has exactly one reason to change. FileRow doesn't know about API calls. Toolbar doesn't know about data shapes.
- [ ] **OCP**: Adding a new file type (e.g., Google Slides) requires ZERO changes to FileRow — just add an icon mapping.
- [ ] **LSP**: The Resource type hierarchy works for both files and folders without type-checking hacks.
- [ ] **ISP**: No component receives props it doesn't use. FileRow gets `name`, `type`, `status` — not the entire Resource.
- [ ] **DIP**: Components import hooks, never fetch functions. Swapping the API backend requires zero UI changes.

### TypeScript Excellence

- [x] Zod schemas validate every API boundary (incoming responses, outgoing requests)
- [x] Discriminated unions for resource types (`type: 'file' | 'folder'`)
- [x] Const assertions for query key factories
- [ ] Proper generic typing on TanStack Query hooks
- [ ] No type assertions (`as`) except justified edge cases with comments

### React Patterns

- [ ] `React.memo` on FileRow with proper comparison
- [ ] Event handlers extracted and memoized via `useCallback` where passed to memoized children
- [ ] No derived state stored in `useState` (computed via `useMemo` from source data)
- [ ] Error boundaries at meaningful levels (not just root)
- [ ] Proper cleanup in all effects

### Performance

- [ ] Skeleton loaders that match exact dimensions of loaded content (zero CLS)
- [x] `staleTime` configured to prevent unnecessary refetches during navigation
- [ ] Query deduplication — navigating to a previously visited folder shows cached data instantly
- [ ] Mutation responses used to update cache directly (not just invalidate-and-refetch)
- [ ] No waterfall requests — parallel data loading where possible

---

## Tier 3: WOW Factor (Differentiators)

These are the details that make an evaluator think "this person writes production code."

### Polish & Micro-interactions

- [ ] Smooth transitions on folder navigation (content fade/slide)
- [ ] Hover states on all interactive elements with subtle feedback
- [ ] Status badge transitions (color/icon morphs, not just swap)
- [ ] Selection checkbox animation (scale + check mark draw)
- [ ] Toast notifications with contextual messages (not generic "Success")
- [ ] Confirm dialog uses the file name ("Delete 'Q4 Report.pdf'?")

### Accessibility (a11y)

- [ ] Full keyboard navigation: Tab through items, Enter to open folder, Space to toggle selection
- [ ] `aria-label` on icon-only buttons
- [ ] `role="row"` and `role="gridcell"` on file list for screen readers
- [ ] Focus trap in confirmation dialogs
- [ ] Skip to main content link
- [ ] Announce status changes to screen readers (`aria-live` regions)
- [ ] Proper contrast ratios on all text and interactive elements

### UX Details That Enterprise Users Expect

- [ ] Breadcrumb shows ellipsis for deep paths with dropdown to expand
- [ ] Column headers are sortable with visual direction indicators (▲▼)
- [ ] "Select All" checkbox has three states: none/some/all (indeterminate state)
- [ ] Right-click context menu on files (optional but impressive)
- [ ] Drag selection across multiple files (rubberband, optional)
- [ ] Keyboard shortcut: `/` or `Cmd+K` to focus search
- [ ] Empty state illustrations, not just text
- [ ] File type icons from a consistent icon set (not emoji)

### Code That Teaches

- [x] Query key factory pattern demonstrates team-scalable caching
- [ ] Custom hook composition: `useResources` composes `useQuery` + data transformation (field mapping, type narrowing)
- [x] API error types are structured (not just string messages)
- [ ] API route middleware pattern for auth (reusable across routes)
- [ ] Optimistic update helper that generalizes across mutations
- [ ] Consistent response envelope: `{ data } | { error, status }` from all API routes
- [ ] README explains WHY each pattern was chosen, not just WHAT was built

### Build & DX Quality

- [x] ESLint config with no warnings (not just no errors)
- [x] Import order convention (react → next → external → internal → types)
- [x] Path aliases (`@/components`, `@/hooks`, `@/types`)
- [ ] Git history with meaningful commits (not one giant commit)
- [x] `.env.example` file documenting required variables

---

## Anti-patterns to Avoid (Red Flags for Reviewers)

These will immediately lower your score:

| Anti-pattern                        | Why it's bad                      | Fix                                                                     |
| ----------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `any` type anywhere                 | Shows laziness with types         | Use `unknown` + type guard                                              |
| Inline handlers in map loops        | Creates new function every render | Extract + `useCallback`                                                 |
| `useEffect` for derived state       | Unnecessary render cycle          | Use `useMemo` instead                                                   |
| API keys in client code             | Security violation                | BFF proxy via API routes                                                |
| `console.log` in production         | Unprofessional                    | Remove or use proper logging                                            |
| No loading states                   | CLS + bad UX                      | Skeleton matching final layout                                          |
| Giant components (150+ lines)       | SRP violation                     | Decompose into sub-components                                           |
| Prop drilling > 2 levels            | Maintenance nightmare             | Use context or composition                                              |
| Catching errors without handling    | Silent failures                   | Toast + retry or rethrow                                                |
| CSS-in-JS or custom CSS             | Tech stack violation              | Tailwind only                                                           |
| Default exports in application code | Inconsistent imports              | Named exports only (Next.js route files and framework configs excepted) |
| Hardcoded strings                   | i18n-hostile                      | Constants file                                                          |

---

## Review Scoring (Internal Reference)

How a Stack AI reviewer likely evaluates:

| Category            | Weight | What they check                                        |
| ------------------- | ------ | ------------------------------------------------------ |
| **Does it work?**   | 25%    | All features functional, no console errors             |
| **Code quality**    | 30%    | SOLID, TypeScript, React patterns, readability         |
| **UI/UX polish**    | 25%    | CLS, loading states, optimistic updates, visual design |
| **Technical depth** | 10%    | Architecture decisions, API design, caching strategy   |
| **Bonus features**  | 10%    | Sort, filter, search, accessibility, animations        |

> A candidate who nails the 25% code quality + 25% UI polish with basic functionality
> will score higher than one who builds all features with sloppy code.

---

## Definition of Done

A feature is "done" when:

1. It works correctly with no console errors
2. It has a loading skeleton that matches the final layout exactly
3. Mutations have optimistic updates with rollback
4. Error states show actionable feedback (toast + retry)
5. TypeScript compiles with zero errors in strict mode
6. The component follows SRP (< 100 lines ideal, < 150 max)
7. It's keyboard navigable
8. It looks visually consistent with Shadcn design system
