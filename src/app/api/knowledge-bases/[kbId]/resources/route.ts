import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getStackAIHeaders, stackUrl, toBffError } from '@/lib/auth';
import { PaginatedResponseSchema } from '@/types/api';
import { KBResourceSchema } from '@/types/resource';

export async function GET(request: NextRequest, { params }: { params: Promise<{ kbId: string }> }) {
  try {
    const { kbId } = await params;
    const resourcePath = request.nextUrl.searchParams.get('resource_path') ?? '/';
    const cursor = request.nextUrl.searchParams.get('cursor');

    const url = new URL(stackUrl(`/v1/knowledge_bases/${kbId}/resources/children`));
    url.searchParams.set('resource_path', resourcePath);
    if (cursor) url.searchParams.set('cursor', cursor);

    const headers = await getStackAIHeaders();
    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Failed to fetch KB resources: ${text}`, status: response.status },
        { status: response.status },
      );
    }

    const json: unknown = await response.json();
    const validated = PaginatedResponseSchema(KBResourceSchema).parse(json);

    return NextResponse.json({ data: validated });
  } catch (error) {
    const { body, status } = toBffError(error);
    return NextResponse.json(body, { status });
  }
}

const DeleteResourceBodySchema = z.object({
  resource_path: z.string().min(1),
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ kbId: string }> },
) {
  try {
    const { kbId } = await params;
    const rawBody: unknown = await request.json();
    const body = DeleteResourceBodySchema.parse(rawBody);

    const headers = await getStackAIHeaders();
    const url = new URL(stackUrl(`/v1/knowledge_bases/${kbId}/resources`));
    url.searchParams.set('resource_path', body.resource_path);

    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ resource_path: body.resource_path }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Failed to delete resource: ${text}`, status: response.status },
        { status: response.status },
      );
    }

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request: resource_path is required', status: 400 },
        { status: 400 },
      );
    }
    const { body, status } = toBffError(error);
    return NextResponse.json(body, { status });
  }
}
