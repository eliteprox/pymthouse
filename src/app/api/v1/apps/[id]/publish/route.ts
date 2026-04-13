import { NextRequest, NextResponse } from "next/server";
import { publishProviderAndPlans } from "@/lib/naap-marketplace";
import {
  canEditProviderApp,
  getAuthorizedProviderApp,
  appEditForbiddenResponse,
} from "@/lib/provider-apps";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getAuthorizedProviderApp(id);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await canEditProviderApp(auth))) {
    return appEditForbiddenResponse();
  }

  const result = await publishProviderAndPlans(id);
  return NextResponse.json(result, { status: result.published ? 200 : 202 });
}
