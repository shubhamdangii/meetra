"use client";
// /games/ — the hub: card decks up top, party games below.
import { motion } from "framer-motion";
import Link from "next/link";
import { DECKS, PARTY } from "@/lib/games";
import { CONFIG } from "@/lib/config";
import { Wavy } from "../fx";

const gameCover = (id: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/images/games/${id}.svg`;

export default function GamesPage() {
  return (
    <div className="wrap">
      <section className="page-hero games-hero">
        <span className="eyebrow">Games from our tables</span>
        <h1>One phone. <span className="serif sweep">Whole table plays.</span></h1>
        <p>Pick a deck, read a card, pass it round. These are the games our hosts bring to dinner, free for your next hangout too.</p>
      </section>

      <div className="group">
        <div className="group-head"><h3><Wavy text="Card decks" /></h3><span>{DECKS.length} decks</span></div>
        <div className="deck-grid">
          {DECKS.map((d, i) => (
            <motion.div key={d.id} initial={{ opacity: 0, y: 30, rotate: i % 2 ? 3 : -3 }} whileInView={{ opacity: 1, y: 0, rotate: 0 }}
              viewport={{ once: true }} transition={{ type: "spring", stiffness: 180, damping: 18, delay: (i % 2) * 0.06 }}>
              <Link href={`/game/?id=${d.id}`} className="deck-tile">
                <motion.div className="deck-face" style={{ background: d.color }} whileHover={{ rotate: -2, y: -4 }} whileTap={{ scale: 0.95, rotate: 2 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="game-cover" src={gameCover(d.id)} alt="" loading="lazy" />
                  <small className="deck-count">{d.cards.length} cards</small>
                  <span className="deck-back" aria-hidden="true" style={{ background: d.color }} />
                </motion.div>
                <span className="deck-name">{d.name}</span>
                <span className="deck-for">{d.for}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="group">
        <div className="group-head"><h3><Wavy text="Party games" /></h3><span>{PARTY.length} games</span></div>
        <div className="party-list">
          {PARTY.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, x: i % 2 ? 30 : -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "0px 0px -30px 0px" }}
              transition={{ type: "spring", stiffness: 220, damping: 22 }}>
              <Link href={`/game/?id=${p.id}`} className="party-row">
                <motion.span className="party-ic party-cover" whileHover={{ rotate: -6, scale: 1.06 }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={gameCover(p.id)} alt="" loading="lazy" /></motion.span>
                <span className="party-txt"><b>{p.name}</b><span>{p.line}</span><small>{p.players}</small></span>
                <span className="party-go" aria-hidden="true">→</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      <section className="sec" style={{ paddingTop: 10 }}>
        <div className="cta-band">
          <div>
            <h2>Play these with <span className="serif">new people.</span></h2>
            <p>Every meetra plan starts with a game, so nobody has to break the ice alone.</p>
            <Link className="btn btn-sun" href="/events/">Find a plan →</Link>
          </div>
          <div className="big-em" aria-hidden="true">🎲</div>
        </div>
      </section>
    </div>
  );
}
