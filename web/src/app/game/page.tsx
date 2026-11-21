import type { Metadata } from "next";
import { Suspense } from "react";
import GamePage from "@/components/pages/GamePage";

export const metadata: Metadata = { title: "Game" };

export default function Page() {
  return <Suspense><GamePage /></Suspense>;
}
