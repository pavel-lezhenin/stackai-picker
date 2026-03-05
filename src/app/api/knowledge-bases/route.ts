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
    const response = await fetch(stackUrl('/knowledge_bases'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        connection_id: body.connection_id,
        connection_source_ids: body.connection_source_ids,
        indexing_params: {
          ocr: false,
          unstructured: true,
          embedding_params: {
            embedding_model: 'text-embedding-ada-002',
            api_key: null,
          },
          chunker_params: {
            chunk_size: 1500,
            chunk_overlap: 500,
            chunker: 'sentence',
          },
        },
        org_level_role: null,
        cron_job_id: null,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Failed to create knowledge base: ${text}`, status: response.status },
        { status: response.status },
      );
    }

    const json: unknown = await response.json();
    const kb = KnowledgeBaseSchema.parse(json);

    return NextResponse.json({ data: kb });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request body', status: 400 }, { status: 400 });
    }
    const { body, status } = toBffError(error);
    return NextResponse.json(body, { status });
  }
}
