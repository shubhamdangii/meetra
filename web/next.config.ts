import type { NextConfig } from "next";

// The site is served from https://shubhamdangii.github.io/meetra/ (GitHub Pages).
// Set NEXT_PUBLIC_BASE_PATH="" when it moves to its own domain.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/meetra";

const nextConfig: NextConfig = {
  output: "export",          // plain static files → free hosting on GitHub Pages, no server to attack
  basePath,
  trailingSlash: true,       // /events/ → events/index.html, which GitHub Pages serves directly
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
