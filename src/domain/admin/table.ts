// The operator's tables sort and filter in the browser, over rows the server
// already capped. The rules live here, apart from the component, so they can be
// tested without a DOM: what a column's filter means, how its values order, and
// where an empty cell goes.

export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;

/** How a column compares: `choice` is a short fixed vocabulary, picked rather than typed. */
export type ColumnKind = "text" | "number" | "date" | "choice";

export type Column = { key: string; kind: ColumnKind };

export type Filter =
  | { kind: "text"; contains: string }
  | { kind: "number"; min: number | null; max: number | null }
  /** Tbilisi calendar dates, `YYYY-MM-DD`, both ends included. */
  | { kind: "date"; from: string | null; to: string | null }
  | { kind: "choice"; anyOf: string[] };

export type Sort = { key: string; dir: "asc" | "desc" };

/** The Tbilisi calendar date an instant falls on: the operator's day, not the server's. */
export function tbilisiDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tbilisi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** What the choice filter lists and matches a cell by; an empty cell is its own choice. */
export const BLANK = "(none)";

export const choiceOf = (cell: Cell | undefined): string =>
  cell === null || cell === undefined || cell === ""
    ? BLANK
    : typeof cell === "boolean"
      ? cell
        ? "yes"
        : "no"
      : String(cell);

/** Does the filter hold nothing back? An untouched filter is dropped rather than applied. */
export function isOpen(f: Filter): boolean {
  switch (f.kind) {
    case "text":
      return f.contains.trim() === "";
    case "number":
      return f.min === null && f.max === null;
    case "date":
      return !f.from && !f.to;
    case "choice":
      return f.anyOf.length === 0;
  }
}

export function matches(cell: Cell | undefined, f: Filter): boolean {
  if (isOpen(f)) return true;
  switch (f.kind) {
    case "text":
      return (
        cell !== null &&
        cell !== undefined &&
        String(cell).toLowerCase().includes(f.contains.trim().toLowerCase())
      );
    case "number": {
      if (typeof cell !== "number") return false;
      return (
        (f.min === null || cell >= f.min) && (f.max === null || cell <= f.max)
      );
    }
    case "date": {
      if (typeof cell !== "string" || cell === "") return false;
      const day = tbilisiDate(cell);
      return (!f.from || day >= f.from) && (!f.to || day <= f.to);
    }
    case "choice":
      return f.anyOf.includes(choiceOf(cell));
  }
}

const empty = (c: Cell | undefined): boolean =>
  c === null || c === undefined || c === "";

function compare(kind: ColumnKind, a: Cell, b: Cell): number {
  if (kind === "number") return Number(a) - Number(b);
  if (kind === "date") return Date.parse(String(a)) - Date.parse(String(b));
  return String(a).localeCompare(String(b), "en", { sensitivity: "base" });
}

/**
 * The rows that pass every filter, in the order asked for. Empty cells sort
 * last in both directions, so "newest first" never opens on a column of blanks.
 * The sort is stable: ties keep the order the server sent (newest first).
 */
export function arrange<R extends Row>(
  rows: readonly R[],
  columns: readonly Column[],
  filters: Readonly<Record<string, Filter>>,
  sort: Sort | null,
): R[] {
  const active = Object.entries(filters).filter(([, f]) => !isOpen(f));
  const kept = rows.filter((r) => active.every(([k, f]) => matches(r[k], f)));
  const col = sort && columns.find((c) => c.key === sort.key);
  if (!sort || !col) return kept;
  const sign = sort.dir === "asc" ? 1 : -1;
  return kept
    .map((row, i) => ({ row, i }))
    .sort((x, y) => {
      const a = x.row[sort.key];
      const b = y.row[sort.key];
      if (empty(a) || empty(b)) {
        return empty(a) === empty(b) ? x.i - y.i : empty(a) ? 1 : -1;
      }
      return sign * compare(col.kind, a as Cell, b as Cell) || x.i - y.i;
    })
    .map((x) => x.row);
}

/** The values a choice column offers, commonest first. */
export function choicesOf(
  rows: readonly Row[],
  key: string,
): { value: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = choiceOf(r[key]);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, n]) => ({ value, n }))
    .sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
}

/** A column is a choice worth offering only while its vocabulary is short. */
export const CHOICE_LIMIT = 24;

/** How a cell reads on screen; the column's `kind` is how it compares. */
export type CellFormat = "text" | "date" | "number" | "amount" | "yesno";

/**
 * A column as plain data, so the server can describe a table and the browser
 * draw it. `link` names the row field that holds the cell's href; `detail`
 * columns are long text, shown when a row is opened rather than in the grid.
 */
export type ColumnSpec = Column & {
  label: string;
  format?: CellFormat;
  link?: string;
  detail?: boolean;
  /** Wide text that wraps, rather than a short value on one line. */
  wide?: boolean;
};

export type Table = {
  columns: ColumnSpec[];
  rows: Row[];
  /** How many rows exist; more than `rows` when the repository's cap bit. */
  total: number;
};
