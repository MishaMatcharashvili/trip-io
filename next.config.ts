import type { NextConfig } from "next";
import "./src/lib/env.ts";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  cacheComponents: true,
  // A day is a row of the Trip tab, opened in place; it has no screen of its
  // own. The old address stays for the links that already point at it (a push
  // notification, an emailed briefing, a bookmark). Next keeps the query, so
  // the add-a-stop panel still opens with what it was asked to start with.
  // Not permanent: browsers keep a 308 for good, and this may move again.
  async redirects() {
    return [
      {
        source: "/trips/:tripId/day/:dayId",
        destination: "/trips/:tripId/trip?day=:dayId",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
