// meetra merch, Drop 01. Every piece is drawn in code (components/Merch.tsx), so there are no image files to manage.
export type Shape = "tee" | "boxtee" | "tank" | "longsleeve" | "polo" | "shirt" | "dress" | "trousers" | "skirt" | "shorts" | "hoodie" | "zip" | "cardigan" | "cap" | "tote" | "scarf";
export type Motif = "chai" | "dice" | "sun" | "table" | "wave";
export type Colour = { name: string; hex: string };
export type MerchItem = {
  id: string; code: string; name: string; gender: "women" | "men" | "unisex"; cat: string; shape: Shape; motif: Motif;
  colours: Colour[]; sizes: string[]; fit: string; fabric: string; blurb: string; pairs: string[];
};

const C = {
  bone: { name: "Bone", hex: "#F1E9DA" }, ink: { name: "Ink", hex: "#26213F" }, violet: { name: "Violet", hex: "#6C4CF5" },
  sun: { name: "Sun", hex: "#FFC93C" }, rose: { name: "Rose", hex: "#F7A8BF" }, sage: { name: "Sage", hex: "#B9D3A8" },
  rust: { name: "Rust", hex: "#C8653A" }, sky: { name: "Sky", hex: "#A9D2F2" }, plum: { name: "Plum", hex: "#5B2A4E" },
};
const ALL = ["XS", "S", "M", "L", "XL", "XXL"];
const ONE = ["One size"];

export const MERCH_CATS = ["Tops", "Shirts & dresses", "Bottoms", "Layers", "Accessories"] as const;

export const MERCH: MerchItem[] = [
  { id: "come-alone-baby-tee", code: "W01", name: "Come Alone Baby Tee", gender: "women", cat: "Tops", shape: "tee", motif: "chai",
    colours: [C.bone, C.rose, C.ink], sizes: ALL, fit: "Cropped, close fit", fabric: "Cotton rib jersey",
    blurb: "A cropped baby tee with a tiny meetra. on the chest and a big chai glass circled by a violet orbit on the back. For the first plan you came to alone.", pairs: ["rooftop-wrap-skirt", "show-up-trousers"] },
  { id: "group-chat-box-tee", code: "W02", name: "Group Chat Box Tee", gender: "women", cat: "Tops", shape: "boxtee", motif: "wave",
    colours: [C.ink, C.bone, C.sage], sizes: ALL, fit: "Boxy, dropped shoulder", fabric: "Heavy cotton, 240 gsm",
    blurb: "Boxy and heavy, with three little chat waves on the back. The tee for the morning after the group chat was born.", pairs: ["show-up-trousers", "regulars-cardigan"] },
  { id: "chai-break-tank", code: "W03", name: "Chai Break Rib Tank", gender: "women", cat: "Tops", shape: "tank", motif: "chai",
    colours: [C.plum, C.bone, C.sun], sizes: ALL, fit: "Slim, hip length", fabric: "Stretch cotton rib",
    blurb: "A ribbed tank with a steaming chai glass on the back. Easy on warm Jaipur evenings, easy under a shirt.", pairs: ["night-walk-camp-shirt", "rooftop-wrap-skirt"] },
  { id: "table-starter-longsleeve", code: "W04", name: "Table Starter Longsleeve", gender: "women", cat: "Tops", shape: "longsleeve", motif: "table",
    colours: [C.bone, C.violet], sizes: ALL, fit: "Regular, long sleeve", fabric: "Cotton jersey",
    blurb: "For the person who always breaks the ice. A round table of six on the back, one seat still free.", pairs: ["show-up-trousers"] },
  { id: "host-mode-polo", code: "W05", name: "Host Mode Polo", gender: "women", cat: "Tops", shape: "polo", motif: "sun",
    colours: [C.sage, C.bone, C.ink], sizes: ALL, fit: "Relaxed, short sleeve", fabric: "Cotton piqué",
    blurb: "A soft piqué polo with a rising sun on the back. Smart enough for a café, relaxed enough for a board-game night.", pairs: ["rooftop-wrap-skirt"] },
  { id: "sunday-plans-dress", code: "W06", name: "Sunday Plans Shirt Dress", gender: "women", cat: "Shirts & dresses", shape: "dress", motif: "chai",
    colours: [C.bone, C.sky], sizes: ALL, fit: "Relaxed, knee length", fabric: "Cotton poplin",
    blurb: "A knee-length shirt dress with side pockets and a tie belt. One big chai glass and violet orbit low on the back.", pairs: ["sunrise-trek-cap", "board-games-tote"] },
  { id: "night-walk-camp-shirt", code: "W07", name: "Night Walk Camp Shirt", gender: "women", cat: "Shirts & dresses", shape: "shirt", motif: "wave",
    colours: [C.ink, C.rust], sizes: ALL, fit: "Boxy, short sleeve", fabric: "Viscose crepe",
    blurb: "A flowy camp-collar shirt for city walks after dark. Moonlit waves across the back.", pairs: ["chai-break-tank", "show-up-trousers"] },
  { id: "show-up-trousers", code: "W08", name: "Show-Up Wide Trousers", gender: "women", cat: "Bottoms", shape: "trousers", motif: "sun",
    colours: [C.bone, C.ink, C.rust], sizes: ALL, fit: "High rise, wide leg", fabric: "Cotton twill",
    blurb: "Wide, high-rise trousers that work from lunch to the late table. A tiny sun on the back pocket.", pairs: ["come-alone-baby-tee", "group-chat-box-tee"] },
  { id: "rooftop-wrap-skirt", code: "W09", name: "Rooftop Wrap Skirt", gender: "women", cat: "Bottoms", shape: "skirt", motif: "wave",
    colours: [C.rust, C.sage, C.ink], sizes: ALL, fit: "Midi, wrap tie", fabric: "Linen blend",
    blurb: "A midi wrap skirt that moves when you do. Made for rooftop open mics.", pairs: ["come-alone-baby-tee", "chai-break-tank"] },
  { id: "strangers-to-friends-hoodie", code: "W10", name: "Strangers to Friends Hoodie", gender: "unisex", cat: "Layers", shape: "hoodie", motif: "table",
    colours: [C.violet, C.bone, C.ink], sizes: ALL, fit: "Oversized", fabric: "Brushed fleece, 320 gsm",
    blurb: "The big one. A round table on the back with every seat taken. Front pocket, soft inside, made for winter plans.", pairs: ["show-up-trousers", "run-club-shorts"] },
  { id: "regulars-cardigan", code: "W11", name: "Regulars Cardigan", gender: "women", cat: "Layers", shape: "cardigan", motif: "sun",
    colours: [C.sun, C.bone], sizes: ALL, fit: "Cropped, relaxed", fabric: "Cotton knit",
    blurb: "A cropped knit cardigan for the people who keep coming back. Little sun on the back yoke.", pairs: ["group-chat-box-tee"] },
  { id: "group-chat-tee-men", code: "M01", name: "Group Chat Heavy Tee", gender: "men", cat: "Tops", shape: "boxtee", motif: "wave",
    colours: [C.ink, C.bone, C.sage], sizes: ALL, fit: "Boxy, dropped shoulder", fabric: "Heavy cotton, 240 gsm",
    blurb: "Heavyweight and boxy. Three chat waves across the back, a small meetra. on the chest.", pairs: ["show-up-chinos", "plan-b-zip-jacket"] },
  { id: "pickleball-polo", code: "M02", name: "Pickleball Polo", gender: "men", cat: "Tops", shape: "polo", motif: "sun",
    colours: [C.bone, C.sky, C.ink], sizes: ALL, fit: "Regular", fabric: "Cotton piqué",
    blurb: "Court to café. A clean piqué polo with a sun rising on the back.", pairs: ["run-club-shorts", "show-up-chinos"] },
  { id: "late-table-camp-shirt", code: "M03", name: "Late Table Camp Shirt", gender: "men", cat: "Shirts & dresses", shape: "shirt", motif: "chai",
    colours: [C.rust, C.ink, C.bone], sizes: ALL, fit: "Boxy, short sleeve", fabric: "Cotton poplin",
    blurb: "For the table that stays an hour after the bill. One chai glass and a violet orbit on the back.", pairs: ["show-up-chinos"] },
  { id: "show-up-chinos", code: "M04", name: "Show-Up Chinos", gender: "men", cat: "Bottoms", shape: "trousers", motif: "sun",
    colours: [C.bone, C.ink, C.sage], sizes: ALL, fit: "Relaxed, straight leg", fabric: "Cotton twill",
    blurb: "Straight, relaxed chinos that go with every plan on the calendar.", pairs: ["group-chat-tee-men", "late-table-camp-shirt"] },
  { id: "run-club-shorts", code: "M05", name: "Run Club Shorts", gender: "unisex", cat: "Bottoms", shape: "shorts", motif: "wave",
    colours: [C.ink, C.violet], sizes: ALL, fit: "Above knee, drawstring", fabric: "Quick-dry nylon",
    blurb: "Light, quick-dry shorts for the 6:30 am run club and the chai after it.", pairs: ["pickleball-polo", "strangers-to-friends-hoodie"] },
  { id: "plan-b-zip-jacket", code: "M06", name: "Plan B Zip Jacket", gender: "men", cat: "Layers", shape: "zip", motif: "dice",
    colours: [C.ink, C.sage], sizes: ALL, fit: "Regular, hip length", fabric: "Cotton canvas",
    blurb: "When it rains on the trek, there's always board games. Two dice on the back, full zip front.", pairs: ["group-chat-tee-men"] },
  { id: "sunrise-trek-cap", code: "A01", name: "Sunrise Trek Cap", gender: "unisex", cat: "Accessories", shape: "cap", motif: "sun",
    colours: [C.ink, C.bone, C.violet], sizes: ONE, fit: "Adjustable strap", fabric: "Washed cotton twill",
    blurb: "For 5 am starts. A small sun on the front panel, adjustable strap at the back.", pairs: ["run-club-shorts", "sunday-plans-dress"] },
  { id: "board-games-tote", code: "A02", name: "Board Games Tote", gender: "unisex", cat: "Accessories", shape: "tote", motif: "dice",
    colours: [C.bone, C.ink], sizes: ONE, fit: "38 × 42 cm, long handles", fabric: "12 oz cotton canvas",
    blurb: "Big enough for two board games and a book. Two dice mid-roll on the front.", pairs: ["sunday-plans-dress"] },
  { id: "chai-club-scarf", code: "A03", name: "Chai Club Scarf", gender: "unisex", cat: "Accessories", shape: "scarf", motif: "chai",
    colours: [C.rust, C.violet, C.bone], sizes: ONE, fit: "180 × 30 cm", fabric: "Soft acrylic knit",
    blurb: "A long knit scarf for December chai stops, with a little chai glass at each end.", pairs: ["strangers-to-friends-hoodie"] },
];
export const merchById = (id: string) => MERCH.find((m) => m.id === id);

export const DROP_FAQ: [string, string][] = [
  ["How the drop works", "Pick your colour and size and join the drop. You pay nothing today. When your piece is ready, we message you on WhatsApp with your founding member price and a payment link. Pay, then pick it up at a plan or have it shipped."],
  ["Size guide", "Tops and layers run true to size; boxy and oversized pieces are cut roomy on purpose, so size down for a closer fit. Not sure? Tell us your usual size when we message you and we'll help."],
  ["Delivery & pickup", "Pick up free at any meetra plan in Ahmedabad or Jaipur, or get it shipped anywhere in India. Shipping costs are shown before you pay."],
  ["Returns & exchanges", "Exchange the size within 7 days if it's unworn with tags on. Pieces from the first run are made in small batches, so returns are for size or faults only."],
  ["Care", "Wash cold, inside out, with similar colours. Dry in the shade. Don't iron directly on the print."],
];
