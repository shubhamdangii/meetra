import type { MetadataRoute } from "next";
import { CONFIG } from "@/lib/config";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "events/", "swipe/", "games/", "past/", "host/", "about/", "safety/", "partners/"].map((p) => ({ url: `${CONFIG.siteUrl}/${p}`, changeFrequency: "daily", priority: p ? 0.7 : 1 }));
}
