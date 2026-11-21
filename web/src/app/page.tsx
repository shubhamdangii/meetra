import Link from "next/link";
import { ExplorePreview, Faces, HeroCount, HeroStack, Hosts, Marquee, Stats, Wall } from "@/components/Home";
import { Reveal } from "@/components/ui";

const FAQ = [
  ["Will it be safe?", "Every plan happens at a public, checked venue with a verified host there from start to finish. You can report anything, any time — we act the same day."],
  ["Will there be other women?", "Yes. We balance every group and many plans have more women than men. There are also women-only plans every week."],
  ["Can I bring a friend?", "Of course — tick \"bringing a friend\" when you request. We just ask that you both mingle with the table."],
  ["Who sees my number?", "Only your host, and only for that plan. It's never shown to other guests or shared with anyone."],
  ["What if I'm an introvert?", "Then you're our favourite kind of guest. Plans like the Introverts' Dinner are designed so you can listen first and talk when you feel like it."],
];
const TRUST = [
  ["📝", "How seat requests work", "Request a seat, the team checks the group mix and confirms on WhatsApp. You pay only once you're in."],
  ["✔️", "Verified hosts", "Every host has had a call with our team and runs a trial plan before going public."],
  ["🏠", "A host at every plan", "No plan runs without its host present, start to finish."],
  ["📍", "Where you'll meet", "Cafés, courts, studios and rooftops we've checked ourselves. The exact address is shared after confirmation."],
  ["👥", "Group size", "Mostly 8–16 people — small enough that you actually talk to everyone."],
  ["📜", "House rules, enforced", "Be kind, be on time, no pushy dating or selling. Breaking them means you won't be invited back."],
  ["⭐", "Priority by profile", "When a plan is popular, the most complete profiles get seats and waiting-list places first."],
  ["🚩", "Report anything", "Message us on WhatsApp during or after any plan. We take every report seriously."],
  ["💸", "What you'll pay", "Usually a ₹99 seat reservation. Food and drinks are ordered separately unless the plan says \"per person\"."],
];

export default function HomePage() {
  return (
    <>
      <section className="wrap hero">
        <div>
          <HeroCount />
          <h1>Come alone.<br />Leave with a <span className="serif">group chat.</span></h1>
          <p className="hero-sub">Small, hosted meetups for people who&apos;d love new friends but hate awkward small talk. Every table has a host who breaks the ice for you.</p>
          <div className="hero-ctas">
            <Link className="btn btn-sun" href="/events/">Find your next plan →</Link>
            <Link className="btn btn-white" href="/swipe/">Swipe plans 🔥</Link>
          </div>
          <div className="hero-proof"><Faces /><span><b>Hosted every single day.</b><br />Dinners, games, walks, sports &amp; trips.</span></div>
        </div>
        <HeroStack />
      </section>

      <Marquee />
      <ExplorePreview />

      <section className="wrap sec" id="how" style={{ paddingTop: 20 }}>
        <div className="sec-head"><div><span className="eyebrow">How it works</span><h2 className="h2">Three steps to <span className="hl">new friends</span></h2></div></div>
        <div className="steps">
          {[["01", "Pick a plan you'd actually enjoy", "Dinners, board games, sunrise treks, quiz nights — something every day of the week."],
            ["02", "Request a seat", "Log in with Google or WhatsApp. The more complete your profile, the higher your priority."],
            ["03", "Show up. We handle the awkward bit.", "Your host starts with a game, introduces everyone and keeps the table talking."]].map(([n, t, d], i) => (
            <Reveal key={n} delay={i * 0.1} className="step"><span className="num">{n}</span><h3>{t}</h3><p>{d}</p></Reveal>
          ))}
        </div>
      </section>

      <section className="wrap">
        <Reveal className="band">
          <div className="sec-head">
            <div><span className="eyebrow" style={{ color: "var(--sun)" }}>The people behind every plan</span><h2 className="h2">Meet your <span className="serif">hosts.</span></h2><p>Real people, verified by our team, who love bringing strangers together.</p></div>
            <Link className="btn btn-sun" href="/host/">Become a host →</Link>
          </div>
          <Hosts />
        </Reveal>
      </section>

      <section className="wrap sec">
        <div className="sec-head"><div><span className="eyebrow">What people say after</span><h2 className="h2">The group chat, <span className="serif" style={{ color: "var(--pink)" }}>after.</span> 👀</h2></div></div>
        <Wall />
      </section>

      <section className="wrap">
        <Reveal className="qlinks">
          <Link href="/swipe/">swipe plans 🔥 →</Link>
          <Link href="/events/?when=weekend">this weekend →</Link>
          <Link href="/events/?cat=food">dinners →</Link>
          <Link href="/saved/">your plans →</Link>
          <Link href="/host/">host one →</Link>
          <Link href="/partners/">for brands &amp; venues →</Link>
          <Link href="/past/">past nights →</Link>
        </Reveal>
      </section>

      <section className="wrap sec" id="faq">
        <div className="faq-grid">
          <div className="faq-big">
            <span className="eyebrow">Questions we get asked most</span>
            <h2 style={{ marginTop: 10 }}>Coming alone? <span className="serif">Most people do.</span></h2>
            <p className="muted" style={{ marginTop: 18, maxWidth: 380 }}>Still unsure? <Link href="/about/" style={{ textDecoration: "underline" }}>Read how it all works</Link> or message us on WhatsApp — a real person answers.</p>
          </div>
          <div>{FAQ.map(([q, a], i) => <details key={q} className="acc" open={i === 0}><summary>{q}</summary><div className="acc-body">{a}</div></details>)}</div>
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: 40 }}>
        <h2 className="h2">Before <span className="serif" style={{ color: "var(--violet)" }}>you go.</span></h2>
        <Stats />
        <div className="trust">
          {TRUST.map(([ic, t, d]) => <details key={t} className="acc"><summary><span className="ic">{ic}</span><span>{t}</span></summary><div className="acc-body">{d}</div></details>)}
        </div>
      </section>

      <section className="wrap sec">
        <Reveal className="cta-band">
          <div>
            <h2>Got a plan people would <span className="serif">love?</span></h2>
            <p>Run a book club, a trek, a board-game night or anything you&apos;re great at. We bring the people, you bring the vibe.</p>
            <Link className="btn btn-sun" href="/host/">Host a meetup →</Link>
          </div>
          <div className="big-em" aria-hidden="true">🎙️</div>
        </Reveal>
      </section>
    </>
  );
}
