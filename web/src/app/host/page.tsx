import type { Metadata } from "next";
import { HostPage } from "@/components/pages/HostPage";

export const metadata: Metadata = { title: "Host a meetup", description: "Join the meetra host waiting list. Run a plan you love — we bring the people, the venue and the sign-ups." };

export default function Page() {
  return (
    <div className="wrap">
      <section className="page-hero">
        <span className="eyebrow">Host with us</span>
        <h1>You bring the vibe.<br /><span className="serif">We bring the people.</span></h1>
        <p>Book clubs, treks, quiz nights, pottery, padel, poetry — if you&apos;d love doing it with strangers, you can host it.</p>
      </section>
      <HostPage />
    </div>
  );
}
