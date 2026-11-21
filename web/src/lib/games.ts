// Games we bring to the table. Card decks (pull a card, pass the phone) and
// party games with their own little engines in components/pages/GamePage.tsx.
// All content is meetra's own. Edit freely: add cards, rename decks.

export type Card = { k: string; q: string; note?: string };
export type Deck = {
  id: string; name: string; for: string; color: string; ink?: string; emoji: string;
  blurb: string; kinds: Record<string, { label: string; dot: string }>; cards: Card[];
};
export type Party = { id: string; name: string; line: string; players: string; icon: string; min: number; color: string; how: string[] };

const K = {
  warm: { label: "Warm-up", dot: "#FFC93C" },
  city: { label: "New here", dot: "#6C4CF5" },
  play: { label: "Play", dot: "#3DDCA7" },
  deep: { label: "Deep-ish", dot: "#16122B" },
  wild: { label: "Wild card", dot: "#FF4F87" },
};

const c = (k: string, list: string[], note?: string): Card[] => list.map((q) => ({ k, q, note }));

export const DECKS: Deck[] = [
  {
    id: "first-table", name: "First Table", for: "Dinners, first meetups, tables of strangers", color: "#FFD6E3", emoji: "🍽️",
    blurb: "The one we open every dinner with. Easy openers, city talk, a little play and a little depth.",
    kinds: { warm: K.warm, city: K.city, play: K.play, deep: K.deep, wild: K.wild },
    cards: [
      ...c("warm", [
        "What did you almost cancel tonight for?", "What's your go-to chai or coffee order, and why is it correct?",
        "Which app do you open first in the morning?", "What's the last thing you laughed at way too hard?",
        "What's your comfort food after a bad day?", "What's a small thing that instantly makes your day better?",
        "What would your friends say you're weirdly good at?", "Best thing you've eaten this month?",
      ]),
      ...c("city", [
        "Where do you take someone who's new to the city?", "Which street food stall would you defend with your life?",
        "What's one thing about this city nobody warned you about?", "Your favourite place to watch the sunset here?",
        "Which neighbourhood would you live in if rent didn't exist?", "What do you miss most from your hometown?",
        "One hidden spot you'd only tell your closest friends about?",
      ]),
      ...c("play", [
        "Everyone: rate your week out of 10 using only a hand gesture.", "Guess the job of the person on your left. They reveal after.",
        "Hum a song. The table guesses it in 3 tries.", "Two people swap one fun fact. Everyone guesses whose it was.",
        "Describe your day using only movie titles.", "Point at the person most likely to adopt three dogs.",
      ]),
      ...c("deep", [
        "What's something you changed your mind about recently?", "Who shaped you most without knowing it?",
        "What does a good friendship look like to you now?", "What would you do with a year off and enough money?",
        "What are you quietly proud of this year?", "What's a fear you've grown out of?",
      ]),
      ...c("wild", [
        "Speed round: everyone answers the next card in one word.", "The person who answers next picks who goes after them.",
        "Swap seats with someone you haven't talked to yet.", "Ask the table any question. Everyone must answer.",
      ], "Play it whenever."),
    ],
  },
  {
    id: "pink-city", name: "Pink City × Amdavad", for: "Desi dinners, chai stops, night drives", color: "#FFD7B0", emoji: "🪔",
    blurb: "Kachori debates, garba stories, family WhatsApp drama. For tables that speak fluent desi.",
    kinds: { warm: K.warm, city: { label: "Desi life", dot: "#FF7A3D" }, play: K.play, wild: K.wild },
    cards: [
      ...c("warm", [
        "Pyaaz kachori or khaman? Defend your answer.", "What's the most dramatic message in your family WhatsApp group?",
        "Which relative asks the most questions at weddings?", "What's your Sunday breakfast at home?",
        "Garba night or a quiet chai on the terrace?", "What's your 'mummy is calling' excuse to leave somewhere?",
      ]),
      ...c("city", [
        "Best place for late-night maggi or chai in your city?", "Amer Fort or Adalaj stepwell, which one would you show a friend?",
        "What's the most desi thing you still do even though you'd deny it?", "Your best Navratri or Diwali memory?",
        "Which wedding song makes you dance no matter what?", "What did your parents never let you do as a kid?",
        "Your go-to order at a thali place?",
      ]),
      ...c("play", [
        "Do your best impression of a shopkeeper bargaining. Table scores you out of 10.", "Name 5 Bollywood songs with the word 'dil' in 20 seconds.",
        "Explain your job like you're telling your nani.", "Everyone: the most overused phrase in your family.",
        "Mimic your parent answering a phone call.", "Sing one line of an old Hindi song. Next person continues.",
      ]),
      ...c("wild", [
        "Antakshari round! Start with the last letter of the last song sung.", "Whoever got the latest wedding invite answers the next card.",
        "Everyone shares one word of local slang. Table votes the best.",
      ], "Play it whenever."),
    ],
  },
  {
    id: "house-party", name: "House Party", for: "House parties, birthdays, rooftop nights", color: "#DDEBB8", emoji: "🎈",
    blurb: "Louder cards for bigger rooms. Dares you can actually do, stories you'll retell tomorrow.",
    kinds: { warm: K.warm, play: K.play, wild: K.wild },
    cards: [
      ...c("warm", [
        "Most chaotic party you've ever been to?", "What's your signature move on the dance floor?",
        "What's your karaoke song, no hesitation?", "The worst gift you've ever received?",
        "Biggest 'it seemed like a good idea at the time' story?", "What song would play when you walk into a room?",
        "Your most used emoji and what it says about you?",
      ]),
      ...c("play", [
        "Show the table the 5th photo in your gallery. Explain it.", "Speak only in questions until your next turn.",
        "Give a 20-second toast to the person on your right.", "Do your best runway walk to the kitchen and back.",
        "Everyone points at who'd survive longest in a zombie film.", "Read your last sent text in a dramatic voice.",
        "Pick a song. Everyone dances for 15 seconds.", "Teach the table a move. Everyone has to copy.",
        "Narrate what the person opposite is doing like a cricket commentator.",
      ]),
      ...c("wild", [
        "Group photo! Everyone does their worst pose.", "Swap seats clockwise. Now.", "Next person to laugh answers the next two cards.",
        "Make up a handshake with the person next to you.",
      ], "Play it whenever."),
    ],
  },
  {
    id: "deep-end", name: "Deep End", for: "Late nights, small tables, second meetups", color: "#C9E4EC", emoji: "🌙",
    blurb: "Slower questions for when the plates are cleared and nobody wants to leave yet.",
    kinds: { warm: K.warm, deep: K.deep, wild: K.wild },
    cards: [
      ...c("warm", [
        "What's a song that takes you straight back to a moment?", "Which year of your life would you replay?",
        "What does a perfect slow Sunday look like?", "Who do you text first with good news?",
      ]),
      ...c("deep", [
        "What's something you wish more people asked you about?", "When did you last feel completely yourself?",
        "What's a belief you inherited and later let go of?", "What do you need more of right now?",
        "What's the kindest thing a stranger has done for you?", "What would younger you be surprised by today?",
        "What's a risk you're glad you took?", "Where do you feel most at home, and is it a place?",
        "What's hard for you that looks easy from outside?", "What are you looking forward to this year?",
        "What advice would you give someone moving to a new city alone?",
      ]),
      ...c("wild", ["Everyone shares one thing they appreciate about tonight.", "Pass. The next person answers your card instead."], "Play it whenever."),
    ],
  },
  {
    id: "this-or-that", name: "This or That", for: "Openers, queues, quick warm-ups", color: "#E2D9FF", emoji: "⚡",
    blurb: "Two options, three seconds. Pick a side and defend it if you're in the minority.",
    kinds: { play: { label: "Pick one", dot: "#6C4CF5" } },
    cards: c("play", [
      "Sunrise trek or midnight drive?", "Pani puri or pav bhaji?", "Mountains or beaches?", "Plan everything or wing it?",
      "Call or voice note?", "Early bird or night owl?", "Books or podcasts?", "Chai or coffee?", "Window seat or aisle?",
      "Dance floor or deep chat in the corner?", "Rain or winter?", "Dogs or cats?", "Old Bollywood or new?",
      "Home-cooked or street food?", "Text back instantly or in three days?", "Board games or video games?",
      "Road trip or flight?", "Big group or table of four?", "Sweet or spicy?", "Rooftop or garden?",
    ]),
  },
];

export const PARTY: Party[] = [
  { id: "speed-friending", name: "Speed Friending", line: "Everyone meets everyone.", players: "4+ players", icon: "🔄", min: 4, color: "#FFE9A8",
    how: ["Pair up. You get 2 minutes and a prompt.", "When the timer rings, the app shows who moves next.", "Keep going until everyone has met everyone."] },
  { id: "undercover", name: "Undercover", line: "One of you has a different word.", players: "4+ players", icon: "🕵️", min: 4, color: "#E2D9FF",
    how: ["Pass the phone. Each person peeks at their secret word, then hides it.", "One person has a word that's close but different.", "Go round: everyone says ONE word about their word.", "Vote out who sounds off. The undercover wins if they reach the last three."] },
  { id: "mafia", name: "Mafia", line: "Close your eyes, Pink City.", players: "5+ players", icon: "🌒", min: 5, color: "#16122B",
    how: ["The app secretly deals roles. Pass the phone so each person sees theirs.", "One person narrates using the script on screen.", "At night the mafia picks someone. The doctor saves one. The detective checks one.", "By day everyone debates and votes. Town wins when the mafia is out."] },
  { id: "heads-up", name: "Heads Up", line: "Phone on your forehead. Friends do the rest.", players: "2+ players", icon: "🤳", min: 2, color: "#C9F5E4",
    how: ["Pick a category. Hold the phone to your forehead, screen facing out.", "Friends act, describe or hum. You guess.", "Tap Got it or Pass. 60 seconds per round."] },
  { id: "hot-seat", name: "Hot Seat", line: "Sixty seconds. No 'umm'.", players: "2+ players", icon: "🔥", min: 2, color: "#FFD6E3",
    how: ["One person takes the hot seat.", "The table fires questions from the screen for 60 seconds.", "Answer fast. Every 'umm' costs a point."] },
  { id: "would-you-rather", name: "Would You Rather", line: "Pick a side. The minority defends.", players: "3+ players", icon: "⚖️", min: 3, color: "#DDEBB8",
    how: ["Read both options out loud.", "On 3, everyone points left or right.", "The smaller side has 30 seconds to convince the others."] },
  { id: "emoji-charades", name: "Emoji Charades", line: "Read the emojis. Shout the answer.", players: "2+ players", icon: "🎬", min: 2, color: "#FFD7B0",
    how: ["Show the screen to the table.", "First to shout the film or song gets the point.", "Tap reveal if nobody gets it in 20 seconds."] },
  { id: "two-truths", name: "Two Truths & a Lie", line: "Spot the lie.", players: "2+ players", icon: "🤥", min: 2, color: "#C9E4EC",
    how: ["The app picks whose turn it is.", "They say two true things and one lie.", "Everyone votes on the lie. Fool the table for a point."] },
  { id: "secret-vote", name: "Secret Vote", line: "Nobody sees who you picked.", players: "3+ players", icon: "🗳️", min: 3, color: "#FFE9A8",
    how: ["A 'most likely to' question appears.", "Pass the phone. Each person taps a name in secret.", "Reveal the results together. No arguing (okay, a little)."] },
  { id: "spin", name: "Spin the Bottle", line: "The safe-for-everyone kind.", players: "2+ players", icon: "🍾", min: 2, color: "#E2D9FF",
    how: ["Tap spin. The bottle picks someone.", "They do the friendly dare or answer the question.", "Skipping is always allowed."] },
  { id: "antakshari", name: "Antakshari", line: "Sing from the last letter.", players: "Teams", icon: "🎤", min: 2, color: "#FFD6E3",
    how: ["Split into two teams.", "The app gives a starting letter and a 30-second timer.", "Sing a song starting with that letter. Next team starts from your last letter."] },
  { id: "story-chain", name: "Story Chain", line: "One line each. Nobody sees the whole thing.", players: "3+ players", icon: "📜", min: 3, color: "#DDEBB8",
    how: ["The app starts a story.", "Each person only sees the last line, then adds one of their own.", "At the end, read the whole thing out loud."] },
];

// ---------- content for the party engines ----------
export const UNDERCOVER_PAIRS: [string, string][] = [
  ["Chai", "Coffee"], ["Samosa", "Kachori"], ["Garba", "Bhangra"], ["Jaipur", "Udaipur"], ["Auto", "Cab"], ["Lassi", "Chaas"],
  ["Diwali", "Holi"], ["Cricket", "Football"], ["Instagram", "Snapchat"], ["Wedding", "Engagement"], ["Mango", "Papaya"],
  ["Pizza", "Burger"], ["Beach", "Pool"], ["Netflix", "YouTube"], ["Rickshaw", "Scooter"], ["Paneer", "Tofu"], ["Mehendi", "Haldi"],
  ["Gym", "Yoga"], ["Kite", "Balloon"], ["Library", "Bookstore"], ["Thali", "Buffet"], ["Train", "Bus"], ["Dosa", "Uttapam"],
];

export const HEADS_UP: Record<string, string[]> = {
  "Bollywood 🎬": ["Sholay", "DDLJ", "3 Idiots", "Lagaan", "Zindagi Na Milegi Dobara", "Queen", "Dangal", "Jab We Met", "Andhadhun", "Gully Boy", "Yeh Jawaani Hai Deewani", "Kal Ho Naa Ho", "Munna Bhai MBBS", "Chak De India", "Barfi", "Wake Up Sid", "Dil Chahta Hai", "Hera Pheri", "Taare Zameen Par", "Rang De Basanti"],
  "Desi food 🍛": ["Pani puri", "Dal baati", "Dhokla", "Pyaaz kachori", "Biryani", "Chole bhature", "Ghewar", "Thepla", "Fafda", "Masala dosa", "Rajma chawal", "Pav bhaji", "Jalebi", "Momos", "Khandvi", "Ker sangri", "Vada pav", "Rasgulla"],
  "Act it out 🎭": ["Brushing teeth", "Riding a camel", "Bargaining at a market", "Taking a selfie", "Flying a kite", "Doing garba", "Missing the bus", "Cooking rotis", "Losing the TV remote", "Stuck in traffic", "Wedding dance", "Getting caught napping"],
  "Things in a city 🏙️": ["Traffic signal", "Auto stand", "Chai tapri", "Metro", "Rooftop café", "Old fort", "Street dog", "Flyover", "Mall", "Night market", "Temple bell", "Paan shop"],
};

export const HOT_SEAT = [
  "Last thing you googled?", "Best holiday ever?", "Who's your celebrity crush?", "Your most-played song?", "Dream job as a kid?",
  "Weirdest food you love?", "Biggest pet peeve?", "Favourite word?", "Your hidden talent?", "Something you'd never eat?",
  "Morning person or night person?", "First concert you went to?", "What would you name a boat?", "Your useless superpower?",
  "Last thing that made you cry?", "Best advice you've received?", "What's in your bag right now?", "Most used app?",
  "Favourite festival?", "Cats or dogs, and why are you wrong?", "Your ideal Sunday?", "Most embarrassing ringtone you've had?",
];

export const WYR: [string, string][] = [
  ["Only eat street food forever", "Only eat home food forever"], ["Live without music", "Live without movies"],
  ["Always be 10 minutes late", "Always be 30 minutes early"], ["Speak every language", "Play every instrument"],
  ["Have a rewind button", "Have a pause button"], ["Be famous on Instagram", "Be rich and unknown"],
  ["Never use your phone again", "Never use your laptop again"], ["Live in the mountains", "Live by the sea"],
  ["Know how you'll die", "Know when you'll die"], ["Have no AC in summer", "No heater in winter"],
  ["Sing every word you say", "Dance everywhere you walk"], ["Lose your phone", "Lose your wallet"],
  ["Be the funniest person at the table", "Be the smartest"], ["Only text", "Only call"],
  ["Travel the world alone", "Never leave your city with friends"], ["Give up chai", "Give up sweets"],
];

export const EMOJI_CLUES: [string, string][] = [
  ["🦁👑", "The Lion King"], ["🚢🧊💔", "Titanic"], ["👨‍🎓👨‍🎓👨‍🎓", "3 Idiots"], ["🏏🇮🇳🏆", "Lagaan"], ["🤼‍♀️👧👧🥇", "Dangal"],
  ["🚂💃🌧️", "Chaiyya Chaiyya"], ["🕷️👨", "Spider-Man"], ["❄️👸⛄", "Frozen"], ["🚗🇪🇸👬👬", "Zindagi Na Milegi Dobara"],
  ["👰✈️🇫🇷", "Queen"], ["🦖🏝️", "Jurassic Park"], ["🧙‍♂️💍🌋", "The Lord of the Rings"], ["🏑👩‍👩‍👧‍👧🇮🇳", "Chak De India"],
  ["🧑‍🚀🌌⏳", "Interstellar"], ["🐭👨‍🍳", "Ratatouille"], ["🎤🛺🔥", "Gully Boy"], ["👻🏠😂", "Bhool Bhulaiyaa"], ["🦈🌊", "Jaws"],
];

export const VOTE_Q = [
  "Most likely to become famous?", "Most likely to cry at a movie?", "Most likely to get lost on the way here?",
  "Most likely to start a business?", "Most likely to be late to their own wedding?", "Most likely to adopt five pets?",
  "Most likely to win a dance-off?", "Most likely to survive in the wild?", "Most likely to text back in 3 days?",
  "Most likely to plan the next meetup?", "Best person to be stuck in a lift with?", "Most likely to order for the whole table?",
];

export const SPIN_TASKS = [
  "Tell the table your most embarrassing school memory.", "Give a genuine compliment to the person on your left.",
  "Do your best impression of someone famous.", "Share the last photo you took and its story.", "Sing the chorus of any song.",
  "Say something nice about every person at the table.", "Tell us your worst haircut story.", "Speak in an accent until your next turn.",
  "Share a fun fact nobody here knows.", "Do 5 seconds of your best dance move.", "What's your toxic trait? Be honest.",
  "Swap seats with anyone you choose.",
];

export const SPEED_PROMPTS = [
  "What brought you to this city?", "What's the best thing that happened to you this week?", "What are you nerdy about?",
  "What would you do on a free Tuesday?", "Last trip you took?", "What's on your bucket list for this year?",
  "Which song is stuck in your head?", "What's a skill you'd love to learn?",
];

export const STORY_STARTS = [
  "The auto driver turned around and said, 'I've been waiting for you.'", "Nobody expected the wedding to be interrupted by a camel.",
  "At exactly 2 am, every phone in Jaipur buzzed at once.", "The chai tasted different that morning.",
  "My nani handed me a map and said, 'Don't tell your mother.'",
];

export const ANTAKSHARI_LETTERS = "AABBCDDEGHJKKLMMNPPRSSTTYZ".split("");
