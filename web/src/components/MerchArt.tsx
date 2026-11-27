// Flat illustrations of each merch piece, front and back, in any colour. Pure SVG: no image files, sharp on every screen.
import type { Motif, Shape } from "@/lib/merch";

const INK = "#16122B";
const dark = (hex: string) => { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; return r * 0.3 + g * 0.59 + b * 0.11 < 110; };

/* garment outlines (viewBox 0 0 200 220) */
const BODY: Record<Shape, string> = {
  tee: "M62 34 L86 22 Q100 34 114 22 L138 34 L166 58 L151 80 L138 72 L138 178 Q100 186 62 178 L62 72 L49 80 L34 58 Z",
  boxtee: "M56 32 L84 22 Q100 34 116 22 L144 32 L174 66 L156 86 L144 78 L144 190 L56 190 L56 78 L44 86 L26 66 Z",
  tank: "M72 22 L86 22 Q100 52 114 22 L128 22 Q126 62 140 82 L140 190 Q100 196 60 190 L60 82 Q74 62 72 22 Z",
  longsleeve: "M62 32 L86 22 Q100 34 114 22 L138 32 L166 126 L150 130 L138 84 L138 192 L62 192 L62 84 L50 130 L34 126 Z",
  polo: "M60 32 L86 22 L100 38 L114 22 L140 32 L168 58 L152 80 L140 72 L140 190 L60 190 L60 72 L48 80 L32 58 Z",
  shirt: "M58 34 L84 22 L100 40 L116 22 L142 34 L170 62 L154 82 L142 74 L142 192 L58 192 L58 74 L46 82 L30 62 Z",
  dress: "M72 24 L88 20 Q100 30 112 20 L128 24 L150 48 L138 62 L132 56 L154 206 Q100 214 46 206 L68 56 L62 62 L50 48 Z",
  trousers: "M60 24 L140 24 L150 206 L112 206 L100 92 L88 206 L50 206 Z",
  skirt: "M68 36 L132 36 L158 188 Q100 200 42 188 Z",
  shorts: "M56 44 L144 44 L154 138 L108 138 L100 96 L92 138 L46 138 Z",
  hoodie: "M58 40 L82 30 Q100 44 118 30 L142 40 L168 132 L151 136 L140 90 L140 194 L60 194 L60 90 L49 136 L32 132 Z",
  zip: "M60 34 L84 24 Q100 32 116 24 L140 34 L166 128 L150 132 L140 86 L140 192 L60 192 L60 86 L50 132 L34 128 Z",
  cardigan: "M62 32 L86 22 L100 60 L114 22 L138 32 L164 124 L148 128 L138 84 L138 176 L62 176 L62 84 L52 128 L36 124 Z",
  cap: "M48 126 Q50 64 100 58 Q150 64 152 126 Z",
  tote: "M48 82 L152 82 L158 200 L42 200 Z",
  scarf: "M70 20 L100 20 L100 180 L70 180 Z M100 150 L150 196 L128 210 L84 166 Z",
};
/* extra lines that make each piece read as itself */
function Details({ s, c }: { s: Shape; c: string }) {
  const p = { fill: "none", stroke: c, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (s) {
    case "polo": return <g {...p}><path d="M86 22 L100 38 L114 22" /><path d="M100 38 L100 62" /><circle cx="100" cy="48" r="1.6" fill={c} /><circle cx="100" cy="57" r="1.6" fill={c} /></g>;
    case "shirt": return <g {...p}><path d="M84 22 L100 40 L116 22" /><path d="M100 40 L100 192" /><circle cx="104" cy="70" r="1.6" fill={c} /><circle cx="104" cy="104" r="1.6" fill={c} /><circle cx="104" cy="138" r="1.6" fill={c} /><path d="M118 96 h14 v14 h-14 z" /></g>;
    case "dress": return <g {...p}><path d="M78 98 Q100 104 122 98" /><path d="M100 30 L100 96" /><circle cx="104" cy="50" r="1.5" fill={c} /><circle cx="104" cy="72" r="1.5" fill={c} /></g>;
    case "trousers": return <g {...p}><path d="M60 38 L140 38" /><path d="M100 38 L100 70" /><path d="M72 46 Q80 60 92 52" /></g>;
    case "skirt": return <g {...p}><path d="M68 50 L132 50" /><path d="M120 50 Q112 120 132 186" /><path d="M128 54 l12 18" /></g>;
    case "shorts": return <g {...p}><path d="M56 58 L144 58" /><path d="M96 58 v14 M104 58 v14" /></g>;
    case "hoodie": return <g {...p}><path d="M80 32 Q100 6 120 32" /><path d="M76 140 L124 140 L130 168 L70 168 Z" /><path d="M94 44 v18 M106 44 v18" /></g>;
    case "zip": return <g {...p}><path d="M100 30 L100 192" /><path d="M84 24 L100 44 L116 24" /><path d="M66 120 h18 M116 120 h18" /></g>;
    case "cardigan": return <g {...p}><path d="M100 60 L100 176" /><circle cx="104" cy="88" r="1.8" fill={c} /><circle cx="104" cy="112" r="1.8" fill={c} /><circle cx="104" cy="136" r="1.8" fill={c} /><circle cx="104" cy="160" r="1.8" fill={c} /><path d="M62 166 L138 166" /></g>;
    case "cap": return <g><path d="M40 124 Q100 140 184 118 L178 134 Q100 154 38 138 Z" fill="inherit" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" /><path d="M100 58 V124" {...p} /><circle cx="100" cy="58" r="3" fill={c} /></g>;
    case "tote": return <g {...p}><path d="M70 82 Q70 30 100 30 Q130 30 130 82" stroke={INK} strokeWidth={6} /></g>;
    case "scarf": return <g {...p}><path d="M70 180 v10 M78 180 v10 M86 180 v10 M94 180 v10" /><path d="M70 40 h30 M70 60 h30" /></g>;
    case "tank": return <g {...p}><path d="M72 22 Q76 64 60 84" opacity=".5" /><path d="M128 22 Q124 64 140 84" opacity=".5" /></g>;
    default: return <g {...p}><path d="M86 22 Q100 34 114 22" /></g>;
  }
}
/* back prints */
function Print({ m, x, y, k }: { m: Motif; x: number; y: number; k: number }) {
  const t = `translate(${x} ${y}) scale(${k})`;
  switch (m) {
    case "chai": return (
      <g transform={t}>
        <ellipse cx="0" cy="6" rx="38" ry="14" fill="none" stroke="#FF7A3D" strokeWidth="3.5" transform="rotate(-18)" />
        <path d="M-14 -16 L14 -16 L10 22 L-10 22 Z" fill="#6C4CF5" stroke={INK} strokeWidth="2" />
        <path d="M-12 -6 L12 -6" stroke="#FFC93C" strokeWidth="5" />
        <path d="M-5 -24 q4 -6 0 -12 M5 -24 q4 -6 0 -12" fill="none" stroke="#6C4CF5" strokeWidth="2.5" strokeLinecap="round" />
      </g>);
    case "dice": return (
      <g transform={t}>
        <rect x="-30" y="-14" width="28" height="28" rx="6" fill="#fff" stroke={INK} strokeWidth="2.5" transform="rotate(-14 -16 0)" />
        <rect x="4" y="-10" width="28" height="28" rx="6" fill="#FFC93C" stroke={INK} strokeWidth="2.5" transform="rotate(12 18 4)" />
        {[[-22, -6], [-10, 6], [-16, 0]].map(([a, b], i) => <circle key={i} cx={a} cy={b} r="2.6" fill={INK} />)}
        {[[12, -2], [24, -2], [12, 10], [24, 10]].map(([a, b], i) => <circle key={i} cx={a} cy={b} r="2.6" fill={INK} />)}
      </g>);
    case "sun": return (
      <g transform={t}>
        {Array.from({ length: 12 }, (_, i) => <path key={i} d="M0 -30 L0 -40" stroke="#FF7A3D" strokeWidth="3.5" strokeLinecap="round" transform={`rotate(${i * 30})`} />)}
        <circle r="22" fill="#FFC93C" stroke={INK} strokeWidth="2.5" />
        <path d="M-8 2 q8 8 16 0" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      </g>);
    case "table": return (
      <g transform={t}>
        <circle r="18" fill="#FFC93C" stroke={INK} strokeWidth="2.5" />
        {Array.from({ length: 6 }, (_, i) => <circle key={i} cx="0" cy="-32" r="7" fill={i === 5 ? "#fff" : i % 2 ? "#FF8FB1" : "#6C4CF5"} stroke={INK} strokeWidth="2" transform={`rotate(${i * 60})`} />)}
      </g>);
    case "wave": return (
      <g transform={t} fill="none" strokeWidth="4" strokeLinecap="round">
        <path d="M-34 -14 q8.5 -10 17 0 t17 0 t17 0 t17 0" stroke="#6C4CF5" />
        <path d="M-34 0 q8.5 -10 17 0 t17 0 t17 0 t17 0" stroke="#FF8FB1" />
        <path d="M-34 14 q8.5 -10 17 0 t17 0 t17 0 t17 0" stroke="#FFC93C" />
      </g>);
  }
}
const PRINT_AT: Partial<Record<Shape, [number, number, number]>> = {
  tee: [100, 108, 1.1], boxtee: [100, 112, 1.25], tank: [100, 128, 1], longsleeve: [100, 116, 1.1], polo: [100, 112, 1.1], shirt: [100, 116, 1.2],
  dress: [100, 140, 1.15], hoodie: [100, 118, 1.15], zip: [100, 112, 1.1], cardigan: [100, 112, 0.9], tote: [100, 142, 1.2], skirt: [100, 130, 0.9],
  trousers: [122, 64, 0.35], shorts: [124, 74, 0.35], cap: [100, 98, 0.55], scarf: [85, 160, 0.4],
};

export function MerchArt({ shape, motif, colour, side = "front", className = "" }: { shape: Shape; motif: Motif; colour: string; side?: "front" | "back"; className?: string }) {
  const line = dark(colour) ? "rgba(255,255,255,.55)" : "rgba(22,18,43,.45)";
  const word = dark(colour) ? "#FFC93C" : "#6C4CF5";
  const at = PRINT_AT[shape] ?? [100, 112, 1];
  const frontLogo = !["trousers", "shorts", "skirt", "scarf", "cap", "tote"].includes(shape);
  return (
    <svg className={`merch-art ${className}`} viewBox="0 0 200 220" role="img" aria-label={`${side === "back" ? "Back" : "Front"} view`}>
      <ellipse cx="100" cy="212" rx="62" ry="5" fill="rgba(22,18,43,.08)" />
      <g fill={colour}>
        <path d={BODY[shape]} stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
        <Details s={shape} c={line} />
      </g>
      {side === "front" && frontLogo && <text x="116" y="66" fontSize="9" fontWeight="800" fill={word} fontFamily="var(--display),sans-serif" letterSpacing="-.3">meetra.</text>}
      {side === "front" && (shape === "cap" || shape === "tote") && <Print m={motif} x={at[0]} y={at[1]} k={at[2]} />}
      {side === "front" && shape === "scarf" && <Print m={motif} x={85} y={160} k={0.4} />}
      {side === "back" && <Print m={motif} x={at[0]} y={at[1]} k={at[2]} />}
      {side === "back" && frontLogo && <text x="100" y={at[1] + 58 * at[2]} textAnchor="middle" fontSize="10" fontWeight="800" fill={word} fontFamily="var(--display),sans-serif">come alone · leave together</text>}
    </svg>
  );
}
