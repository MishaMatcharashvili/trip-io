import { sourceTable } from "@/bll/admin";
import { DataTable } from "../data-table";
import { keepOut } from "../gate";
import { PageHead } from "../page-head";

export default async function Page() {
  const out = await keepOut("/admin/sources");
  if (out) return out;
  const table = await sourceTable();
  return (
    <>
      <PageHead title="Sources">
        Every outlet and detector that has delivered anything, how much, how
        recently, and what the extractor made of it.
      </PageHead>
      <DataTable
        table={table}
        initialSort={{ key: "lastAt", dir: "desc" }}
        empty="Nothing has been delivered yet."
      />
    </>
  );
}
