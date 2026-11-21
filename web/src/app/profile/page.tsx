import type { Metadata } from "next";
import ProfilePage from "@/components/pages/ProfilePage";

export const metadata: Metadata = { title: "Your profile", robots: { index: false } };

export default function Page() { return <ProfilePage />; }
