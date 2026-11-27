"use client";
// /merch/: meetra merch, Drop 01. Pick a piece, colour and size, and join the drop (interest only, nothing to pay today).
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import { burstFrom } from "../fx";
import { Modal } from "../admin/shared";
import { MerchArt } from "../MerchArt";
import { DROP_FAQ, MERCH, MERCH_CATS, type MerchItem, merchById } from "@/lib/merch";

type Mine = { item: string; colour: string; size: string };
const GENDERS = [["women", "Women"], ["men", "Men"], ["all", "All"]] as const;

export default function MerchPage() {
  const auth = useAuth(); const { toast, confirm } = useApp();
  const [gender, setGender] = useState<(typeof GENDERS)[number][0]>("all");
  const [cat, setCat] = useState<string>("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [back, setBack] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<MerchItem | null>(null);
  const [mine, setMine] = useState<Mine[]>([]);

  const loadMine = useCallback(async () => {
    if (!auth.client || !auth.me) { setMine([]); return; }
    const { data } = await auth.client.from("merch_interest").select("item,colour,size").eq("user_id", auth.me.id);
    setMine((data as Mine[]) ?? []);
  }, [auth.client, auth.me]);
  useEffect(() => { loadMine(); }, [loadMine]);

  const list = useMemo(() => MERCH.filter((m) =>
    (gender === "all" || m.gender === gender || m.gender === "unisex") && (cat === "all" || m.cat === cat) && (!onlyMine || mine.some((x) => x.item === m.id))), [gender, cat, onlyMine, mine]);

  return (
    <div className="wrap mx">
      <section className="page-hero mx-hero">
        <span className="eyebrow">meetra merch · Drop 01</span>
        <h1>Wear the <span className="serif">plan.</span></h1>
        <p>The chai glass from dinner, the run-club cap, the board-games tote. Pick a piece and join the drop. It&apos;s free to join.</p>
      </section>

      <div className="mx-bar">
        <div className="mx-seg" role="radiogroup" aria-label="Who it's for">
          {GENDERS.map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={gender === k} className={gender === k ? "on" : ""} onClick={() => setGender(k)}>
              {gender === k && <motion.span layoutId="mx-g" className="bg" transition={{ type: "spring", stiffness: 480, damping: 36 }} />}<span className="tx">{l}</span>
            </button>
          ))}
        </div>
        <select className="select mx-cat" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="all">All categories</option>{MERCH_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="button" className={`mx-mine ${onlyMine ? "on" : ""}`} onClick={() => setOnlyMine((x) => !x)} aria-pressed={onlyMine}>My drops <b>{mine.length}</b></button>
      </div>

      {!list.length ? <div className="mx-empty"><span aria-hidden="true">🧺</span><b>{onlyMine ? "You haven't joined a drop yet." : "Nothing here yet."}</b>{onlyMine && <button className="linkish" onClick={() => setOnlyMine(false)}>See all pieces</button>}</div> : (
        <motion.div className="mx-grid" layout>
          <AnimatePresence mode="popLayout">
            {list.map((m, i) => {
              const b = !!back[m.id]; const joined = mine.find((x) => x.item === m.id);
              return (
                <motion.article layout key={m.id} className="mx-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ type: "spring", stiffness: 300, damping: 28, delay: Math.min(i, 8) * 0.03 }}>
                  <button type="button" className="mx-img" onClick={() => setOpen(m)} aria-label={`Open ${m.name}`}>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span key={b ? "b" : "f"} className="mx-face" initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} exit={{ rotateY: -90, opacity: 0 }} transition={{ duration: 0.22 }}>
                        <MerchArt shape={m.shape} motif={m.motif} colour={m.colours[0].hex} side={b ? "back" : "front"} />
                      </motion.span>
                    </AnimatePresence>
                    {joined && <span className="mx-joined">✓ Joined</span>}
                  </button>
                  <button type="button" className="mx-flip" onClick={() => setBack((x) => ({ ...x, [m.id]: !b }))} aria-pressed={b}>{b ? "Front" : "Back"}</button>
                  <button type="button" className="mx-meta" onClick={() => setOpen(m)}>
                    <small>{m.gender === "unisex" ? "Unisex" : m.gender === "women" ? "Women" : "Men"} · {m.cat}</small>
                    <b>{m.name}</b>
                    <span className="mx-dots" aria-label={`${m.colours.length} colours`}>{m.colours.map((c) => <i key={c.name} style={{ background: c.hex }} title={c.name} />)}</span>
                  </button>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      <section className="mx-before">
        <span className="eyebrow">Drop 01 · limited first run</span>
        <h2>Before you join</h2>
        <p className="muted">Founding member price, shown when it&apos;s your turn. Nothing to pay today.</p>
        <div>{DROP_FAQ.map(([q, a], i) => <details key={q} className="acc" open={i === 0}><summary>{q}</summary><div className="acc-body">{a}</div></details>)}</div>
      </section>

      <Modal open={!!open} onClose={() => setOpen(null)} wide title={open ? open.name : ""}>
        {open && <Piece m={open} mine={mine.find((x) => x.item === open.id)} onOpen={(id) => setOpen(merchById(id) ?? null)}
          onJoin={async (colour, size, btn) => {
            if (!auth.requireLogin("/merch/")) return;
            const { error } = await auth.client!.rpc("join_merch_drop", { p_item: open.id, p_colour: colour, p_size: size });
            if (error) return toast("⚠️ " + error.message);
            burstFrom(btn, ["🧺", "✨", "💜"], 12); toast(`You're in the drop ✓ We'll WhatsApp you when ${open.name} is ready`); loadMine();
          }}
          onLeave={async () => {
            if (!(await confirm({ title: `Leave the drop for ${open.name}?`, body: "You can join again any time while the drop is open.", ok: "Leave" }))) return;
            const { error } = await auth.client!.rpc("leave_merch_drop", { p_item: open.id });
            if (error) return toast("⚠️ " + error.message);
            toast("Removed from your drops"); loadMine();
          }} />}
      </Modal>
    </div>
  );
}

function Piece({ m, mine, onJoin, onLeave, onOpen }: { m: MerchItem; mine?: Mine; onJoin: (colour: string, size: string, btn: HTMLElement) => void; onLeave: () => void; onOpen: (id: string) => void }) {
  const [colour, setColour] = useState(mine?.colour ?? m.colours[0].name);
  const [size, setSize] = useState(mine?.size ?? (m.sizes.length === 1 ? m.sizes[0] : ""));
  useEffect(() => { setColour(mine?.colour ?? m.colours[0].name); setSize(mine?.size ?? (m.sizes.length === 1 ? m.sizes[0] : "")); }, [m.id, mine]);
  const hex = m.colours.find((c) => c.name === colour)?.hex ?? m.colours[0].hex;
  const pairs = m.pairs.map(merchById).filter(Boolean) as MerchItem[];
  return (
    <div className="mx-piece">
      <div className="mx-views">
        {(["front", "back"] as const).map((s) => (
          <motion.figure key={s + hex} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}><MerchArt shape={m.shape} motif={m.motif} colour={hex} side={s} /><figcaption>{s === "front" ? "Front" : "Back"}</figcaption></motion.figure>
        ))}
      </div>
      <span className="mx-code">{m.gender === "unisex" ? "Unisex" : m.gender === "women" ? "Women" : "Men"} · {m.cat} · {m.code}</span>
      <h2 className="mx-name">{m.name}</h2>
      <p className="mx-price serif">Founding member price</p>
      <p className="mx-note"><b>Drop 01 · limited first run</b> Revealed when it&apos;s your turn. Nothing to pay today.</p>
      <p className="mx-blurb">{m.blurb}</p>
      <dl className="mx-spec"><div><dt>Fit</dt><dd>{m.fit}</dd></div><div><dt>Fabric</dt><dd>{m.fabric}</dd></div><div><dt>Colours</dt><dd>{m.colours.map((c) => c.name).join(" / ")}</dd></div></dl>
      <div className="mx-pick">
        <span className="mx-lbl">Colour <b>{colour}</b></span>
        <div className="mx-swatches" role="radiogroup" aria-label="Colour">{m.colours.map((c) => (
          <button key={c.name} type="button" role="radio" aria-checked={colour === c.name} aria-label={c.name} className={colour === c.name ? "on" : ""} style={{ background: c.hex }} onClick={() => setColour(c.name)} />
        ))}</div>
      </div>
      <div className="mx-pick">
        <span className="mx-lbl">Size {size && <b>{size}</b>}</span>
        <div className="mx-sizes" role="radiogroup" aria-label="Size">{m.sizes.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={size === s} className={size === s ? "on" : ""} onClick={() => setSize(s)}>{s}</button>
        ))}</div>
      </div>
      <div className="mx-cta">
        <motion.button whileTap={{ scale: 0.96 }} className="btn btn-sun btn-block" disabled={!size} onClick={(e) => onJoin(colour, size, e.currentTarget)}>
          {!size ? "Pick a size" : mine ? (mine.colour === colour && mine.size === size ? "✓ You're in the drop" : "Update my drop") : "Join the drop"}
        </motion.button>
        {mine && <button type="button" className="linkish" onClick={onLeave}>Leave this drop</button>}
      </div>
      {DROP_FAQ.slice(0, 1).concat(DROP_FAQ.slice(2)).map(([q, a]) => <details key={q} className="acc"><summary>{q}</summary><div className="acc-body">{a}</div></details>)}
      {pairs.length > 0 && <div className="mx-pairs"><span className="mx-lbl">Wear it with</span>
        <div>{pairs.map((p) => <button key={p.id} type="button" onClick={() => onOpen(p.id)}><MerchArt shape={p.shape} motif={p.motif} colour={p.colours[0].hex} /><span>{p.name}</span></button>)}</div></div>}
      <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>Questions? <Link href="/safety/#contact" style={{ textDecoration: "underline" }}>Contact us</Link></p>
    </div>
  );
}
