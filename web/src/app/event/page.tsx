import type { Metadata } from "next";
import { Suspense } from "react";
import EventPage from "@/components/pages/EventPage";

export const metadata: Metadata = { title: "Meetup" };

export default function Page() {
  return <Suspense><EventPage /></Suspense>;
}
