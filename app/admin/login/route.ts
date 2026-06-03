import { NextRequest, NextResponse } from "next/server";
import { checkPassword, signIn } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}));
  if (typeof password !== "string" || !checkPassword(password)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  await signIn();
  return NextResponse.json({ ok: true });
}
