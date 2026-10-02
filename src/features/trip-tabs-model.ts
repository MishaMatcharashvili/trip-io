// Which of a trip's two tabs a screen belongs to, from the first segment of the
// URL below the trip. The map is the trip's own address, so it has no segment;
// a replan is the map's, a day or a change history is the plan's, and the AI's
// record belongs to neither: it is reached from the account menu.

export type TripTab = "Trip" | "Map" | "";

export function activeTab(segment: string | null): TripTab {
  switch (segment) {
    case null:
    case "replan":
      return "Map";
    case "trip":
    case "history":
      return "Trip";
    default:
      return "";
  }
}
