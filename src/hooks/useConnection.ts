'use client';

import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import { resourceKeys } from '@/types/resource';

import type { Connection } from '@/types/resource';

/** Fetches the first Google Drive connection. Cached aggressively — rarely changes. */
export function useConnection() {
  return useQuery({
    queryKey: resourceKeys.connections(),
    queryFn: async () => {
      const connections = await apiFetch<Connection[]>('/connections');
      if (connections.length === 0) {
        throw new Error(
          'No Google Drive connection found. Please connect Google Drive in Stack AI.',
        );
      }
      return connections[0];
    },
    staleTime: Infinity,
  });
}
