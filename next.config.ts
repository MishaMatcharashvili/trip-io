import type { NextConfig } from "next";
import "./src/lib/env.ts";
import { imageHosts } from "./src/lib/image-hosts.ts";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  cacheComponents: true,
  images: {
    // How long a resized photograph is kept: 60 days, the owner's decision of
    // 2026-10-03. The default is 4 hours, which would resize the same photo again
    // every few hours for want of knowing it has not changed.
    minimumCacheTTL: 60 * 86_400,
    // Hosts a place's photographs come from: src/lib/image-hosts.ts, where the
    // reason for each is written and a test holds the real URLs against it.
    remotePatterns: [...imageHosts],
  },
  // A day is a row of the Trip tab, opened in place; it has no screen of its
  // own. The old address stays for the links that already point at it (a push
  // notification, an emailed briefing, a bookmark). Next keeps the query, so
  // the add-a-stop panel still opens with what it was asked to start with.
  // Not permanent: browsers keep a 308 for good, and this may move again.
  async redirects() {
    return [
      // The trip input is on the landing page now; /new is where it used to be.
      { source: "/new", destination: "/#plan", permanent: false },
      {
        source: "/trips/:tripId/day/:dayId",
        destination: "/trips/:tripId/trip?day=:dayId",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
