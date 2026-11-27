import type { Metadata } from "next";
import Link from "next/link";
import { CONFIG } from "@/lib/config";

export const metadata: Metadata = {
  title: "Help & safety",
  description: "How meetra keeps plans safe: house rules, reporting someone, blocking, emergency tips, common questions and how to reach us.",
};

const wa = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(`Hi ${CONFIG.brand} team, I need help with:`)}`;

type Item = [icon: string, title: string, body: React.ReactNode];
const SECTIONS: { id: string; eyebrow: string; title: string; items: Item[] }[] = [
  {
    id: "guidelines", eyebrow: "Before you go", title: "Safety guidelines",
    items: [
      ["🎙️", "A host at every plan", "Every table has a host checked by our team. They're there from the first hello to the last goodbye, and they know your name before you arrive."],
      ["📍", "Public, checked venues", "Plans happen at cafés, studios, courts and other public places we've visited. The exact spot is shared only with confirmed guests in Your plans."],
      ["🪪", "Real profiles", "Everyone has a profile with a photo and a verified number. Hosts can see who's coming before the plan."],
      ["👥", "Small groups", "Most plans are 6 to 16 people. Small enough to talk to everyone, big enough that nobody is ever one-on-one with a stranger."],
      ["🚕", "Plan your own ride", "Travel on your own terms. Share your live location with a friend if you like, and leave whenever you want. No one should pressure you to stay."],
    ],
  },
  {
    id: "rules", eyebrow: "The way we do things", title: "House rules",
    items: [
      ["🤝", "Friends first", "These are friendship plans. No pushy dating, selling, recruiting or collecting numbers."],
      ["💬", "No unwanted messages", "If someone didn't share their contact with you, don't go looking for it. A no is a no, the first time."],
      ["📸", "Ask before photos", "Ask before you take or post a photo of someone. Hosts take group photos only with everyone's okay."],
      ["⏰", "Show up, or tell us", "Cancel in Your plans if you can't make it. Repeated no-shows lose priority for popular plans."],
    ],
  },
  {
    id: "report", eyebrow: "Something felt off?", title: "How to report someone",
    items: [
      ["🗣️", "During the plan", "Tell your host straight away. They can step in, move seats or ask someone to leave. You never have to explain yourself first."],
      ["📨", "After the plan", <>Message us on <a href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a> or write to <a href={`mailto:${CONFIG.email}`}>{CONFIG.email}</a> with the plan name and what happened. Screenshots help, but aren&apos;t required.</>],
      ["🔒", "Kept private", "Reports are read by the core team only. The person you report is never told who reported them."],
      ["⚡", "What happens next", "We reply the same day. Depending on what happened we warn, pause or permanently remove the person from all plans."],
    ],
  },
  {
    id: "blocking", eyebrow: "Staying apart", title: "Blocked users",
    items: [
      ["⛔", "What a block does", "A blocked member can't request seats at any plan, in any city, and is taken off every waiting list."],
      ["🙅", "Avoid one person", "Don't want to be at the same table as someone? Tell us. We'll do our best to keep you at different tables, without telling them why."],
      ["↩️", "Think a block was a mistake?", <>Write to <a href={`mailto:${CONFIG.email}`}>{CONFIG.email}</a>. A different team member reviews every appeal.</>],
    ],
  },
  {
    id: "emergency", eyebrow: "If you're in danger", title: "Emergency tips",
    items: [
      ["🚨", "Call 112 first", "India's emergency number works for police, fire and ambulance. Women can also call 181 (women's helpline). Then tell your host and us."],
      ["🏃", "Leave, no questions asked", "You can always walk away from a plan. Your seat, your priority and your profile are never affected."],
      ["📲", "Keep someone in the loop", "Tell a friend where you're going and share your live location. Keep your phone charged."],
      ["🍹", "Watch your drink", "Order your own drinks and keep them with you. If you feel unwell, tell your host right away."],
    ],
  },
];

const FAQ: [string, React.ReactNode][] = [
  ["Do I have to come alone?", "No, but most people do, and that's the point. You can bring one friend on plans that allow +1."],
  ["Who can see my private details?", "Only you, the hosts of plans you request, and our team. Other guests see your first name, photo and bio."],
  ["How do I cancel my seat?", <>Open <Link href="/saved/">Your plans</Link> and tap &quot;I can&apos;t make it&quot;. Paid seats follow the refund rules shown on the plan.</>],
  ["Can I rate my host?", <>Yes. If you were checked in, you can rate your host from 30 minutes after the start, in <Link href="/saved/">Your plans</Link>. You can change your rating later too.</>],
  ["I didn't get a seat. Why?", "Popular plans fill up fast. Seats go to the most complete profiles first, so adding a photo, bio and verified number helps."],
  ["How do I delete my account?", <>Write to <a href={`mailto:${CONFIG.email}`}>{CONFIG.email}</a> from the email on your account and we&apos;ll delete it for you.</>],
];

export default function Page() {
  return (
    <div className="wrap sf">
      <section className="page-hero">
        <span className="eyebrow">Help &amp; safety</span>
        <h1>Safe tables, <span className="serif">every time.</span></h1>
        <p>Everything you need to feel at ease at a {CONFIG.brand} plan, and what to do if something doesn&apos;t feel right.</p>
        <nav className="sf-jump" aria-label="On this page">
          {[...SECTIONS.map((s) => [s.id, s.title]), ["faq", "FAQ"], ["contact", "Contact"]].map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}
        </nav>
      </section>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="sf-sec">
          <div className="sf-head"><span className="eyebrow">{s.eyebrow}</span><h2>{s.title}</h2></div>
          <ul className="sf-list">
            {s.items.map(([ic, t, b]) => (
              <li key={t}><span className="sf-ic" aria-hidden="true">{ic}</span><div><b>{t}</b><p>{b}</p></div></li>
            ))}
          </ul>
        </section>
      ))}

      <section id="faq" className="sf-sec">
        <div className="sf-head"><span className="eyebrow">Quick answers</span><h2>FAQ</h2></div>
        <div>{FAQ.map(([q, a], i) => <details key={q} className="acc" open={i === 0}><summary>{q}</summary><div className="acc-body">{a}</div></details>)}</div>
      </section>

      <section id="contact" className="sf-sec">
        <div className="sf-head"><span className="eyebrow">We&apos;re real people</span><h2>Contact support</h2></div>
        <div className="sf-contact">
          <a href={wa} target="_blank" rel="noopener noreferrer"><span aria-hidden="true">💬</span><b>WhatsApp</b><small>Fastest. We reply the same day.</small></a>
          <a href={`mailto:${CONFIG.email}`}><span aria-hidden="true">✉️</span><b>Email</b><small>{CONFIG.email}</small></a>
          <Link href="/about/"><span aria-hidden="true">📖</span><b>How it works</b><small>Booking, payments and the small print.</small></Link>
        </div>
      </section>
    </div>
  );
}
