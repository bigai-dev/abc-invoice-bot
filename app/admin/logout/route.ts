import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  await signOut();
  return NextResponse.redirect(
    new URL("/admin", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
  );
}
