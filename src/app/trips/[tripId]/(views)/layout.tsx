import { TripChrome } from "@/features/trip-chrome";
import { tripHeader } from "../load";

// The chrome of a trip's own screens: the map, the plan, its history, the AI's
// record, a replan. It lives here, in a layout, so it is drawn once and the
// screens change inside it; their loading states draw only their content.
// Place, briefing, an alert and watch settings are full-screen views of their
// own and sit outside this group.
export default async function TripViewsLayout({
  children,
  params,
}: LayoutProps<"/trips/[tripId]">) {
  // `params` is read where the data is, inside the chrome's own Suspense
  // boundaries; the layout itself touches nothing at request time.
  return (
    <TripChrome load={async () => tripHeader((await params).tripId)}>
      {children}
    </TripChrome>
  );
}
