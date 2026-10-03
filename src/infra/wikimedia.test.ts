import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { plain, toCandidates, wikimediaPhotos } from "./wikimedia.ts";

// MOCKED. The bodies have the shape Commons' API answers with (read from the live
// service); whether it answers the same tomorrow is what `pnpm smoke:wikimedia`
// is for.

const page = (over: Record<string, unknown> = {}) => ({
  pageid: 1,
  title: "File:Narikala Fortress, Tbilisi.jpg",
  coordinates: [{ lat: 41.6876, lon: 44.8104, primary: true }],
  imageinfo: [
    {
      thumburl: "https://upload.wikimedia.org/thumb/1/640px-Narikala.jpg",
      thumbwidth: 640,
      thumbheight: 480,
      width: 4000,
      mime: "image/jpeg",
      descriptionurl: "https://commons.wikimedia.org/wiki/File:Narikala.jpg",
      extmetadata: {
        Artist: { value: '<a href="//x">Jane <b>Doe</b></a>' },
        LicenseShortName: { value: "CC BY-SA 4.0" },
        ObjectName: { value: "Narikala &amp; the old town" },
        ImageDescription: { value: "<p>The fortress above Tbilisi</p>" },
      },
    },
  ],
  ...over,
});

const reply = (...pages: unknown[]) => ({ query: { pages } });

/** A photograph of something else: its metadata does not name the place either. */
const elsewhere = (pageid: number, title: string) =>
  page({
    pageid,
    title,
    imageinfo: [
      {
        ...page().imageinfo[0],
        extmetadata: {
          Artist: { value: "Someone" },
          LicenseShortName: { value: "CC0" },
          ObjectName: { value: "A mosque" },
          ImageDescription: { value: "A mosque in the old town" },
        },
      },
    ],
  });

const NARIKALA = {
  name: "Narikala Fortress",
  nameKa: null,
  lonLat: [44.8103, 41.6875] as [number, number],
  category: "castle",
};

describe("plain", () => {
  test("is the text of some HTML", () => {
    assert.equal(
      plain('<a href="//x">Jane <b>Doe</b></a> &amp; Co'),
      "Jane Doe & Co",
    );
    assert.equal(plain(undefined), "");
  });
});

describe("toCandidates", () => {
  test("a photograph carries who took it, under what, and where it lives", () => {
    const [c] = toCandidates(reply(page()));
    assert.equal(
      c.photo.url,
      "https://upload.wikimedia.org/thumb/1/640px-Narikala.jpg",
    );
    assert.deepEqual(c.photo.credit, {
      text: "Jane Doe · CC BY-SA 4.0",
      url: "https://commons.wikimedia.org/wiki/File:Narikala.jpg",
    });
    assert.deepEqual(c.lonLat, [44.8104, 41.6876]);
    assert.ok(c.labels.some((l) => l.includes("Narikala & the old town")));
  });

  test("what is not a photograph, or too small to show, is dropped", () => {
    const svg = page({
      pageid: 2,
      imageinfo: [{ ...page().imageinfo[0], mime: "image/svg+xml" }],
    });
    const small = page({
      pageid: 3,
      imageinfo: [{ ...page().imageinfo[0], width: 300 }],
    });
    const insecure = page({
      pageid: 4,
      imageinfo: [
        { ...page().imageinfo[0], thumburl: "http://upload.example/x.jpg" },
      ],
    });
    assert.deepEqual(toCandidates(reply(svg, small, insecure)), []);
  });

  test("no result at all is an empty reply, which is an answer", () => {
    assert.deepEqual(toCandidates({}), []);
    assert.deepEqual(toCandidates({ batchcomplete: true }), []);
  });

  test("a file with no location is still a candidate", () => {
    const [c] = toCandidates(reply(page({ coordinates: undefined })));
    assert.equal(c.lonLat, null);
  });

  test("something that is not the shape is an error for the caller to drop", () => {
    assert.throws(() => toCandidates({ query: { pages: "no" } }));
  });
});

type Seen = { url: URL; headers: Record<string, string> };

function fake(answers: {
  geosearch?: unknown | number;
  search?: unknown | number;
}) {
  const seen: Seen[] = [];
  const f = (async (input: URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    seen.push({ url, headers: init.headers as Record<string, string> });
    const answer =
      url.searchParams.get("generator") === "geosearch"
        ? answers.geosearch
        : answers.search;
    if (typeof answer === "number")
      return new Response("{}", { status: answer });
    return Response.json(answer ?? reply());
  }) as unknown as typeof fetch;
  return { fetch: f, seen };
}

describe("wikimediaPhotos", () => {
  test("asks both questions, says who is asking, and keeps what names the place", async () => {
    const f = fake({
      geosearch: reply(
        page(),
        // The neighbour: near, and not named.
        elsewhere(9, "File:Mosquée - panoramio (3).jpg"),
      ),
      search: reply(
        page({
          pageid: 5,
          title: "File:Narikala Fortress view.jpg",
          coordinates: undefined,
        }),
      ),
    });
    const out = await wikimediaPhotos({ fetch: f.fetch }).find(NARIKALA);
    assert.ok(out.ok);
    assert.deepEqual(out.photos.map((p) => p.id).sort(), ["wm:1", "wm:5"]);
    assert.equal(f.seen.length, 2);
    assert.match(f.seen[0].headers["User-Agent"], /trip\.io/);
    const geo = f.seen.find(
      (s) => s.url.searchParams.get("generator") === "geosearch",
    );
    assert.equal(geo?.url.searchParams.get("ggscoord"), "41.6875|44.8103");
    assert.equal(geo?.url.searchParams.get("ggsnamespace"), "6");
  });

  test("one of the two failing costs half the photographs, not all of them", async () => {
    const f = fake({
      geosearch: 500,
      search: reply(
        page({
          pageid: 5,
          title: "File:Narikala Fortress.jpg",
          coordinates: undefined,
        }),
      ),
    });
    const out = await wikimediaPhotos({ fetch: f.fetch }).find(NARIKALA);
    assert.ok(out.ok);
    assert.deepEqual(
      out.photos.map((p) => p.id),
      ["wm:5"],
    );
  });

  test("both failing is a failure, and says why", async () => {
    const limited = fake({ geosearch: 429, search: 429 });
    assert.deepEqual(
      await wikimediaPhotos({ fetch: limited.fetch }).find(NARIKALA),
      {
        ok: false,
        reason: "rate-limited",
      },
    );
    const down = fake({ geosearch: 503, search: 503 });
    assert.deepEqual(
      await wikimediaPhotos({ fetch: down.fetch }).find(NARIKALA),
      {
        ok: false,
        reason: "upstream",
      },
    );
  });

  test("a place nothing is named after has no photographs, and that is not an error", async () => {
    const f = fake({
      geosearch: reply(elsewhere(2, "File:Somewhere else.jpg")),
      search: reply(),
    });
    assert.deepEqual(await wikimediaPhotos({ fetch: f.fetch }).find(NARIKALA), {
      ok: true,
      photos: [],
    });
  });

  test("a slow answer is a timeout", async () => {
    const slow = (async (_: unknown, init: RequestInit) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      })) as unknown as typeof fetch;
    const out = await wikimediaPhotos({ fetch: slow, timeoutMs: 10 }).find(
      NARIKALA,
    );
    assert.deepEqual(out, { ok: false, reason: "timeout" });
  });
});
