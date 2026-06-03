import { cookies } from "next/headers";
import crypto from "node:crypto";

const COOKIE_NAME = "abc_admin_session";
const SESSION_DURATION_DAYS = 30;

function getSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    // For local demo only — log a warning but still work
    console.warn("[auth] SESSION_SECRET missing or too short — using insecure fallback. Set SESSION_SECRET in .env.local for any real use.");
    return "dev-only-insecure-secret-change-me";
  }
  return s;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function makeToken() {
  const exp = Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `admin.${exp}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [, expStr, sig] = parts;
  const payload = `admin.${expStr}`;
  const expected = sign(payload);
  if (sig !== expected) return false;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  return true;
}

export async function isAuthed(): Promise<boolean> {
  const c = await cookies();
  return verifyToken(c.get(COOKIE_NAME)?.value);
}

export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD || "admin";
  // Constant-time compare
  if (input.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(input), Buffer.from(expected));
}

export async function signIn() {
  const c = await cookies();
  c.set(COOKIE_NAME, makeToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function signOut() {
  const c = await cookies();
  c.delete(COOKIE_NAME);
}

export const ADMIN_ACTOR = "admin";
