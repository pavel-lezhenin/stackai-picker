import { NextResponse } from 'next/server';

import { getStackAIHeaders, stackUrl, toBffError } from '@/lib/auth';
import { OrganizationSchema } from '@/types/api';

export async function GET() {
  try {
    const headers = await getStackAIHeaders();
    const response = await fetch(stackUrl('/organizations/me/current'), { headers });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Failed to fetch organization: ${text}`, status: response.status },
        { status: response.status },
      );
    }

    const json: unknown = await response.json();
    const org = OrganizationSchema.parse(json);

    return NextResponse.json({ data: org });
  } catch (error) {
    const { body, status } = toBffError(error);
    return NextResponse.json(body, { status });
  }
}
