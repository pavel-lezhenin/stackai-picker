import { z } from 'zod';

// --- BFF Response Envelope ---

export const BffErrorSchema = z.object({
  error: z.string(),
  status: z.number(),
});

export type BffResponse<T> = { data: T } | { error: string; status: number };

// --- Paginated Response ---

export const PaginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    // Cursor fields may be absent if the KB has a single page — made optional to avoid
    // Zod parse failures with API responses that omit them entirely
    next_cursor: z.string().nullable().optional(),
    current_cursor: z.string().nullable().optional(),
  });

export type PaginatedResponse<T> = {
  data: T[];
  next_cursor: string | null;
  current_cursor: string | null;
};

// --- Auth ---

export const AuthResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  refresh_token: z.string(),
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// --- Organization ---

export const OrganizationSchema = z.object({
  org_id: z.string(),
});

export type Organization = z.infer<typeof OrganizationSchema>;

// --- Knowledge Base ---

export const KnowledgeBaseSchema = z.object({
  knowledge_base_id: z.string(),
});

export type KnowledgeBase = z.infer<typeof KnowledgeBaseSchema>;
