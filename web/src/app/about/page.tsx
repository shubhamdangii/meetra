import type { Metadata } from "next";
import { Reveal } from "@/components/ui";

export const metadata: Metadata = { title: "How it works", description: "How meetra meetups work, how we keep them safe, and the small print." };

const Acc = ({ q, children, open = false }: { q: string; children: React.ReactNode; open?: boolean }) => (
  <details className="acc" open={open}><summary>{q}</summary><div className="acc-body">{children}</div></details>
);

export default function Page() {
  return (
    <div className="wrap">
      <section className="page-hero">
        <span className="eyebrow">How it works</span>
        <h1>Making friends as an adult is <span className="serif">weirdly hard.</span></h1>
        <p>So we made it easy: small groups, a plan worth showing up for, and a host who makes sure nobody&apos;s left standing in a corner.</p>
      </section>

      <section className="steps sec" style={{ paddingTop: 20 }}>
        {[["01", "Browse", "Something on every day: dinners, games, sports, walks, workshops and weekend trips. Or swipe through them on Discover."],
          ["02", "Request", "Log in and request a seat. When a plan is popular, the most complete profiles get seats first."],
          ["03", "Show up", "Your host does the introductions. You just have to say yes to the second plan."]].map(([n, t, d], i) => (
          <Reveal key={n} delay={i * 0.1} className="step"><span className="num">{n}</span><h3>{t}</h3><p>{d}</p></Reveal>
        ))}
      </section>

      <section className="faq-grid sec" id="before">
        <div className="faq-big"><span className="eyebrow">Before you go</span><h2 style={{ marginTop: 10 }}>The <span className="serif">basics.</span></h2></div>
        <div>
          <Acc q="📝 How seat requests work" open>Request a seat, the team checks the group mix and confirms on WhatsApp. You pay only once you&apos;re in.</Acc>
          <Acc q="⭐ Priority by profile">When a plan is popular, the most complete profiles get seats and waiting-list places first. Nobody is blocked for a short profile.</Acc>
          <Acc q="👥 Group size">Mostly 8 to 16 people, small enough that you actually talk to everyone.</Acc>
          <Acc q="📍 Where you'll meet">Cafés, courts, studios and rooftops we&apos;ve checked ourselves. The exact address is shared after confirmation.</Acc>
          <Acc q="📜 House rules, enforced">Be kind, be on time, no pushy dating or selling. Breaking them means you won&apos;t be invited back.</Acc>
          <Acc q="💸 What you'll pay">Usually a ₹99 seat reservation. Food and drinks are ordered separately unless the plan says &quot;per person&quot;.</Acc>
        </div>
      </section>

      <section className="faq-grid sec" id="safety">
        <div className="faq-big"><span className="eyebrow">Help &amp; safety</span><h2 style={{ marginTop: 10 }}>Safe by <span className="serif">design.</span></h2></div>
        <div>
          <Acc q="Verified hosts" open>Every host has a call with our team and a trial plan before they go public. Hosts with poor feedback are removed.</Acc>
          <Acc q="Public, checked venues">Plans happen at places we&apos;ve visited ourselves. Trips are run by our own team with vetted stays.</Acc>
          <Acc q="Balanced groups & women-only plans">Hosts balance each table, and there are women-only plans every week in every city.</Acc>
          <Acc q="Your number stays private">Only the hosts of plans you request (and our team) see it. No guest lists are shared.</Acc>
          <Acc q="Report anything">Message us on WhatsApp any time, during or after a plan. We respond the same day and can block people from future plans.</Acc>
        </div>
      </section>

      <section className="faq-grid sec" id="terms">
        <div className="faq-big"><span className="eyebrow">The small print</span><h2 style={{ marginTop: 10 }}>Terms &amp; <span className="serif">privacy.</span></h2></div>
        <div id="privacy">
          <Acc q="Payments & refunds">Seat reservations are paid after your seat is confirmed and are non-refundable once paid. If we cancel a plan, you get a full refund.</Acc>
          <Acc q="What we store">Your profile and requests are stored securely, protected by industry-standard encryption and strict access controls. Private details are visible only to you, the hosts of plans you request, and our team. Saved plans and swipes are also kept in your own browser.</Acc>
          <Acc q="Age (18+ only)">You must be 18 or older to create an account, request a seat or host. Your date of birth is checked when you add it, and we may ask for ID at the door.</Acc>
          <p className="fine">Replace this section with your full terms and privacy policy before launch.</p>
        </div>
      </section>
    </div>
  );
}
