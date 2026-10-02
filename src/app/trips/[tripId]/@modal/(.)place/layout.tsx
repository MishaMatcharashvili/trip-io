import { PlaceModal } from "@/features/place-modal";

// The popup's frame, drawn once and kept while the stop inside it loads.
export default function PlaceModalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PlaceModal>{children}</PlaceModal>;
}
