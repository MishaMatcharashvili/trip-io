import { tripTable } from "@/bll/admin";
import { DataTable } from "../data-table";
import { keepOut } from "../gate";
import { PageHead } from "../page-head";

export default async function Page() {
  const out = await keepOut("/admin/trips");
  if (out) return out;
  const table = await tripTable();
  return (
    <>
      <PageHead title="Customers &amp; trips">
        Every trip with who owns it, whether it is watched and paid for, and
        what the watch has done for it.
      </PageHead>
      <DataTable
        table={table}
        initialSort={{ key: "created", dir: "desc" }}
        empty="No trips yet."
      />
    </>
  );
}
