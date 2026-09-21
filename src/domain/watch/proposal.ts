import { z } from "zod";
import type { PatchOp } from "../trip/patch.ts";

// What the judge is allowed to propose, and how it becomes a patch.
//
// The judge does not write JSON Patch. The patch grammar addresses nodes by
// UUID through a JSON Pointer, and a model asked to produce one will sooner or
// later emit a well-formed pointer to the wrong stop — a class of error no
// validator downstream can catch, because the result is valid and wrong.
//
// So the model chooses from a vocabulary and the domain computes the ops, for
// the same reason `schedule.ts` sets clock times rather than the composer: the
// model decides what should happen, the code works out how to say it. The
// stored patch is ordinary JSON Patch either way — nothing downstream changes.

export const proposal = z.discriminatedUnion("move", [
  z.object({
    move: z.literal("shift"),
    nodeId: z.uuid(),
    /** Signed. Negative brings the stop forward, out of the weather. */
    byMinutes: z.number().int().min(-720).max(720),
  }),
  z.object({
    move: z.literal("swap"),
    nodeId: z.uuid(),
    /** Must be one of the alternatives the judge was given. */
    placeId: z.uuid(),
    indoor: z.boolean(),
  }),
  z.object({
    move: z.literal("shorten"),
    nodeId: z.uuid(),
    toMinutes: z
      .number()
      .int()
      .min(15)
      .max(24 * 60),
  }),
  z.object({ move: z.literal("drop"), nodeId: z.uuid() }),
]);
export type Proposal = z.infer<typeof proposal>;

/** Node facts the translation needs, for the nodes a proposal names. */
export type NodeClock = { startsAt: string };

export type ProposalError = { nodeId: string; message: string };

export type Translated = {
  ops: PatchOp[];
  /** Proposals that named a node the trip does not have. */
  errors: ProposalError[];
};

/**
 * One intervention is one patch set accepted or rejected as a unit — moving the
 * hike displaces the museum, which collides with lunch. So the whole list
 * translates together, and a proposal naming an unknown node is reported rather
 * than skipped: half a cascade is worse than none.
 */
export function toOps(
  proposals: readonly Proposal[],
  nodes: ReadonlyMap<string, NodeClock>,
): Translated {
  const ops: PatchOp[] = [];
  const errors: ProposalError[] = [];

  for (const p of proposals) {
    const node = nodes.get(p.nodeId);
    if (!node) {
      errors.push({ nodeId: p.nodeId, message: "no such node on this trip" });
      continue;
    }

    switch (p.move) {
      case "shift":
        ops.push({
          op: "replace",
          path: `/nodes/${p.nodeId}/startsAt`,
          value: new Date(
            Date.parse(node.startsAt) + p.byMinutes * 60_000,
          ).toISOString(),
        });
        break;
      case "swap":
        // `indoor` follows the place: a node that keeps the old flag after
        // swapping a viewpoint for a museum would still be judged against
        // dusk, and the coherent-day validator would be right to refuse it.
        ops.push(
          {
            op: "replace",
            path: `/nodes/${p.nodeId}/placeId`,
            value: p.placeId,
          },
          {
            op: "replace",
            path: `/nodes/${p.nodeId}/indoor`,
            value: p.indoor,
          },
        );
        break;
      case "shorten":
        ops.push({
          op: "replace",
          path: `/nodes/${p.nodeId}/durationMin`,
          value: p.toMinutes,
        });
        break;
      case "drop":
        ops.push({ op: "remove", path: `/nodes/${p.nodeId}` });
        break;
    }
  }

  return { ops, errors };
}

/** Every catalogue place a proposal would introduce. */
export function placeIdsInProposals(proposals: readonly Proposal[]): string[] {
  return [
    ...new Set(
      proposals.flatMap((p) => (p.move === "swap" ? [p.placeId] : [])),
    ),
  ];
}
