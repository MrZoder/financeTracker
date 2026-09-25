import { redirect } from "next/navigation";
import { FinanceModals } from "@/components/finance/FinanceModals";
import { FinanceProvider } from "@/components/finance/FinanceProvider";
import { AppShell } from "@/components/shell/AppShell";
import { getAppData } from "@/data/cache";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const data = await getAppData();
  if (!data.onboardingCompleted && !data.isDemo) redirect("/onboarding");
  return (
    <FinanceProvider data={data}>
      <AppShell>{children}</AppShell>
      <FinanceModals />
    </FinanceProvider>
  );
}
