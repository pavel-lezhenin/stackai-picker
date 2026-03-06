import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getStackAIHeaders, stackUrl, toBffError } from '@/lib/auth';
import { KnowledgeBaseSchema } from '@/types/api';

const CreateKBBodySchema = z.object({
  connection_id: z.string().min(1),
  connection_source_ids: z.array(z.string().min(1)).min(1),
});

export async function POST(request: NextRequest) {
  try {
    const rawBody: unknown = await request.json();
    const body = CreateKBBodySchema.parse(rawBody);

    const headers = await getStackAIHeaders();
    // Path uses hyphens (/v1/knowledge-bases), not underscores — confirmed via Network tab
    const response = await fetch(stackUrl('/v1/knowledge-bases'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        connection_id: body.connection_id,
        connection_source_ids: body.connection_source_ids,
        indexing_params: {
          ocr: false,
          embedding_params: {
            embedding_model: 'openai.text-embedding-3-large',
            api_key: null,
          },
          chunker_params: {
            chunk_size: 2500,
            chunk_overlap: 100,
            chunker_type: 'sentence',
          },
        },
        org_level_role: null,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[BFF /knowledge-bases POST] upstream ${response.status}:`, text);
      const detail = text.slice(0, 300).replace(/\s+/g, ' ').trim();
      return NextResponse.json(
        {
          error: `Failed to create knowledge base (${response.status})${detail ? `: ${detail}` : ''}`,
          status: response.status,
        },
        { status: response.status },
      );
    }

    const json: unknown = await response.json();
    // API may return the KB directly or nested in { data: {...} }
    const unwrapped =
      json !== null &&
      typeof json === 'object' &&
      'data' in json &&
      json.data !== null &&
      typeof json.data === 'object'
        ? json.data
        : json;
    const kb = KnowledgeBaseSchema.parse(unwrapped);

    return NextResponse.json({ data: kb });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request body', status: 400 }, { status: 400 });
    }
    const { body, status } = toBffError(error);
    return NextResponse.json(body, { status });
  }
}
