import { NextResponse } from 'next/server';

import { getStackAIHeaders, stackUrl, toBffError } from '@/lib/auth';
import { ConnectionSchema } from '@/types/resource';

export async function GET() {
  try {
    const headers = await getStackAIHeaders();
    const response = await fetch(stackUrl('/connections?connection_provider=gdrive&limit=1'), {
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Failed to fetch connections: ${text}`, status: response.status },
        { status: response.status },
      );
    }

    const json: unknown = await response.json();
    const connections = ConnectionSchema.array().parse(json);

    return NextResponse.json({ data: connections });
  } catch (error) {
    const { body, status } = toBffError(error);
    return NextResponse.json(body, { status });
  }
}
