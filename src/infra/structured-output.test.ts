import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { intakeReply } from "../domain/trip/generate/intake.ts";
import { planSchema } from "../domain/trip/generate/plan.ts";

// The model is held to these schemas by the decoder (strict structured
// output), and the domain's own guard checks the answer again. A schema that
// OpenAI's strict mode cannot take — an optional field, say — only shows up as
// a failed call in production, so every schema the planner and the composer
// send is converted here.

describe("strict structured output", () => {
  test("the planner's reply converts, and every field is required", () => {
    const { schema, strict, type } = zodTextFormat(intakeReply, "turn");
    assert.equal(type, "json_schema");
    assert.equal(strict, true);
    const required = (schema as { required: string[] }).required;
    assert.deepEqual(
      [...required].sort(),
      Object.keys(intakeReply.shape).sort(),
    );
  });

  test("the planner's reply carries its suggested answers as strings", () => {
    const { schema } = zodTextFormat(intakeReply, "turn");
    const props = (schema as { properties: Record<string, unknown> })
      .properties;
    assert.deepEqual(props.suggestions, {
      type: "array",
      items: { type: "string" },
    });
  });

  test("the planner's proposals are strict objects, every field required", () => {
    const { schema } = zodTextFormat(intakeReply, "turn");
    const options = (
      schema as {
        properties: {
          options: {
            items: {
              required: string[];
              properties: Record<string, unknown>;
              additionalProperties: boolean;
            };
          };
        };
      }
    ).properties.options.items;
    assert.equal(options.additionalProperties, false);
    assert.deepEqual(
      [...options.required].sort(),
      Object.keys(options.properties).sort(),
    );
    assert.ok(options.required.includes("dayEnds"));
  });

  test("the composer's plan converts with its refs as an enum", () => {
    const refs = z.enum(["p1", "p2"]);
    const { schema } = zodTextFormat(planSchema(refs), "plan");
    assert.match(JSON.stringify(schema), /"enum":\["p1","p2"\]/);
  });
});
