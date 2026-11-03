import type { LonLat } from "../geo.ts";

// Finding a village or town by name: where a traveller's home is ("my house in
// Amaghleba"). The catalogue holds places to visit, not settlements, and a
// village's name is not unique (there is an Amaghleba in Guria and another in
// Imereti), so a provider is asked for every match and the use case keeps the
// one in the part of Georgia the trip is going to.

export type Locality = { name: string; lonLat: LonLat };

export type LocalityLookup =
  | { ok: true; localities: Locality[] }
  | { ok: false; reason: "not-configured" | "unavailable" };

export type LocalityFinder = {
  provider: string;
  configured: boolean;
  /** Settlements in Georgia by that name; `near` is a region's name to tell namesakes apart. */
  find(name: string, near?: string): Promise<LocalityLookup>;
};
