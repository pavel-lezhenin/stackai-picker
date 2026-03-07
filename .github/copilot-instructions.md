# Copilot Instructions for Stack AI File Picker

## ⚠️ Read Before Every Task

Before implementing any feature, the agent MUST read:

- `docs/ACCEPTANCE_CRITERIA.md` — WOW factor checklist & quality bar
- `docs/USER_STORIES.md` — feature specifications with acceptance criteria
- `docs/REQUIREMENTS.md` — functional and non-functional requirements
- `docs/API_REFERENCE.md` — Stack AI API endpoints, auth flow, data shapes, and pagination

## Project Context

A custom Google Drive File Picker built with Next.js for the Stack AI platform.
This is a **Senior Frontend Engineer take-home task**. The code will be evaluated by
engineers at a company serving banks, defense, and government (enterprise-grade quality).

**Key evaluation quote from JD**: "High technical standards: we hire people who can wow us."

## Tech Stack (MANDATED — do not deviate)

- **Framework**: Next.js 16 (App Router)
- **Data Fetching**: TanStack Query v5 + fetch
- **Styling**: Tailwind CSS v4
- **Components**: Shadcn UI
- **Language**: TypeScript (strict mode)
- **Validation**: Zod (API boundaries only)

## Architecture Rules

### Component Structure

```
src/
├── app/                    # Next.js App Router pages & API routes
│   ├── api/                # BFF proxy routes (server-side only)
│   ├── page.tsx            # Main page (server component)
│   ├── layout.tsx          # Root layout
│   ├── loading.tsx         # Root loading boundary
│   └── error.tsx           # Root error boundary
├── components/
│   ├── ui/                 # Shadcn UI primitives (auto-generated, do not edit)
│   ├── file-picker/        # File Picker feature components
│   └── providers/          # Context providers (QueryClient, etc.)
├── hooks/                  # Custom React hooks (data fetching, state)
├── lib/                    # Utilities, API client, constants
│   ├── utils.ts            # cn() and general utilities
│   ├── api.ts              # API client for BFF routes
│   └── constants.ts        # App constants, file type mappings
├── types/                  # TypeScript type definitions
│   ├── resource.ts         # Resource types and Zod schemas
│   └── api.ts              # API response/request types
```

### SOLID Principles (Enforced, Not Optional)

- **Single Responsibility**: Each component does ONE thing. FileRow renders a row. FileList renders the list. Toolbar handles actions. <160 lines soft signal, >250 hard trigger.
- **Open/Closed**: File type icons use a Map/Record — adding a type adds an entry, changes zero components. Use composition over modification.
- **Liskov Substitution**: `Resource = FileResource | FolderResource` — components work with both via discriminated union, never type-checking hacks.
- **Interface Segregation**: Props interfaces are minimal. FileRow gets `name`, `type`, `status` — not the entire Resource blob.
- **Dependency Inversion**: Components import hooks, never fetch functions. Swapping the API backend changes zero UI components.

### Data Fetching Patterns

- **BFF ONLY**: All API calls go through Next.js API routes — NEVER call Stack AI directly from client.
- **TanStack Query**: Use for ALL server state. No `useState` for server data.
- **Query Key Factory**: `resourceKeys.all`, `.lists()`, `.list(connectionId, folderId)` with `as const`.
- **Optimistic Updates**: Every mutation MUST:
  1. `onMutate`: cancel outgoing queries → snapshot previous data → apply optimistic change
  2. `onError`: restore snapshot → show error toast with specific message
  3. `onSettled`: invalidate queries to sync with server truth
- **Caching**: `staleTime: 5 * 60 * 1000` — navigating to a visited folder shows cached data instantly.
- **Pagination**: Stack AI API uses cursor pagination (`next_cursor`). Handle in hooks or API routes.

### Stack AI API Specifics (see `docs/API_REFERENCE.md`)

- **Auth**: Supabase token via `sb.stack-ai.com` — cache token server-side, never send to client.
- **Base URL**: `https://api.stack-ai.com`
- **Org ID**: `GET /organizations/me/current` — required for sync endpoint, cache alongside auth token.
- **Field mapping**: API `inode_type: "directory" | "file"` → internal `type: 'folder' | 'file'`.
- **Resource name**: Extract from `inode_path.path` (not a separate `name` field).
- **Listing children**: `GET /connections/{id}/resources/children?resource_id={folderId}` (omit for root).
- **KB resources**: `GET /knowledge_bases/{kbId}/resources/children?resource_path=/` — includes `status` field.
- **Indexing flow**: Create KB → Sync → Poll status (pending → indexed).
- **Delete**: Uses `resource_path`, not `resource_id`. Only files, not folders.
- **De-duplication**: Never index a folder AND its children individually.

### TypeScript Rules

- `strict: true` in tsconfig.json — non-negotiable.
- **Zero `any`**: Use `unknown` + type guards. Every `any` is a rejection flag.
- **Zod at boundaries**: Validate API responses where external data enters the system. Trust internal data.
- **Discriminated unions**: `type: 'file' | 'folder'` for resource variants.
- **Const assertions**: Query key factories use `as const`.
- **Named exports only**: No `export default` except where Next.js requires it (page.tsx, layout.tsx, loading.tsx, error.tsx) and framework config files (next.config.ts, eslint.config.mjs, postcss.config.mjs).
- **No type assertions (`as X`)**: Unless justified with a comment explaining why.

### Performance Rules (CLS = 0 is the Goal)

- `React.memo` on all list item components (FileRow, ResourceItem).
- `useCallback` for handlers passed to memoized children.
- `useMemo` for derived data (sorted/filtered lists). Never store derived data in `useState`.
- No inline function definitions in `.map()` for event handlers.
- Skeleton loaders match EXACT dimensions of loaded content — same height, same columns, same padding.
- `staleTime` prevents unnecessary refetches during navigation.
- Mutation responses update cache directly when possible (not just invalidate-and-refetch).

### Styling Rules

- Tailwind utility classes only — zero custom CSS files.
- Shadcn theming via CSS variables.
- `cn()` for conditional class merging (from `@/lib/utils`).
- Responsive: mobile-first breakpoints (sm, md, lg). Desktop is primary target.
- Transitions: opacity/scale on state changes for polish (0.15-0.2s, ease-out).
- Hover states on all interactive elements.
- Focus rings via Shadcn's built-in focus styles.

### Error Handling (Never Swallow Errors)

- **API routes**: try/catch → return `{ error: string, status: number }` with proper HTTP status.
- **Mutations**: `onError` → rollback + toast with specific message (not "Something went wrong").
- **Queries**: `error.tsx` boundaries + inline error cards with "Try Again" button.
- **Network**: Distinguish between network errors and API errors in user messaging.
- **Toast notifications**: Use Shadcn Sonner for all user-facing feedback.

### Comments Policy

- Do NOT comment obvious code.
- DO comment: complex business logic, non-obvious API behavior, workarounds, "why" decisions.
- JSDoc on exported utility functions and custom hooks.

### File/Export Naming

- Components: `PascalCase.tsx` → `export { ComponentName }` (named export)
- Hooks: `camelCase.ts` → `export { useHookName }`
- Types: `camelCase.ts` → `export type { TypeName }`
- Utils: `camelCase.ts` → `export { functionName }`
- Constants: `UPPER_SNAKE_CASE` inside files
- API routes: kebab-case folders per Next.js conventions

### Import Order (Enforced)

```typescript
// 1. React/Next.js
import { memo, useCallback } from 'react';
import { NextRequest } from 'next/server';

// 2. External libraries
import { useQuery, useMutation } from '@tanstack/react-query';
import { z } from 'zod';

// 3. Internal modules
import { cn } from '@/lib/utils';
import { useResources } from '@/hooks/useResources';
import { FileRow } from '@/components/file-picker/FileRow';

// 4. Types
import type { Resource, ResourceStatus } from '@/types/resource';
```

### Git Discipline (Trunk-Based Development)

- **Short-lived feature branches**: One branch per epic/feature, merged to `main` via PR within days. No long-lived branches.
- **`main` always deployable**: `main` is always in a shippable state. Never merge broken code.
- **Small, focused commits**: Each commit does ONE thing. A feature may span multiple commits — that's fine.
- **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:` prefixes. Example: `feat: add folder navigation with breadcrumbs`
- **No feature flags needed** at this project scale — features land complete or as safe increments.
- **Pre-commit checks**: Run `npm run lint && npm run typecheck` before every commit. CI enforces this on PR.
- Never commit `.env.local` or API credentials.
