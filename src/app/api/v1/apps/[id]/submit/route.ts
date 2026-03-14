import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as Record<string, unknown>).id as string;

  const app = db
    .select()
    .from(developerApps)
    .where(eq(developerApps.id, id))
    .get();

  if (!app || app.ownerId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (app.status !== "draft" && app.status !== "rejected") {
    return NextResponse.json(
      { error: `Cannot submit app with status '${app.status}'` },
      { status: 400 }
    );
  }

  const required: { field: string; label: string }[] = [
    { field: "name", label: "App Name" },
    { field: "description", label: "Description" },
    { field: "privacyPolicyUrl", label: "Privacy Policy URL" },
  ];

  const missing = required.filter(
    (r) => !app[r.field as keyof typeof app]
  );

  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: "Missing required fields for submission",
        missing: missing.map((m) => m.label),
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  db.update(developerApps)
    .set({ status: "submitted", submittedAt: now, updatedAt: now })
    .where(eq(developerApps.id, id))
    .run();

  return NextResponse.json({ success: true, status: "submitted" });
}
