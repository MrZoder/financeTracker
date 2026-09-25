import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/SettingsView";
import { dataDirectory } from "@/db/client";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  const storage = process.env.DATABASE_URL ? "Hosted PostgreSQL (DATABASE_URL)" : `Embedded PostgreSQL at ${dataDirectory()}`;
  const passphraseProtected = Boolean(process.env.TRAJECTORY_PASSPHRASE);
  return <SettingsView storage={storage} passphraseProtected={passphraseProtected} />;
}
