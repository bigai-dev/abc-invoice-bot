import { NextRequest, NextResponse } from "next/server";
import { readFile, contentTypeFor } from "@/lib/storage/local";
import { isAuthed } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["screenshots", "invoices", "logos"]);
const PRIVATE = new Set(["screenshots"]); // admin-only

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ bucket: string; name: string }> }
) {
  const { bucket, name } = await ctx.params;
  if (!ALLOWED.has(bucket)) {
    return NextResponse.json({ error: "Unknown bucket" }, { status: 404 });
  }
  if (PRIVATE.has(bucket) && !(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const buf = readFile(bucket as any, name);
  if (!buf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(buf as any, {
    status: 200,
    headers: {
      "content-type": contentTypeFor(name),
      "cache-control": "private, max-age=300",
    },
  });
}
