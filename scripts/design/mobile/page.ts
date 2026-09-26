import type { Theme } from "./art.tsx";
import { kitCss } from "./kit.ts";
import { tokensCss } from "./tokens.ts";

export type Screen = {
  slug: string;
  title: string;
  /** One line for the index: what the screen is for. */
  note: string;
  /** The frame's content, drawn once per theme. */
  render: (theme: Theme) => string;
  /** For boards that are not a full phone, like the push stack. */
  height?: number;
};

export type Flow = {
  slug: string;
  /** The Design System pane groups cards by this. */
  group: string;
  screens: Screen[];
};

const FONTS =
  "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap";

const css = () => `${tokensCss()}\n${kitCss}`;

/**
 * One self-contained card: the `@dsCard` marker on the first line, tokens and
 * kit inlined (a card is rendered on its own, with nothing beside it to link
 * to), and the frame drawn twice — light, then dark.
 */
export function screenPage(group: string, screen: Screen): string {
  const side = (theme: Theme) => `
<section class="side" data-theme="${theme}">
  <div class="side-cap"><b>${screen.title}</b><span>· ${theme}</span></div>
  <div class="phone"${screen.height ? ` style="height:${screen.height}px"` : ""}>${screen.render(theme)}</div>
</section>`;
  return document(
    group,
    screen.title,
    `<div class="board">${side("light")}${side("dark")}</div>`,
  );
}

export function document(group: string, title: string, body: string): string {
  return `<!-- @dsCard group="${group}" -->
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · trip.io mobile</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${css()}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}
