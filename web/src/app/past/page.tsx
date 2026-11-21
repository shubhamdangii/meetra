import type { Metadata } from "next";
import PastPage from "@/components/pages/PastPage";

export const metadata: Metadata = { title: "Past nights", description: "A look inside past meetra nights." };

export default function Page() { return <PastPage />; }
