"use client";

import { useSyncExternalStore } from "react";
import {
  getMapStyle,
  type MapStyleKind,
  setMapStyle,
  subscribeMapStyle,
} from "./map-style.ts";

/** The traveller's base-map choice; the server and the first paint have the street map. */
export function useMapStyle(): MapStyleKind {
  return useSyncExternalStore(subscribeMapStyle, getMapStyle, () => "map");
}

export { setMapStyle };
