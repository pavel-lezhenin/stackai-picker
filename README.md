# Stack AI File Picker

A custom Google Drive File Picker built for the [Stack AI](https://www.stack-ai.com/) platform. Browse, select, index, and manage Google Drive files and folders to build Knowledge Bases — all through an enterprise-grade UI.

> **[Live Demo](https://stackai-picker-topaz.vercel.app)**

## Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Testing](#testing)
- [Development Workflow](#development-workflow)
- [Getting Started](#getting-started)

---

## Features

| Area                 | What's included                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------- |
| **File Browsing**    | Root listing, folder navigation, breadcrumbs, back button, cache-first re-navigation          |
| **Display**          | Contextual file-type icons, status badges, modified date, highlighted search matches          |
| **Sorting**          | Clickable column headers (Name / Modified), ▲▼ indicators, folders always pinned first        |
| **Search & Filter**  | Real-time filtering, `/` shortcut, match highlighting, status filter tabs                     |
| **Selection**        | Checkboxes, Select All (indeterminate), Shift+click range, drag rubber-band select            |
| **Batch Actions**    | Index / De-index / Delete toolbar for selected items                                          |
| **Indexing**         | Per-row & batch index, optimistic status → Pending, polling to Indexed, folder de-duplication |
| **De-indexing**      | Per-row & batch, optimistic rollback, file stays in listing                                   |
| **Deletion**         | Confirmation dialog with exact filename, optimistic fade-out, rollback on error               |
| **Context Menu**     | Right-click menu on rows (Open, Index, De-index, Delete)                                      |
| **Keyboard**         | `Enter` open, `Backspace`/`Alt+←` back, `/` search, `Escape` clear, `Space` select            |
| **Accessibility**    | `role="grid"` semantics, `aria-label`, `aria-live`, focus trap in dialogs, WCAG contrast      |
| **Loading / Errors** | Zero-CLS skeletons, error cards with retry, optimistic rollback toasts                        |
| **Security**         | BFF proxy (no client-side secrets), server-side token cache, Zod API validation               |

→ Full feature details: [`docs/FEATURES.md`](docs/FEATURES.md)

---

## Tech Stack

| Technology                  | Why                                                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js 16** (App Router) | Server-side API routes act as a BFF proxy — credentials never reach the client. App Router provides `loading.tsx`/`error.tsx` boundaries out of the box.                                |
| **TanStack Query v5**       | Handles all server state: caching, deduplication, optimistic updates, background refetching. Navigating to a previously visited folder shows cached data instantly (`staleTime: 5min`). |
| **Tailwind CSS v4**         | Utility-first styling with zero custom CSS files. Consistent with Shadcn UI's design system.                                                                                            |
| **Shadcn UI**               | Enterprise-grade component primitives (AlertDialog, Toast/Sonner, Skeleton, etc.) with full accessibility and keyboard support.                                                         |
| **TypeScript** (strict)     | Zero `any` types. Zod validates all API boundaries. Discriminated unions for resource types.                                                                                            |
| **Zod**                     | Runtime validation at system boundaries — API responses are validated before entering the app.                                                                                          |

---

## Architecture

```
src/
├── app/
│   ├── api/                # BFF proxy routes (server-side only)
│   │   ├── connections/    # GET connections, resources
│   │   └── knowledge-bases/# CRUD knowledge bases, sync, resources
│   ├── page.tsx            # Main page (server component)
│   ├── layout.tsx          # Root layout
│   ├── loading.tsx         # Root loading boundary
│   └── error.tsx           # Root error boundary
├── components/
│   ├── ui/                 # Shadcn UI primitives (do not edit)
│   ├── file-picker/        # Feature components (FileRow, FileList, Toolbar, Breadcrumb)
│   └── providers/          # Context providers (QueryClient, etc.)
├── hooks/                  # TanStack Query hooks (useResources, useConnection, etc.)
├── lib/                    # API client, utilities, constants
└── types/                  # TypeScript types + Zod schemas
```

> **Naming convention**: Files in `components/ui/` use **kebab-case** (`alert-dialog.tsx`, `button.tsx`) — these are auto-generated by the Shadcn CLI and should not be renamed. All other components use **PascalCase** (`FileBrowser.tsx`, `FileRow.tsx`) per project convention.

### Key Design Decisions

#### BFF Proxy (Backend-for-Frontend)

All Stack AI API calls go through Next.js API routes under `app/api/`. The client never sees credentials, external URLs, or raw API shapes.

**Why?**

1. **Security** — Supabase tokens and the service-account password stay server-side. No `NEXT_PUBLIC_` env vars needed.
2. **Shape normalization** — The Stack AI API uses `inode_type: "directory"` and `inode_path.path` for file names. BFF routes transform these into a clean `Resource` type (`type: 'folder'`, `name: string`) so every UI component works with a consistent, validated shape (via Zod).
3. **Error normalization** — Every API route returns `{ data }` on success or `{ error, status }` on failure. Client code never has to guess the error format.
4. **Token caching** — Auth tokens are cached server-side with TTL, avoiding redundant auth calls on every request.

#### Optimistic Updates (onMutate → onError → onSettled)

Every mutation (index, de-index, delete) applies the change to the TanStack Query cache **before** the API responds.

**Why?**

- Enterprise users expect instant feedback. A 200-500ms round-trip delay after clicking "Index" feels broken.
- `onMutate` snapshots the previous cache, applies the change, and returns the snapshot. `onError` rolls back to the snapshot and shows a specific toast (e.g., _"Failed to index Report.pdf"_). `onSettled` invalidates queries to sync with server truth.
- This provides the best UX: instant response with automatic self-healing on failure.

#### Query Key Factory

```ts
export const resourceKeys = {
  all: ['resources'] as const,
  lists: () => [...resourceKeys.all, 'list'] as const,
  list: (connId: string, folderId?: string) => [...resourceKeys.lists(), connId, folderId] as const,
};
```

**Why?**

- Invalidation is precise: `queryClient.invalidateQueries({ queryKey: resourceKeys.lists() })` clears all folder caches without touching unrelated queries.
- Adding a new query (e.g., resource details) is just a new entry — existing invalidation logic doesn't change (Open/Closed).
- `as const` gives exact tuple types, catching typos at compile time.

#### Discriminated Unions for Resources

```ts
type Resource = { type: 'file'; status: ResourceStatus; ... }
               | { type: 'folder'; status: ResourceStatus; ... };
```

**Why?** Components can narrow the type via `resource.type === 'folder'` without `as` assertions. TypeScript enforces exhaustive handling — if a third type is added, every `switch` or conditional that doesn't cover it fails at compile time.

#### React.memo + useCallback Strategy

`FileRow` is wrapped in `React.memo`. All handlers passed to it (`onNavigate`, `onDelete`, `onIndex`, etc.) are memoized with `useCallback` in the parent.

**Why?** A file listing can have 50-200+ rows. Without memoization, typing in the search input or toggling a single checkbox would re-render every row. With memo + stable callbacks, only affected rows re-render.

#### Skeleton Dimensions Matching

Skeleton loaders use the exact same grid template, row height, and element sizes as loaded content (e.g., checkbox skeleton is 16×16 with `rounded-[4px]`, status badge skeleton is `h-5 w-16`).

**Why?** CLS (Cumulative Layout Shift) is a measurable user trust signal. Enterprise users in banking/government notice when content "jumps" — it feels unreliable. Matching dimensions means zero layout shift when data loads.

#### Folder-First Sorting (Client-Side)

Sorting is applied client-side with folders always pinned above files, regardless of sort direction.

**Why?** This matches the convention of every file manager (Finder, Explorer, Google Drive). Sorting by "Modified Date descending" should not bury folders between files — users' mental model is "folders are containers, files are content."

---

## Testing

### API integration tests (Vitest)

```bash
npx vitest run
```

Tests read the same variables from `.env.local` that the app uses at runtime — no separate test config needed.

Four test suites hit the **real Stack AI API** and systematically verify every endpoint:

| Suite                     | What it tests                                                                |
| ------------------------- | ---------------------------------------------------------------------------- |
| `auth.test.ts`            | Supabase token flow — valid creds, wrong password, missing API key           |
| `connections.test.ts`     | ISS-2 (wrong domain), ISS-3 (/v1/ prefix), ISS-4 (response shape mismatches) |
| `knowledge-bases.test.ts` | Full KB lifecycle: create → sync → list resources → delete. ISS-5/6/7/8/9/10 |
| `pagination.test.ts`      | Cursor field nullability, auth boundary enforcement (401 without token)      |

These tests discovered **10 bugs** in the provided API documentation and environment (see `docs/issues/`), including 5 blockers (wrong domain, missing path prefix, incorrect endpoint names). Each bug is documented with a `[DOCS BUG]` assertion that proves the documented behavior fails, and a `[FIX]` assertion that proves the corrected behavior works.

**Why integration tests first?** The Stack AI API reference contained significant inaccuracies. Integration tests were the fastest way to pin down the real contract — every ISS-\* issue was found by a failing test assertion, not by browser debugging.

### Next testing layers

| Priority | Layer           | Stack                    | Scope                                                                      |
| -------- | --------------- | ------------------------ | -------------------------------------------------------------------------- |
| 1        | BFF route tests | Vitest + MSW             | Auth caching, error mapping, Zod validation — isolated from live API       |
| 2        | Unit tests      | Vitest                   | Pure logic: `useSortAndFilter`, `useSelection`, file-type mapping          |
| 3        | Component tests | Vitest + Testing Library | FileRow states, keyboard nav, aria attributes, skeleton→content transition |
| 4        | E2E flows       | Playwright               | Full user journeys: browse → index → verify status → de-index → delete     |

---

## Development Workflow

### Scripts

| Command                 | Description                                                |
| ----------------------- | ---------------------------------------------------------- |
| `npm run dev`           | Start development server                                   |
| `npm run build`         | Production build                                           |
| `npm run lint`          | Run ESLint                                                 |
| `npm run typecheck`     | TypeScript type checking                                   |
| `npm run format`        | Format all files with Prettier                             |
| `npm run format:check`  | Check formatting (CI mode)                                 |
| `npm run check-secrets` | Scan for leaked secrets (gitleaks)                         |
| `npm run precommit`     | Full pre-commit suite: format + lint + typecheck + secrets |

### Pre-commit Hooks (Husky + lint-staged)

Every `git commit` automatically runs **Prettier** (format) and **ESLint** (lint + auto-fix) on staged files. Commits are blocked if errors remain.

### CI Pipeline (GitHub Actions)

Runs on every push and PR to `main`:

```
format ──┐
lint    ──┤
typecheck─┤──► build
security ─┘
```

- **Format** — `prettier --check` (fails if unformatted code)
- **Lint** — ESLint
- **Type Check** — `tsc --noEmit`
- **Security** — [Gitleaks](https://github.com/gitleaks/gitleaks) secret scanning + `npm audit`
- **Build** — `next build` (only runs after all checks pass)

### AI Agents (`.github/agents/`)

The project includes a structured AI agent system (`.github/copilot-instructions.md` + `.github/agents/`) that enforces quality at every stage — not as a novelty, but as executable checklists.

**Copilot Instructions** (`.github/copilot-instructions.md`) — a project-wide ruleset loaded into every AI session. Defines the mandated tech stack, architecture boundaries, TypeScript strictness rules, performance budget, and coding conventions.

Six role-specific agents covering distinct review disciplines:

| Agent                   | Purpose                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `feature-builder`       | Implements features following the types → hooks → components workflow from User Stories    |
| `code-reviewer`         | Reviews code quality — security, TypeScript, SOLID, performance                            |
| `architecture-guardian` | Enforces file structure, component boundaries, and import conventions                      |
| `security-auditor`      | OWASP-based audit: credential exposure, BFF enforcement, token lifecycle, input validation |
| `ux-reviewer`           | Enterprise polish: CLS, optimistic update UX, empty/error states, WCAG accessibility       |
| `debugger`              | Structured root-cause analysis with a common-issues lookup table                           |

**Why?** Executable checklists run at commit time — the `security-auditor` catches credential exposure and injection vectors, the `architecture-guardian` flags structural drift before it's merged. Same principle as linting, applied to architecture and security.

### Documentation (`docs/`)

| Document                 | Purpose                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `REQUIREMENTS.md`        | Functional and non-functional requirements. Each FR/NFR is numbered and traceable to code.                                   |
| `USER_STORIES.md`        | Epics → User Stories → Acceptance Criteria. Each story has `[x]` checkboxes updated as features land.                        |
| `ACCEPTANCE_CRITERIA.md` | Three-tier quality bar: Baseline (must pass), Quality (must excel), WOW (differentiators). Keeps the bar visible.            |
| `API_REFERENCE.md`       | Stack AI API docs — augmented with corrections discovered during testing (see ISS-\* issues below).                          |
| `FEATURES.md`            | All implemented features, grouped by area.                                                                                   |
| `issues/`                | 10 documented bugs in the provided API/docs environment, each with ISS-number, severity, reproduction steps, and workaround. |

> **Why this structure?** The docs directory replaces a PM, QA team, and sprint board — they show _how_ I work, not just _what_ I built. Every feature is traceable from requirement → story → acceptance criteria → committed code.

---

## Getting Started

### Prerequisites

- Node.js 18+

### 1. Install

```bash
npm install
```

### 2. Environment Variables

Copy the example file and fill in your credentials:

```bash
cp .env.example .env.local
```

Required variables (see `.env.example`):

| Variable                     | Description                                        |
| ---------------------------- | -------------------------------------------------- |
| `STACK_AI_BASE_URL`          | Stack AI API base URL (`https://api.stack-ai.com`) |
| `STACK_AI_SUPABASE_URL`      | Supabase auth URL (`https://sb.stack-ai.com`)      |
| `STACK_AI_SUPABASE_ANON_KEY` | Supabase anonymous key for auth requests           |
| `STACK_AI_EMAIL`             | Service account email                              |
| `STACK_AI_PASSWORD`          | Service account password                           |

> **Security**: These variables are only used in server-side API routes. They are never exposed to the client.

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## License

MIT
