'use client';

import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import { resourceKeys } from '@/types/resource';

import type { Organization } from '@/types/api';

/** Fetches current org ID. Required for sync endpoint. Cached aggressively. */
export function useOrganization() {
  return useQuery({
    queryKey: ['organization'] as const,
    queryFn: () => apiFetch<Organization>('/organizations/me'),
    staleTime: Infinity,
  });
}
