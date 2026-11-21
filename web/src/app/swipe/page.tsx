import type { Metadata } from "next";
import SwipePage from "@/components/pages/SwipePage";

export const metadata: Metadata = { title: "Discover plans", description: "Swipe through upcoming meetups. Right for interested, left to skip." };

export default function Page() { return <SwipePage />; }
