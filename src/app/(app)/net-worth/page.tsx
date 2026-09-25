import type { Metadata } from "next";
import { NetWorthView } from "@/components/net-worth/NetWorthView";

export const metadata: Metadata = { title: "Net Worth" };

export default function NetWorthPage() {
  return <NetWorthView />;
}
