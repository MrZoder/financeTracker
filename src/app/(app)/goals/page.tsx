import type { Metadata } from "next";
import { GoalsView } from "@/components/goals/GoalsView";

export const metadata: Metadata = { title: "Goals" };

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ goal?: string; new?: string }> }) {
  const params = await searchParams;
  return <GoalsView highlightId={params.goal ?? null} openNew={params.new === "1"} />;
}
