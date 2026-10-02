import { PageHeading } from "@/features/page-column";
import { ButtonLink } from "@/ui/button";

/** Saved's heading, which is the same whoever has saved what. */
export function SavedHeading() {
  return (
    <PageHeading
      title="Saved"
      lead="Trips and places you kept. Any of them can start a trip — I re-check each one before it goes into a plan."
      action={
        <ButtonLink href="/explore" className="hidden lg:inline-flex">
          Explore more
        </ButtonLink>
      }
    />
  );
}
