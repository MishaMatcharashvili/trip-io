import type { NextConfig } from "next";
import "./src/lib/env.ts";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  cacheComponents: true,
  images: {
    // Hosts a place's photographs come from (src/infra): a host not listed here
    // cannot be optimised, so a new provider adds its CDN here. Tripadvisor
    // serves the photographer's original (up to ~5000px wide, several MB) and
    // the strip draws it 150px wide, so it is the one that needs resizing most.
    // Google's are the addresses its Place Photos call returns; they carry no key.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "dynamic-media.tacdn.com",
        pathname: "/media/**",
      },
      // Not yet seen live (no key when this was written): `pnpm smoke:google-places`
      // prints the host a photograph really comes from.
      { protocol: "https", hostname: "*.googleusercontent.com" },
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
        pathname: "/wikipedia/commons/**",
      },
    ],
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
