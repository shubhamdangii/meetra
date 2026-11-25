import type { Metadata } from "next";
import { Suspense } from "react";
import PastPage from "@/components/pages/PastPage";

export const metadata: Metadata = { title: "Past nights", description: "A look inside past meetra nights." };

export default function Page() { return <Suspense><PastPage /></Suspense>; }
