import {
  decide,
  type GoldLabel,
  noticeText,
  type Prediction,
  scoreSpike,
  vetRoadClaim,
} from "../../src/domain/watch/road-notice.ts";
import { fetchNotices } from "../../src/infra/georoad.ts";
import { readRoadNotice } from "../../src/infra/openai-road.ts";

// The road-automation spike (Phase 8): can a model reproduce, from the Roads
// Department's own notices, what an operator would enter by hand?
//
//   npm run roads:spike            score the model against the hand-labelled set
//
// The labels below were written by the engineer who built this, from the
// Georgian titles, and are the one thing in the result that is a person's
// judgement. They are limited to notices whose road is clear to a reader:
// anything ambiguous was left out rather than guessed at. Review them before
// trusting the number — a wrong label here moves it as much as a wrong claim.
//
// Compared separately: the corridor (does it land on the right trips), and the
// condition (closed or restricted). The decision rule is in the domain, fixed
// before this was run.

const none = [null] as const;

const GOLD: GoldLabel[] = [
  // Pshaveli–Abano–Omalo: the Tusheti road. Chains / high-clearance only.
  { id: 5282, corridor: ["tusheti"], condition: "restricted" },
  // Tsalenjikha–Obuji–Jikhashkari: Samegrelo, not one of the twelve.
  { id: 5281, corridor: none, condition: "reopened" },
  { id: 5280, corridor: none, condition: "closed" },
  // Darial gorge on the Mtskheta–Stepantsminda–Larsi road.
  { id: 5278, corridor: ["military-road"], condition: "reopened" },
  { id: 5276, corridor: ["military-road"], condition: "closed" },
  // Water-supply notices: not about a road at all.
  { id: 5277, corridor: none, condition: "none" },
  { id: 5274, corridor: none, condition: "none" },
  // Samtredia–Grigoleti motorway: the western end of the East–West highway,
  // and the way to the coast. Either corridor is a defensible answer.
  {
    id: 5275,
    corridor: ["east-west-highway", "kutaisi-batumi"],
    condition: "reopened",
  },
  {
    id: 5273,
    corridor: ["east-west-highway", "kutaisi-batumi"],
    condition: "restricted",
  },
  // Ozurgeti–Shemokmedi–Bzhuzha–Gomismta, Guria: not one of the twelve.
  { id: 5271, corridor: none, condition: "reopened" },
  { id: 5270, corridor: none, condition: "restricted" },
  { id: 5269, corridor: none, condition: "closed" },
  // Lentekhi–Lasdili and Ushguli–Lasdili: the Zagari Pass road.
  { id: 5268, corridor: ["zagari-pass"], condition: "reopened" },
  { id: 5263, corridor: ["zagari-pass"], condition: "closed" },
  { id: 5254, corridor: ["zagari-pass"], condition: "reopened" },
  { id: 5252, corridor: ["zagari-pass"], condition: "closed" },
  // Zhinvali–Barisakho–Shatili: Khevsureti, not one of the twelve.
  { id: 5267, corridor: none, condition: "closed" },
  // Trailers banned for four days on the Military Road, Gudauri–Jvari Pass.
  { id: 5247, corridor: ["military-road"], condition: "restricted" },
  { id: 5244, corridor: ["military-road"], condition: "restricted" },
  // Bakuriani–Ghadolari: the Borjomi–Bakuriani corridor.
  { id: 5246, corridor: ["borjomi-bakuriani"], condition: "reopened" },
];

const wanted = new Set(GOLD.map((g) => g.id));
const notices = (await fetchNotices(6)).filter((n) => wanted.has(n.id));
console.log(
  `${notices.length} of ${GOLD.length} labelled notices found in the feed`,
);

const predictions: Prediction[] = [];
for (const n of notices) {
  const text = noticeText(n);
  try {
    const raw = await readRoadNotice({
      text,
      status: n.status,
      publishedAt: n.publishedAt,
    });
    const vetted = vetRoadClaim(raw, { text, status: n.status });
    predictions.push(
      vetted.ok
        ? { id: n.id, claim: vetted.claim }
        : { id: n.id, claim: null, rejection: vetted.reason },
    );
  } catch (error) {
    console.log(`  ${n.id}: ${(error as Error).message}`);
    predictions.push({ id: n.id, claim: null });
  }
}

const score = scoreSpike(
  GOLD.filter((g) => notices.some((n) => n.id === g.id)),
  predictions,
);
const pct = (a: number, b: number) =>
  b ? `${Math.round((a / b) * 100)}%` : "n/a";
console.log(`
labelled            ${score.total}
corridor correct    ${score.corridorCorrect}/${score.total}  (${pct(score.corridorCorrect, score.total)})
recall on corridors ${score.recalled}/${score.onCorridor}  (${pct(score.recalled, score.onCorridor)})   notices on one of the twelve that were found
precision           ${score.claimedCorrectly}/${score.claimedOnCorridor}  (${pct(score.claimedCorrectly, score.claimedOnCorridor)})   claims placed on a corridor that were right
condition correct   ${score.conditionCorrect}/${score.conditionScored}  (${pct(score.conditionCorrect, score.conditionScored)})   graded only where an event would be written
refused by guards   ${score.rejected}
`);
for (const miss of score.misses) {
  const n = notices.find((x) => x.id === miss.id);
  console.log(
    `miss ${miss.id}  want ${JSON.stringify(miss.want.corridor)}/${miss.want.condition}  got ${JSON.stringify(miss.got.claim ?? miss.got.rejection)}\n     ${n?.title}`,
  );
}
const verdict = decide(score);
console.log(`\nDecision: ${verdict.decision} — ${verdict.why}`);
