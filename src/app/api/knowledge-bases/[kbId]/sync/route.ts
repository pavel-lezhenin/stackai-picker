import { NextRequest, NextResponse } from 'next/server';

import { getStackAIHeaders, stackUrl, toBffError } from '@/lib/auth';

/** UUID v4 pattern — validates org_id before embedding it in the URL path */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Trigger KB sync. Requires org_id as query param.
 * The org_id is fetched client-side from /api/organizations/me and forwarded here.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kbId: string }> }) {
  try {
    const { kbId } = await params;
    const orgId = request.nextUrl.searchParams.get('org_id');

    if (!orgId) {
      return NextResponse.json(
        { error: 'Missing required query parameter: org_id', status: 400 },
        { status: 400 },
      );
    }

    // Validate UUID format to prevent path traversal — org_id is embedded in URL path
    if (!UUID_RE.test(orgId) || !UUID_RE.test(kbId)) {
      return NextResponse.json(
        { error: 'Invalid identifier format', status: 400 },
        { status: 400 },
      );
    }

    const headers = await getStackAIHeaders();
    const response = await fetch(stackUrl(`/v1/knowledge_bases/sync/trigger/${kbId}/${orgId}`), {
      headers,
    });

    if (!response.ok) {
      const text = await response.text();

      // Forward rate limit headers
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        return NextResponse.json(
          { error: 'Rate limited. Please try again later.', status: 429 },
          {
            status: 429,
            headers: retryAfter ? { 'Retry-After': retryAfter } : undefined,
          },
        );
      }

      return NextResponse.json(
        { error: `Failed to trigger sync: ${text}`, status: response.status },
        { status: response.status },
      );
    }

    const json: unknown = await response.json();

    return NextResponse.json({ data: json });
  } catch (error) {
    const { body, status } = toBffError(error);
    return NextResponse.json(body, { status });
  }
}
