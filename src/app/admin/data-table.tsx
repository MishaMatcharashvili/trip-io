"use client";

import { useMemo, useState } from "react";
import {
  arrange,
  CHOICE_LIMIT,
  type ColumnSpec,
  choicesOf,
  type Filter,
  isOpen,
  type Sort,
  type Table,
} from "@/domain/admin/table.ts";
import { show } from "./format";

// One table for every list in the panel. The server sends the rows once, capped;
// sorting and filtering happen here, by the rules in domain/admin/table.ts.
// Click a header to sort (again to reverse, a third time to go back to the
// server's order); every column has its own filter underneath.

const PAGE = 200;

const input =
  "w-full min-w-0 rounded border border-zinc-300 bg-transparent px-1.5 py-0.5 text-xs dark:border-zinc-700";

export function DataTable({
  table,
  initialSort,
  empty = "Nothing yet.",
}: {
  table: Table;
  initialSort?: Sort;
  empty?: string;
}) {
  const [sort, setSort] = useState<Sort | null>(initialSort ?? null);
  const [filters, setFilters] = useState<Record<string, Filter>>({});
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<number | null>(null);

  const grid = table.columns.filter((c) => !c.detail);
  const detail = table.columns.filter((c) => c.detail);

  // A choice column whose vocabulary has grown past a picker's reach filters as text.
  const choices = useMemo(() => {
    const out: Record<string, { value: string; n: number }[] | null> = {};
    for (const c of grid) {
      if (c.kind !== "choice") continue;
      const all = choicesOf(table.rows, c.key);
      out[c.key] = all.length <= CHOICE_LIMIT ? all : null;
    }
    return out;
  }, [grid, table.rows]);

  const rows = useMemo(
    () => arrange(table.rows, table.columns, filters, sort),
    [table.rows, table.columns, filters, sort],
  );
  const filtered = Object.values(filters).some((f) => !isOpen(f));

  function setFilter(key: string, f: Filter) {
    setFilters((prev) => ({ ...prev, [key]: f }));
    setShown(PAGE);
    setOpen(null);
  }

  function toggleSort(key: string) {
    setOpen(null);
    setSort((s) =>
      s?.key !== key
        ? { key, dir: "asc" }
        : s.dir === "asc"
          ? { key, dir: "desc" }
          : null,
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span aria-live="polite">
          {rows.length.toLocaleString("en-GB")} of{" "}
          {table.rows.length.toLocaleString("en-GB")} rows
        </span>
        {table.total > table.rows.length && (
          <span>
            Newest {table.rows.length.toLocaleString("en-GB")} of{" "}
            {table.total.toLocaleString("en-GB")} are loaded.
          </span>
        )}
        {filtered && (
          <button
            type="button"
            className="underline"
            onClick={() => {
              setFilters({});
              setShown(PAGE);
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="max-h-[75vh] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900">
            <tr>
              {grid.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={
                    sort?.key === c.key
                      ? sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className="whitespace-nowrap px-3 pt-2 text-left align-bottom text-xs font-medium text-zinc-600 dark:text-zinc-400"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    {c.label}
                    <span aria-hidden className="w-3 text-zinc-400">
                      {sort?.key === c.key
                        ? sort.dir === "asc"
                          ? "▲"
                          : "▼"
                        : ""}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              {grid.map((c) => (
                <th
                  key={c.key}
                  className="px-3 pb-2 pt-1 align-top font-normal"
                >
                  <FilterCell
                    column={c}
                    value={filters[c.key]}
                    choices={choices[c.key] ?? null}
                    onChange={(f) => setFilter(c.key, f)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((r, i) => (
              <RowView
                // The index is the row's place in this arrangement; rows have no shared id.
                // biome-ignore lint/suspicious/noArrayIndexKey: see above
                key={i}
                row={r}
                grid={grid}
                detail={detail}
                open={open === i}
                onToggle={() => setOpen(open === i ? null : i)}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={grid.length}
                  className="px-3 py-8 text-center text-zinc-500"
                >
                  {filtered ? "No row matches these filters." : empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="self-start rounded-full border border-zinc-300 px-4 py-1.5 text-sm dark:border-zinc-700"
        >
          Show {Math.min(PAGE, rows.length - shown)} more
        </button>
      )}
    </div>
  );
}

function RowView({
  row,
  grid,
  detail,
  open,
  onToggle,
}: {
  row: Table["rows"][number];
  grid: ColumnSpec[];
  detail: ColumnSpec[];
  open: boolean;
  onToggle: () => void;
}) {
  const expandable = detail.some((d) => row[d.key]);
  return (
    <>
      <tr
        className={`border-b border-zinc-100 align-top dark:border-zinc-900 ${expandable ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/60" : ""}`}
        onClick={expandable ? onToggle : undefined}
        aria-expanded={expandable ? open : undefined}
      >
        {grid.map((c) => (
          <td
            key={c.key}
            className={`px-3 py-1.5 ${c.wide ? "min-w-80 max-w-xl" : "whitespace-nowrap"} ${c.kind === "number" ? "text-right tabular-nums" : ""}`}
          >
            <CellView column={c} row={row} />
          </td>
        ))}
      </tr>
      {open && (
        <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60">
          <td colSpan={grid.length} className="px-3 py-3">
            <dl className="grid max-w-4xl gap-3 text-sm md:grid-cols-2">
              {detail.map((d) => (
                <div key={d.key} className="min-w-0">
                  <dt className="text-xs font-medium text-zinc-500">
                    {d.label}
                  </dt>
                  <dd className="whitespace-pre-wrap break-words">
                    {show(row[d.key])}
                  </dd>
                </div>
              ))}
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

function CellView({
  column,
  row,
}: {
  column: ColumnSpec;
  row: Table["rows"][number];
}) {
  const text = show(row[column.key], column.format);
  const href = column.link ? row[column.link] : null;
  if (typeof href !== "string" || href === "" || text === "—")
    return <>{text}</>;
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      onClick={(e) => e.stopPropagation()}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="underline decoration-zinc-400 underline-offset-2 hover:decoration-foreground"
    >
      {text}
    </a>
  );
}

function FilterCell({
  column,
  value,
  choices,
  onChange,
}: {
  column: ColumnSpec;
  value: Filter | undefined;
  choices: { value: string; n: number }[] | null;
  onChange: (f: Filter) => void;
}) {
  const label = `Filter ${column.label}`;
  if (column.kind === "number") {
    const f = value?.kind === "number" ? value : null;
    const set = (min: string, max: string) =>
      onChange({
        kind: "number",
        min: min === "" ? null : Number(min),
        max: max === "" ? null : Number(max),
      });
    return (
      <div className="flex gap-1">
        <input
          type="number"
          aria-label={`${label}, at least`}
          placeholder="min"
          value={f?.min ?? ""}
          onChange={(e) => set(e.target.value, String(f?.max ?? ""))}
          className={`${input} w-14`}
        />
        <input
          type="number"
          aria-label={`${label}, at most`}
          placeholder="max"
          value={f?.max ?? ""}
          onChange={(e) => set(String(f?.min ?? ""), e.target.value)}
          className={`${input} w-14`}
        />
      </div>
    );
  }
  if (column.kind === "date") {
    const f = value?.kind === "date" ? value : null;
    return (
      <div className="flex flex-col gap-1">
        <input
          type="date"
          aria-label={`${label}, from`}
          value={f?.from ?? ""}
          onChange={(e) =>
            onChange({
              kind: "date",
              from: e.target.value || null,
              to: f?.to ?? null,
            })
          }
          className={input}
        />
        <input
          type="date"
          aria-label={`${label}, to`}
          value={f?.to ?? ""}
          onChange={(e) =>
            onChange({
              kind: "date",
              from: f?.from ?? null,
              to: e.target.value || null,
            })
          }
          className={input}
        />
      </div>
    );
  }
  if (column.kind === "choice" && choices) {
    const f =
      value?.kind === "choice" ? value : { kind: "choice" as const, anyOf: [] };
    return (
      <details className="relative">
        <summary className={`${input} cursor-pointer list-none`}>
          {f.anyOf.length === 0 ? "All" : `${f.anyOf.length} selected`}
        </summary>
        <div className="absolute left-0 z-20 mt-1 flex max-h-64 min-w-40 flex-col gap-1 overflow-auto rounded border border-zinc-300 bg-background p-2 shadow-lg dark:border-zinc-700">
          {choices.map((c) => (
            <label key={c.value} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={f.anyOf.includes(c.value)}
                onChange={(e) =>
                  onChange({
                    kind: "choice",
                    anyOf: e.target.checked
                      ? [...f.anyOf, c.value]
                      : f.anyOf.filter((v) => v !== c.value),
                  })
                }
              />
              <span className="flex-1">{c.value}</span>
              <span className="text-zinc-500">{c.n}</span>
            </label>
          ))}
        </div>
      </details>
    );
  }
  return (
    <input
      type="search"
      aria-label={label}
      placeholder="contains…"
      value={value?.kind === "text" ? value.contains : ""}
      onChange={(e) => onChange({ kind: "text", contains: e.target.value })}
      className={input}
    />
  );
}
