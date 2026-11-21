import type { Metadata } from "next";
import { Suspense } from "react";
import LoginPage from "@/components/pages/LoginPage";

export const metadata: Metadata = { title: "Log in", description: "Log in to meetra.", robots: { index: false } };

export default function Page() { return <Suspense><LoginPage /></Suspense>; }
