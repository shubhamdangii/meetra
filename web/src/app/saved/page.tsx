import type { Metadata } from "next";
import SavedPage from "@/components/pages/SavedPage";

export const metadata: Metadata = { title: "Your plans", description: "Seats you've requested and plans you've saved." };

export default function Page() { return <SavedPage />; }
