import { type NextRequest, NextResponse } from 'next/server';

import { getStackAIHeaders, stackUrl, toBffError } from '@/lib/auth';
import { PaginatedResponseSchema } from '@/types/api';
import { ConnectionResourceSchema } from '@/types/resource';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const { connectionId } = await params;
    const { searchParams } = request.nextUrl;
    const resourceId = searchParams.get('resource_id');
    const cursor = searchParams.get('cursor');

    const url = new URL(stackUrl(`/connections/${connectionId}/resources/children`));
    if (resourceId) url.searchParams.set('resource_id', resourceId);
    if (cursor) url.searchParams.set('cursor', cursor);

    const headers = await getStackAIHeaders();
    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Failed to fetch resources: ${text}`, status: response.status },
        { status: response.status },
      );
    }

    const json: unknown = await response.json();
    const validated = PaginatedResponseSchema(ConnectionResourceSchema).parse(json);

    return NextResponse.json({ data: validated });
  } catch (error) {
    const { body, status } = toBffError(error);
    return NextResponse.json(body, { status });
  }
}
