import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import type {
  Photo,
  PhotoOutcome,
  PhotoSource,
  PlaceIdentity,
} from "../domain/catalogue/enrichment.ts";
import {
  forgetPhotos,
  type PhotosDeps,
  photosForPlace,
} from "./place-photos.ts";

const PLACE = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2030-05-01T09:00:00Z");

const identity: PlaceIdentity = {
  name: "Narikala Fortress",
  nameKa: null,
  lonLat: [44.8103, 41.6875],
  category: "castle",
};

const photo: Photo = {
  id: "wm:1",
  url: "https://upload.example/1.jpg",
  width: 640,
  height: 480,
  caption: null,
  by: null,
  credit: { text: "Jane · CC BY-SA 4.0", url: "https://commons.example/1" },
};

function world(
  over: Partial<PhotosDeps> = {},
  answer: PhotoOutcome = { ok: true, photos: [photo] },
) {
  const counts = new Map<string, number>();
  const calls = { find: 0 };
  let clock = NOW;
  const source: PhotoSource = {
    async find() {
      calls.find++;
      return answer;
    },
  };
  const deps: Pick<PhotosDeps, "source"> & Partial<PhotosDeps> = {
    source,
    identity: async () => identity,
    count: async (key) => {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n;
    },
    now: () => clock,
    limits: { userPerMinute: 30 },
    ...over,
  };
  return {
    deps,
    calls,
    advance: (ms: number) => (clock = new Date(clock.getTime() + ms)),
  };
}

beforeEach(() => forgetPhotos());

describe("photosForPlace", () => {
  test("asks the source for the place and returns what it finds", async () => {
    const w = world();
    const out = await photosForPlace(PLACE, "u1", w.deps);
    assert.deepEqual(out, { ok: true, photos: [photo] });
    assert.equal(w.calls.find, 1);
  });

  test("the same place a minute later is not asked for again", async () => {
    const w = world();
    await photosForPlace(PLACE, "u1", w.deps);
    w.advance(60_000);
    await photosForPlace(PLACE, "u1", w.deps);
    assert.equal(w.calls.find, 1);
  });

  test("a quarter of an hour later it is", async () => {
    const w = world();
    await photosForPlace(PLACE, "u1", w.deps);
    w.advance(16 * 60_000);
    await photosForPlace(PLACE, "u1", w.deps);
    assert.equal(w.calls.find, 2);
  });

  test("a place with no photographs is an answer, and is held like one", async () => {
    const w = world({}, { ok: true, photos: [] });
    assert.deepEqual(await photosForPlace(PLACE, "u1", w.deps), {
      ok: true,
      photos: [],
    });
    await photosForPlace(PLACE, "u1", w.deps);
    assert.equal(w.calls.find, 1);
  });

  test("a failure is not held: the next visit asks again", async () => {
    const w = world({}, { ok: false, reason: "upstream" });
    assert.deepEqual(await photosForPlace(PLACE, "u1", w.deps), {
      ok: false,
      reason: "upstream",
    });
    await photosForPlace(PLACE, "u1", w.deps);
    assert.equal(w.calls.find, 2);
  });

  test("two travellers opening one place together share one call", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const w = world();
    const slow: PhotoSource = {
      async find() {
        w.calls.find++;
        await gate;
        return { ok: true, photos: [photo] };
      },
    };
    const deps = { ...w.deps, source: slow };
    const a = photosForPlace(PLACE, "a", deps);
    const b = photosForPlace(PLACE, "b", deps);
    await new Promise((r) => setTimeout(r, 10));
    release();
    const [x, y] = await Promise.all([a, b]);
    assert.ok(x.ok && y.ok);
    assert.equal(w.calls.find, 1);
  });

  test("a traveller past their minute is refused before Commons is asked", async () => {
    const w = world({ limits: { userPerMinute: 1 } });
    assert.ok((await photosForPlace(PLACE, "u1", w.deps)).ok);
    forgetPhotos();
    assert.deepEqual(await photosForPlace(PLACE, "u1", w.deps), {
      ok: false,
      reason: "rate-limited",
    });
    assert.equal(w.calls.find, 1);
  });

  test("a place the catalogue does not hold has no photographs", async () => {
    const w = world({ identity: async () => null });
    assert.deepEqual(await photosForPlace(PLACE, "u1", w.deps), {
      ok: true,
      photos: [],
    });
    assert.equal(w.calls.find, 0);
  });
});
