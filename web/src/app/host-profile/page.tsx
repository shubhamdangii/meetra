import type { Metadata } from "next";
import { Suspense } from "react";
import HostProfilePage from "@/components/pages/HostProfilePage";

export const metadata: Metadata = { title: "Host" };

export default function Page() {
  return <Suspense><HostProfilePage /></Suspense>;
}
