import type { Metadata } from "next";
import GamesPage from "@/components/pages/GamesPage";

export const metadata: Metadata = { title: "Party games", description: "Card decks and party games for one phone and a whole table." };

export default function Page() { return <GamesPage />; }
