"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { constantTimeEqual, SESSION_COOKIE, sessionToken } from "@/lib/auth";

export async function login(formData: FormData) {
  const passphrase = String(formData.get("passphrase") ?? "");
  const next = String(formData.get("next") ?? "/");
  const expected = process.env.TRAJECTORY_PASSPHRASE ?? "";
  if (!expected || !constantTimeEqual(passphrase, expected)) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(next.startsWith("/") ? next : "/");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
