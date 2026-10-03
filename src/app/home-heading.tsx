import { PageHeading } from "@/features/page-column";
import { ButtonLink } from "@/ui/button";

/** Home's heading: the title and the way to a new trip are fixed; the line under it is data. */
export function HomeHeading({ lead }: { lead: React.ReactNode }) {
  return (
    <PageHeading
      title="Your trips"
      leadOnPhone={false}
      lead={lead}
      action={
        <ButtonLink href="/#plan" variant="primary" className="px-[18px]">
          <span className="hidden lg:inline">New trip</span>
          <span className="lg:hidden">New</span>
        </ButtonLink>
      }
    />
  );
}
