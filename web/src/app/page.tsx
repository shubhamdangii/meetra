import Link from "next/link";
import { ExplorePreview, Faces, HeroCount, HeroStack, Hosts, Moments, Ribbon, Stats, Steps, Wall } from "@/components/Home";
import { Magnetic, WordReveal, Wavy } from "@/components/fx";
import { Reveal } from "@/components/ui";
import { NotHost } from "@/components/host/useIsHost";

const FAQ = [
  ["Will it be safe?", "Every plan happens at a public, checked venue with a verified host there from start to finish. You can report anything, any time and we act the same day."],
  ["Will there be other women?", "Yes. We balance every group and many plans have more women than men. There are also women-only plans every week."],
  ["Who sees my number?", "Only your host, and only for that plan. It's never shown to other guests or shared with anyone."],
  ["What if I'm an introvert?", "Then you're our favourite kind of guest. Plans like the Introverts' Dinner are designed so you can listen first and talk when you feel like it."],
];
const STEPS = [
  ["01", "Pick a plan you'd actually enjoy", "Dinners, board games, sunrise treks, quiz nights: something every day of the week."],
  ["02", "Request a seat", "Log in with Google. The more complete your profile, the higher your priority."],
  ["03", "Show up. We handle the awkward bit.", "Your host starts with a game, introduces everyone and keeps the table talking."],
];

export default function HomePage() {
  return (
    <>
      <section className="wrap hero">
        <div>
          <HeroCount />
          <h1>
            <WordReveal text="Come alone." /><br />
            <WordReveal text="Leave with a" delay={0.2} />{" "}
            <span className="serif sweep"><WordReveal text="group chat." delay={0.4} /></span>
          </h1>
          <p className="hero-sub">Small, hosted meetups for people who&apos;d love new friends but hate awkward small talk. Every table has a host who breaks the ice for you.</p>
          <div className="hero-ctas">
            <Magnetic><Link className="btn btn-sun" href="/events/">Find your next plan →</Link></Magnetic>
            <Magnetic><Link className="btn btn-white" href="/swipe/">Swipe plans 🔥</Link></Magnetic>
          </div>
          <div className="hero-proof"><Faces /><span><b>Hosted every single day.</b><br />Dinners, games, walks, sports &amp; trips.</span></div>
        </div>
        <HeroStack />
      </section>

      <ExplorePreview />

      <section className="wrap sec moments" style={{ paddingTop: 10 }}>
        <Moments head={<div className="sec-head"><div><span className="eyebrow">No stock photos. Ever.</span><h2 className="h2"><Wavy text="Real people," /> <span className="serif" style={{ color: "var(--pink)" }}><Wavy text="real nights." /></span></h2><p>Straight from our meetups in Jaipur and Ahmedabad.</p></div></div>} />
      </section>

      <section className="wrap sec" id="how" style={{ paddingTop: 10 }}>
        <div className="sec-head"><div><span className="eyebrow">How it works</span><h2 className="h2"><Wavy text="Three steps to" /> <span className="hl"><Wavy text="new friends" /></span></h2></div></div>
        <Steps items={STEPS} />
        <Reveal style={{ marginTop: 22 }}><Link href="/games/" className="games-teaser"><span className="dice" aria-hidden="true">🎲</span><div><b>Party games for any table</b><span>Card decks, Undercover, Mafia, Heads Up and more. One phone, free.</span></div><span className="btn btn-ink btn-sm">Play →</span><span className="tz-go" aria-hidden="true">→</span></Link></Reveal>
      </section>

      <section className="wrap">
        <Reveal className="band">
          <div className="sec-head">
            <div><span className="eyebrow" style={{ color: "var(--sun)" }}>The people behind every plan</span><h2 className="h2"><Wavy text="Meet your" /> <span className="serif"><Wavy text="hosts." /></span></h2><p>Real people, verified by our team, who love bringing strangers together.</p></div>
            <NotHost><Magnetic><Link className="btn btn-sun" href="/host/">Become a host →</Link></Magnetic></NotHost>
          </div>
          <Hosts />
        </Reveal>
      </section>

      <section className="wrap sec">
        <div className="sec-head"><div><span className="eyebrow">What people say after</span><h2 className="h2"><Wavy text="The group chat," /> <span className="serif" style={{ color: "var(--pink)" }}><Wavy text="after." /></span> 👀</h2></div></div>
        <Wall />
        <Stats />
      </section>

      <section className="wrap sec home-faq" id="faq" style={{ paddingTop: 10 }}>
        <div className="faq-grid">
          <div className="faq-big">
            <span className="eyebrow">Questions we get asked most</span>
            <h2 style={{ marginTop: 10 }}><Wavy text="Coming alone?" /> <span className="serif"><Wavy text="Most people do." /></span></h2>
            <p className="muted" style={{ marginTop: 18, maxWidth: 380 }}>Safety, payments, house rules and more: <Link href="/about/" style={{ textDecoration: "underline" }}>read how it all works</Link>.</p>
          </div>
          <div>{FAQ.map(([q, a], i) => <details key={q} className="acc" open={i === 0}><summary>{q}</summary><div className="acc-body">{a}</div></details>)}</div>
        </div>
      </section>

      <NotHost><section className="wrap sec" style={{ paddingTop: 0 }}>
        <Reveal className="cta-band">
          <div>
            <h2><Wavy text="Got a plan people would" /> <span className="serif"><Wavy text="love?" /></span></h2>
            <p>Run a book club, a trek, a board-game night or anything you&apos;re great at. We bring the people, you bring the vibe.</p>
            <Magnetic><Link className="btn btn-sun" href="/host/">Join the host waiting list →</Link></Magnetic>
          </div>
          <div className="big-em" aria-hidden="true">🎙️</div>
        </Reveal>
      </section></NotHost>

      <section className="wrap rb-sec"><Ribbon /></section>
    </>
  );
}
