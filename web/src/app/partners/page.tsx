import type { Metadata } from "next";
import { PartnerForm } from "@/components/pages/FormsPages";
import { Reveal } from "@/components/ui";

export const metadata: Metadata = { title: "For brands & venues", description: "Bring a room full of curious, new faces to your café, studio or brand." };

export default function Page() {
  return (
    <div className="wrap">
      <section className="page-hero">
        <span className="eyebrow">For brands &amp; venues</span>
        <h1>Fill your space with <span className="serif">new regulars.</span></h1>
        <p>We bring small groups of curious people to cafés, studios, courts and rooftops, on the quiet nights you most want filled.</p>
      </section>
      <section className="steps" style={{ marginBottom: 56 }}>
        {[["🏠", "Venues", "Host our weekly plans on your slow weekdays. Guests order from your menu; we bring 10–30 people a night."],
          ["✨", "Brands", "Sponsor a series (a run club, a tasting, a workshop) and meet your audience in person, not in a feed."],
          ["🏢", "Teams", "Private socials for new joiners and remote teams, run by our hosts from start to finish."]].map(([ic, t, d], i) => (
          <Reveal key={t} delay={i * 0.1} className="step"><span className="num">{ic}</span><h3>{t}</h3><p>{d}</p></Reveal>
        ))}
      </section>
      <section className="split" style={{ paddingBottom: 40 }}>
        <div>
          <h2 className="h2">Venues we&apos;d <span className="serif" style={{ color: "var(--violet)" }}>love</span> to work with</h2>
          <p className="muted" style={{ margin: "14px 0 20px", maxWidth: 440 }}>Cafés with a big table, board-game cafés, rooftops, sports courts, art studios, bookshops and homestays near the city.</p>
        </div>
        <PartnerForm />
      </section>
    </div>
  );
}
