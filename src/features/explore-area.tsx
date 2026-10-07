"use client";

import { createContext, useContext } from "react";

/**
 * The region Explore is narrowed to, shared with the cards beside the
 * catalogue. They are built on the server and handed to the screen as nodes,
 * so this is how they hear about a filter chosen in the browser. Without a
 * provider — the page's loading shell — it is no region.
 */
export type ExploreArea = { slug: string; name: string } | null;

const ExploreAreaContext = createContext<ExploreArea>(null);

export const ExploreAreaProvider = ExploreAreaContext.Provider;

export const useExploreArea = () => useContext(ExploreAreaContext);
