import type { Metadata } from "next";
import { Suspense } from "react";
import EventsPage from "@/components/pages/EventsPage";

export const metadata: Metadata = { title: "Explore meetups", description: "Every hosted meetup this month. Filter by day, category and city." };

export default function Page() {
  return <Suspense><EventsPage /></Suspense>;
}
