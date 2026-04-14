import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { getAllClients, getClient, updateClientConfig } from "@/lib/oidc/clients";

/**
 * GET /api/v1/admin/oidc-clients
 * List all OIDC clients, including seeded system clients (naap-web, naap-service, livepeer-sdk).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as Record<string, unknown> | undefined)?.role as
    | string
    | undefined;

  if (!session?.user || role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const clients = await getAllClients();

  return NextResponse.json({ clients });
}

/**
 * PATCH /api/v1/admin/oidc-clients
 * Update an OIDC client configuration.
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as Record<string, unknown> | undefined)?.role as
    | string
    | undefined;

  if (!session?.user || role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const { clientId, updates } = body;

  if (!clientId || typeof clientId !== "string") {
    return NextResponse.json(
      { error: "clientId is required" },
      { status: 400 }
    );
  }

  const client = await getClient(clientId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const success = await updateClientConfig(clientId, updates);

  if (!success) {
    return NextResponse.json(
      { error: "Failed to update client" },
      { status: 500 }
    );
  }

  const updated = await getClient(clientId);
  return NextResponse.json({ client: updated });
}
