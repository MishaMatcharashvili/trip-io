import type { MetadataRoute } from "next";

// The API is not for crawlers. One of its answers is a third party's reviews,
// which that provider's terms keep out of anything a search engine can index:
// they are fetched by script from /api, and /api is disallowed here.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/api/" } };
}
