/* =========================================================
   MEETUP DATA
   ---------------------------------------------------------
   You don't add 100 events by hand. You add a TEMPLATE once
   ("Introverts' Dinner, every Mon & Thu at 8 pm") and the site
   creates every date for the next 4 weeks automatically.

   days: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
   every: 2  -> only every second week (optional)
   once: 12  -> a one-off, 12 days from today (instead of days)
   image: "assets/img/dinner.jpg" -> use a real photo instead
          of the illustrated poster (optional)
   ========================================================= */

window.CATEGORIES = [
  { id: "all",    label: "All plans",     icon: "✦" },
  { id: "food",   label: "Food & cafés",  icon: "🍽️" },
  { id: "sports", label: "Sports",        icon: "🏸" },
  { id: "games",  label: "Games & talk",  icon: "🎲" },
  { id: "night",  label: "Nightlife",     icon: "🌙" },
  { id: "outing", label: "City outings",  icon: "🗺️" },
  { id: "art",    label: "Art",           icon: "🎨" },
  { id: "film",   label: "Film",          icon: "🎬" },
  { id: "trips",  label: "Trips",         icon: "🏕️" }
];

/* Poster colour sets: [background, accent] */
window.PALETTES = [
  ["#FFC93C", "#FF4F87"], ["#FF8FB1", "#FFE14D"], ["#6C4CF5", "#FFC93C"],
  ["#3DDCA7", "#16122B"], ["#7CC7FF", "#FF4F87"], ["#FF7A3D", "#FFE9C7"],
  ["#16122B", "#FF4F87"], ["#C8B6FF", "#6C4CF5"], ["#C6F36B", "#6C4CF5"],
  ["#FF6B6B", "#FFF1D6"]
];

/* ---------- HOSTS (replace with your real hosts) ---------- */
window.HOSTS = {
  // Jaipur
  aarav:  { name: "Aarav",  city: "jaipur", color: "#FF4F87", bio: "Runs icebreaker games for a living. Has never let a table go quiet." },
  meera:  { name: "Meera",  city: "jaipur", color: "#6C4CF5", bio: "Born in the walled city. Knows which kachori stall opens first." },
  kabir:  { name: "Kabir",  city: "jaipur", color: "#FF7A3D", bio: "Trekker, early riser, carries an extra flask of chai for everyone." },
  ishita: { name: "Ishita", city: "jaipur", color: "#1BB78A", bio: "Owns 60+ board games and will teach you every single one." },
  rohan:  { name: "Rohan",  city: "jaipur", color: "#2E8BFF", bio: "Weekend athlete. Believes every sport is better with dinner after." },
  tanya:  { name: "Tanya",  city: "jaipur", color: "#C2410C", bio: "Potter and painter. Her rule: no one leaves with clean hands." },
  // Ahmedabad
  dhruv:  { name: "Dhruv",  city: "ahmedabad", color: "#6C4CF5", bio: "Quizmaster and part-time stand-up. Loud in the best way." },
  nisha:  { name: "Nisha",  city: "ahmedabad", color: "#FF4F87", bio: "Pol-walk regular who knows the story behind every carved door." },
  parth:  { name: "Parth",  city: "ahmedabad", color: "#1BB78A", bio: "Riverfront runner, cyclist and the reason you'll wake up at 6." },
  riya:   { name: "Riya",   city: "ahmedabad", color: "#FF7A3D", bio: "Café-hopper and book-club founder. Always has a recommendation." },
  karan:  { name: "Karan",  city: "ahmedabad", color: "#2E8BFF", bio: "Game-night host who takes Mafia far too seriously." },
  anvi:   { name: "Anvi",   city: "ahmedabad", color: "#C2410C", bio: "Textile designer who'll teach you block printing from scratch." },
  team:   { name: "the meetra team", city: "all", color: "#16122B", bio: "Our in-house crew runs the bigger nights and the trips." }
};

/* ---------- MEETUP TEMPLATES ---------- */
window.TEMPLATES = [
  { key: "introverts-dinner", title: "Introverts' Dinner", cat: "food", days: [1, 4], time: "8 pm", end: "10 pm",
    price: 99, priceType: "reservation", seats: 14, emoji: "🍝", pal: 0, pattern: "dots",
    blurb: "Come solo for a dinner where it's fine to listen for a while before you speak.",
    steps: ["Your host starts with an easy table game", "Order your own food, settle into the conversation", "Swap numbers only if you want to"],
    cities: { jaipur: { area: "C-Scheme", hosts: ["aarav"] }, ahmedabad: { area: "Prahlad Nagar", hosts: ["riya"] } } },

  { key: "board-games-chai", title: "Board Games & Chai", cat: "games", days: [3, 6], time: "7 pm", end: "10 pm",
    price: 99, priceType: "reservation", seats: 16, emoji: "🎲", pal: 7, pattern: "grid",
    blurb: "Codenames, Catan and a stack of party games. Never played? Your host teaches every one.",
    steps: ["Quick-fire warm-up game for the whole room", "Split into tables, rotate every round", "Final showdown, winners pick the next chai"],
    cities: { jaipur: { area: "Bapu Nagar", hosts: ["ishita"] }, ahmedabad: { area: "Navrangpura", hosts: ["karan"] } } },

  { key: "mafia-night", title: "Mafia Night", cat: "games", days: [5], time: "8 pm", end: "11 pm",
    price: 299, priceType: "per person", seats: 20, emoji: "🕵️", pal: 6, pattern: "rings",
    blurb: "Lies, alliances and loud accusations. The fastest way to learn 20 new names.",
    steps: ["Name game so everyone knows who to accuse", "Three rounds of Mafia with a live narrator", "Snacks and the post-game blame session"],
    cities: { jaipur: { area: "Tonk Road", hosts: ["aarav", "ishita"] }, ahmedabad: { area: "Bodakdev", hosts: ["karan", "dhruv"] } } },

  { key: "pickleball-dinner", title: "Pickleball + Dinner", cat: "sports", days: [2, 0], time: "6 pm", end: "9 pm",
    price: 99, priceType: "reservation", seats: 12, emoji: "🏓", pal: 3, pattern: "stripes",
    blurb: "Nobody needs to know how to play. An hour on court, then dinner nearby. Paddles provided.",
    steps: ["5-minute rules crash course", "Rotating doubles so you play with everyone", "Walk over to dinner together"],
    cities: { jaipur: { area: "Malviya Nagar", hosts: ["rohan"] }, ahmedabad: { area: "SG Highway", hosts: ["parth"] } } },

  { key: "run-club", title: "Run Club", cat: "sports", days: [0, 3], time: "6:30 am", end: "8 am",
    price: 0, priceType: "free", seats: 40, emoji: "🏃", pal: 4, pattern: "waves",
    blurb: "An easy 5 km, every pace welcome, nobody left behind. Breakfast after for whoever's hungry.",
    steps: ["Warm-up and pace groups", "5 km at conversation pace", "Coffee and breakfast together"],
    cities: { jaipur: { area: "Jal Mahal", hosts: ["rohan"], title: "Run Club · Jal Mahal Loop" },
              ahmedabad: { area: "Sabarmati Riverfront", hosts: ["parth"], title: "Run Club · Riverfront 5K" } } },

  { key: "home-cinema", title: "Home Cinema Night", cat: "film", days: [2], time: "8 pm", end: "11 pm",
    price: 99, priceType: "reservation", seats: 12, emoji: "🍿", pal: 1, pattern: "sun",
    themes: ["Cult Classics", "Rom-Com Night", "2000s Bollywood", "Anime Night"],
    blurb: "Projector, beanbags, popcorn and a pre-movie quiz. Stay back for the post-movie debate.",
    steps: ["Popcorn and a 10-minute film quiz", "The screening — phones away", "Hot takes and ratings after"],
    cities: { jaipur: { area: "Raja Park", hosts: ["team"] }, ahmedabad: { area: "Satellite", hosts: ["team"] } } },

  { key: "book-club-lunch", title: "Book Club Lunch", cat: "food", days: [6], time: "1 pm", end: "3 pm",
    price: 99, priceType: "reservation", seats: 12, emoji: "📚", pal: 8, pattern: "dots",
    blurb: "Bring any book you loved lately and pitch it in two minutes. No homework, just lunch and good recs.",
    steps: ["Two-minute book pitches around the table", "Lunch and tangents", "Swap shelf: leave a book, take a book"],
    cities: { jaipur: { area: "MI Road", hosts: ["ishita"] }, ahmedabad: { area: "Vastrapur", hosts: ["riya"] } } },

  { key: "open-mic", title: "Rooftop Open Mic", cat: "night", days: [5], time: "9 pm", end: "12 am",
    price: 299, priceType: "per person", seats: 40, emoji: "🎤", pal: 2, pattern: "sun",
    blurb: "Poetry, stand-up, songs — sign up to perform or just come to cheer. One drink included.",
    steps: ["Sign-up sheet opens at 8:45", "Three sets of 5-minute acts", "Open floor and music to close"],
    cities: { jaipur: { area: "Vaishali Nagar", hosts: ["team"] }, ahmedabad: { area: "Sindhu Bhavan Road", hosts: ["dhruv"] } } },

  { key: "craft-workshop", title: "Craft Workshop", cat: "art", days: [0], time: "11 am", end: "1:30 pm",
    price: 799, priceType: "per person", seats: 10, emoji: "🏺", pal: 4, pattern: "rings",
    blurb: "Learn a local craft from an artisan and take home what you make. All materials included.",
    steps: ["Meet the artisan, see how it's done", "Make your own piece", "Chai while it dries"],
    cities: { jaipur: { area: "Sanganer", hosts: ["tanya"], title: "Blue Pottery Workshop", emoji: "🏺" },
              ahmedabad: { area: "Law Garden", hosts: ["anvi"], title: "Block Print Workshop", emoji: "🖌️" } } },

  { key: "sketch-walk", title: "Sketch Walk", cat: "art", days: [6], time: "5 pm", end: "7 pm",
    price: 99, priceType: "reservation", seats: 14, emoji: "✏️", pal: 9, pattern: "grid",
    blurb: "Sketch the city together. Total beginners welcome — bring a pencil, we bring the vibe.",
    steps: ["5-minute drawing warm-up", "Walk and sketch three spots", "Show-and-tell over snacks"],
    cities: { jaipur: { area: "Jawahar Kala Kendra", hosts: ["tanya"] }, ahmedabad: { area: "Kankaria", hosts: ["anvi"] } } },

  { key: "food-walk", title: "Old City Food Walk", cat: "outing", days: [6], time: "4 pm", end: "7 pm",
    price: 499, priceType: "per person", seats: 10, emoji: "🥟", pal: 5, pattern: "stripes",
    blurb: "Eight stops through the old bazaars with a local who's been eating here since childhood. Tastings included.",
    steps: ["Meet at the gate, quick intros", "Eight tasting stops with stories", "Dessert finale"],
    cities: { jaipur: { area: "Johari Bazaar", hosts: ["meera"], title: "Pink City Food Walk" },
              ahmedabad: { area: "Manek Chowk", hosts: ["nisha"], title: "Pol Heritage & Food Walk", time: "7 am", end: "10 am" } } },

  { key: "sunrise", title: "Sunrise Outing", cat: "outing", days: [0], time: "6 am", end: "9 am",
    price: 99, priceType: "reservation", seats: 16, emoji: "🌄", pal: 0, pattern: "sun",
    blurb: "Up before the city, chai at the top while the lights switch off, breakfast on the way back.",
    steps: ["Meet at the start point", "Easy climb or ride with your group", "Chai, photos and breakfast"],
    cities: { jaipur: { area: "Nahargarh", hosts: ["kabir"], title: "Sunrise Trek to Nahargarh" },
              ahmedabad: { area: "Riverfront", hosts: ["parth"], title: "Sunrise Cycle Ride", emoji: "🚲" } } },

  { key: "quiz-night", title: "Quiz Night", cat: "games", days: [4], time: "8 pm", end: "10:30 pm",
    price: 199, priceType: "per person", seats: 30, emoji: "🧠", pal: 2, pattern: "dots",
    themes: ["Bollywood", "Cricket", "90s Kids", "Travel & Places"],
    blurb: "Teams of strangers, six rounds, one trophy that's genuinely ugly. You'll want it anyway.",
    steps: ["Get placed in a random team", "Six rounds with picture and music questions", "Trophy and bragging rights"],
    cities: { jaipur: { area: "C-Scheme", hosts: ["aarav"] }, ahmedabad: { area: "CG Road", hosts: ["dhruv"] } } },

  { key: "deep-talks", title: "2 AM Deep Talks", cat: "games", days: [3], time: "9 pm", end: "11:30 pm",
    price: 199, priceType: "per person", seats: 12, emoji: "🌙", pal: 6, pattern: "waves",
    blurb: "Question cards that skip small talk entirely. Leave with at least one conversation you'll remember.",
    steps: ["Light questions to warm up", "Small circles, deeper cards", "One last question for the whole room"],
    cities: { jaipur: { area: "Civil Lines", hosts: ["ishita"] }, ahmedabad: { area: "Thaltej", hosts: ["riya"] } } },

  { key: "karaoke", title: "Karaoke Night", cat: "night", days: [6], time: "9 pm", end: "12 am",
    price: 399, priceType: "per person", seats: 25, emoji: "🎶", pal: 1, pattern: "rings",
    blurb: "Bad singing, good company. Duets with strangers are strongly encouraged.",
    steps: ["Pick a song, any song", "Duet roulette", "Group anthem to close the night"],
    cities: { jaipur: { area: "Mansarovar", hosts: ["team"] }, ahmedabad: { area: "Bodakdev", hosts: ["team"] } } },

  { key: "bonfire", title: "Bonfire Houseparty", cat: "night", days: [6], every: 2, time: "8 pm", end: "1 am",
    price: 999, priceType: "per person", seats: 24, emoji: "🔥", pal: 6, pattern: "sun",
    blurb: "Music, bonfire, dinner and games under the winter sky. Pickup point shared after confirmation.",
    steps: ["Welcome drinks and name games", "Dinner around the fire", "Music, dancing, stars"],
    cities: { jaipur: { area: "Jagatpura", hosts: ["team"] }, ahmedabad: { area: "Shela", hosts: ["team"] } } },

  { key: "life-lunch", title: "Figuring Out Life Lunch", cat: "food", days: [3], time: "1 pm", end: "3 pm",
    price: 499, priceType: "per person", seats: 8, emoji: "🥗", pal: 8, pattern: "grid",
    blurb: "A small table for career pivots, big moves and quarter-life questions. Lunch included.",
    steps: ["Everyone shares one thing they're figuring out", "Honest advice over lunch", "Leave with one next step"],
    cities: { jaipur: { area: "Malviya Nagar", hosts: ["meera"] }, ahmedabad: { area: "Prahlad Nagar", hosts: ["riya"] } } },

  { key: "badminton", title: "Morning Badminton Doubles", cat: "sports", days: [4], time: "7 am", end: "8:30 am",
    price: 199, priceType: "per person", seats: 12, emoji: "🏸", pal: 3, pattern: "stripes",
    blurb: "Mixed-level doubles with court and shuttles sorted. Breakfast poha after.",
    steps: ["Warm-up rally", "Rotating doubles", "Poha and chai"],
    cities: { jaipur: { area: "Vaishali Nagar", hosts: ["rohan"] }, ahmedabad: { area: "Satellite", hosts: ["parth"] } } },

  { key: "women-brunch", title: "Women-only Sunday Brunch", cat: "food", days: [0], time: "11 am", end: "1 pm",
    price: 99, priceType: "reservation", seats: 12, emoji: "🥞", pal: 1, pattern: "dots", tags: ["Women only"],
    blurb: "A relaxed brunch table just for women — new to the city or just new to the group.",
    steps: ["Coffee and quick intros", "Brunch and long conversations", "Optional café-hop after"],
    cities: { jaipur: { area: "C-Scheme", hosts: ["meera"] }, ahmedabad: { area: "Vastrapur", hosts: ["nisha"] } } },

  { key: "salsa", title: "Salsa for Beginners", cat: "night", days: [4], time: "8 pm", end: "10 pm",
    price: 299, priceType: "per person", seats: 20, emoji: "💃", pal: 9, pattern: "waves",
    blurb: "Two left feet welcome. A friendly instructor, partner rotations and zero judgement.",
    steps: ["Basic steps, no partner needed", "Partner rotations", "Social dance to finish"],
    cities: { jaipur: { area: "Raja Park", hosts: ["tanya"] }, ahmedabad: { area: "Navrangpura", hosts: ["anvi"] } } },

  { key: "photo-walk", title: "Golden Hour Photo Walk", cat: "outing", days: [0], time: "4:30 pm", end: "6:30 pm",
    price: 99, priceType: "reservation", seats: 15, emoji: "📸", pal: 5, pattern: "grid",
    blurb: "Phone or camera, doesn't matter. Learn three tricks and shoot the city in its best light.",
    steps: ["Three quick photo tricks", "Walk and shoot", "Pick everyone's best shot"],
    cities: { jaipur: { area: "Hawa Mahal", hosts: ["kabir"] }, ahmedabad: { area: "Adalaj", hosts: ["nisha"] } } },

  { key: "night-sky-trip", title: "Weekend Trip", cat: "trips", once: 15, time: "2 pm", end: "next day, 2 pm",
    price: 5000, priceType: "estimate", seats: 16, emoji: "🏕️", pal: 7, pattern: "sun",
    blurb: "One night away with a small group: travel, stay, dinner and a fire. Final inclusions shared soon.",
    steps: ["Leave together from the city", "Camp, dinner and the night sky", "Slow breakfast, back by afternoon"],
    cities: { jaipur: { area: "Sariska", hosts: ["kabir"], title: "Stargazing in Sariska", emoji: "🔭" },
              ahmedabad: { area: "Polo Forest", hosts: ["parth"], title: "Polo Forest Camp-out", emoji: "🏕️" } } }
];

/* ---------- SAMPLE REVIEWS (replace with real ones) ---------- */
window.REVIEWS = [
  { name: "Riya",    plan: "🍝 introverts' dinner", head: "Walked in alone, left with a group chat", hl: "group chat",
    text: "I genuinely didn't know a single person. By dessert we were planning the next weekend together." },
  { name: "Arjun",   plan: "🌄 sunrise trek", head: "Six years here and I'd never seen this", hl: "never",
    text: "Lived in the city for years and never watched the sunrise from the top. The people made it even better." },
  { name: "Sana",    plan: "🎲 board games & chai", head: "Nobody touched their phone", hl: "Nobody",
    text: "The host made it so easy to jump in. Three hours went in what felt like forty minutes." },
  { name: "Dev",     plan: "🏓 pickleball + dinner", head: "None of us could play. Didn't matter", hl: "Didn't matter",
    text: "We were all terrible and it was the best part. Dinner after turned into a two-hour conversation." },
  { name: "Kavya",   plan: "🥟 old city food walk", head: "Ate too much, made three friends", hl: "three friends",
    text: "Every stop had a story. I've already been back twice with the people I met there." },
  { name: "Yash",    plan: "🕵️ mafia night", head: "Felt like a school reunion", hl: "reunion",
    text: "Except I'd met these people two hours earlier. Loud, chaotic, perfect." },
  { name: "Mitali",  plan: "🎤 rooftop open mic", head: "Performed for the first time ever", hl: "first time",
    text: "Read a poem I'd never shown anyone. The room was the kindest audience I could ask for." },
  { name: "Harsh",   plan: "🧠 quiz night", head: "Weeknights just got better", hl: "better",
    text: "Random team, instant friends. We lost badly and still celebrated." },
  { name: "Ananya",  plan: "🥞 women-only brunch", head: "Exactly what I needed after moving", hl: "after moving",
    text: "New city, no friends yet. This table changed that in one morning." }
];
