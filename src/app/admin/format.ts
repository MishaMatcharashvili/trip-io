import type { Cell, CellFormat } from "@/domain/admin/table.ts";

const stamp = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tbilisi",
  day: "numeric",
  month: "short",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** An instant on the operator's clock (Tbilisi), to the minute. */
export const when = (iso: string): string => stamp.format(new Date(iso));

export function show(cell: Cell | undefined, format: CellFormat = "text") {
  if (cell === null || cell === undefined || cell === "") return "—";
  switch (format) {
    case "date":
      return when(String(cell));
    case "number":
      return typeof cell === "number"
        ? cell.toLocaleString("en-GB")
        : String(cell);
    case "amount":
      return typeof cell === "number" && cell !== 0
        ? cell.toLocaleString("en-GB", { minimumFractionDigits: 2 })
        : "—";
    case "yesno":
      return cell === true ? "yes" : cell === false ? "no" : String(cell);
    default:
      return String(cell);
  }
}
