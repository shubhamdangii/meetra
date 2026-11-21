import type { Metadata } from "next";
import { Suspense } from "react";
import TicketPage from "@/components/pages/TicketPage";

export const metadata: Metadata = { title: "Your door pass", robots: { index: false } };

export default function Page() {
  return <Suspense><TicketPage /></Suspense>;
}
