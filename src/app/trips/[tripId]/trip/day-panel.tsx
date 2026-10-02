import Link from "next/link";
import { WeatherRibbon } from "@/ui/bars";
import { ButtonLink } from "@/ui/button";
import { Card } from "@/ui/card";
import { Icon } from "@/ui/icon";

type Weather = {
  hours: Parameters<typeof WeatherRibbon>[0]["hours"];
  caption: string;
  captionTone?: "alert" | "neutral";
} | null;

/**
 * What a day opens into, wherever it is read: the day's weather above the
 * day's plan — a conflict you can see as a shape before you read a word of it —
 * then the plan itself, then what the watch recommends, and for today the way
 * to this morning's briefing.
 */
export function DayPanel({
  weather,
  recommended,
  briefingHref,
  children,
}: {
  weather: Weather;
  /** Where an open recommendation for this day is reviewed, if there is one. */
  recommended: string | null;
  /** Only for today. */
  briefingHref: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-hairline bg-canvas px-3 py-3 lg:px-4">
      {weather ? (
        <Card className="px-3.5 py-3">
          <WeatherRibbon
            hours={weather.hours}
            caption={weather.caption}
            captionTone={weather.captionTone}
          />
        </Card>
      ) : null}

      {children}

      {recommended ? (
        <Card
          tint
          accent="agent"
          className="flex items-center gap-3 px-3.5 py-2.5"
        >
          <Icon name="sparkle" size={16} className="text-agent" />
          <span className="flex-1 text-small font-medium">
            1 change recommended for this day
          </span>
          <ButtonLink href={recommended} variant="primary" size="sm">
            Review
          </ButtonLink>
        </Card>
      ) : null}

      {briefingHref ? (
        <Link
          href={briefingHref}
          className="self-start text-small font-medium text-agent"
        >
          This morning&rsquo;s briefing
        </Link>
      ) : null}
    </div>
  );
}
