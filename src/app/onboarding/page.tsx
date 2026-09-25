import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { getAppData } from "@/data/cache";

export const metadata: Metadata = { title: "Set up" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const data = await getAppData();
  if (data.onboardingCompleted) redirect("/");
  return <OnboardingFlow today={data.today} name={data.user.name} />;
}
