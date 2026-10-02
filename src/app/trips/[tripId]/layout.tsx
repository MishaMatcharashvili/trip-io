// The trip's own layout, for the one thing every screen under it shares: the
// popup slot. A stop opened from any screen of the trip — the map, the plan, a
// briefing, an alert — is an intercepting route into @modal, and a slot must
// live in a layout that wraps every screen that can open it, or a navigation
// from one the layout does not wrap would have nowhere to put the popup.
export default function TripLayout({
  children,
  modal,
}: LayoutProps<"/trips/[tripId]">) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
