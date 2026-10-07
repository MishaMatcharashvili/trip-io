import { regionTable } from "@/bll/admin";
import { DataTable } from "../data-table";
import { keepOut } from "../gate";
import { PageHead } from "../page-head";

export default async function Page() {
  const out = await keepOut("/admin/regions");
  if (out) return out;
  const table = await regionTable();
  return (
    <>
      <PageHead title="Regions">
        The sixty-four sensing regions and what is going on in each. Sort by
        trips ahead to see where travellers will be.
      </PageHead>
      <DataTable table={table} empty="No regions." />
    </>
  );
}
