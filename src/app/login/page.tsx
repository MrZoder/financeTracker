import { Lock } from "lucide-react";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";
import { authEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  if (!authEnabled()) redirect("/");
  const params = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm rounded-[28px] glass-strong p-8">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-positive/15 text-positive ring-1 ring-positive/30">
          <Lock className="h-5 w-5" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-fg">Trajectory</h1>
        <p className="mt-1 text-sm text-fg-muted">Private financial software. Enter your passphrase to continue.</p>
        <LoginForm next={params.next ?? "/"} error={params.error === "1"} />
      </div>
    </main>
  );
}
