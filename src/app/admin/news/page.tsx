import { articleTable } from "@/bll/admin";
import { DataTable } from "../data-table";
import { keepOut } from "../gate";
import { PageHead } from "../page-head";

export default async function Page() {
  const out = await keepOut("/admin/news");
  if (out) return out;
  const table = await articleTable();
  return (
    <>
      <PageHead title="News feed">
        Everything the news detectors fetched, newest first, with the outlet it
        came from and what became of it. Open a row for the English the
        extractor read and the original text.
      </PageHead>
      <DataTable
        table={table}
        initialSort={{ key: "fetched", dir: "desc" }}
        empty="No articles fetched yet."
      />
    </>
  );
}
