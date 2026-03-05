import { NextResponse } from 'next/server';

import { getStackAIHeaders, stackUrl, toBffError } from '@/lib/auth';
import { ConnectionSchema, V1ListResponseSchema } from '@/types/resource';

export async function GET() {
  try {
    const headers = await getStackAIHeaders();
    const url = stackUrl('/v1/connections?connection_provider=gdrive&limit=1&offset=0');
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[BFF /connections] upstream ${response.status}:`, text);
      return NextResponse.json(
        { error: `Failed to fetch connections (${response.status})`, status: response.status },
        { status: response.status },
      );
    }

    const json: unknown = await response.json();
    const parsed = V1ListResponseSchema(ConnectionSchema).parse(json);

    return NextResponse.json({ data: parsed.data });
  } catch (error) {
    const { body, status } = toBffError(error);
    return NextResponse.json(body, { status });
  }
}
