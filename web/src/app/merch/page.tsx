import type { Metadata } from "next";
import MerchPage from "@/components/pages/MerchPage";

export const metadata: Metadata = {
  title: "Merch · Drop 01",
  description: "meetra merch, Drop 01: tees, shirts, layers and accessories for people who come alone and leave together. Join the drop for free.",
};

export default function Page() {
  return <MerchPage />;
}
