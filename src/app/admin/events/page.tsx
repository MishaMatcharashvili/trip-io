import { eventTable } from "@/bll/admin";
import { DataTable } from "../data-table";
import { keepOut } from "../gate";
import { PageHead } from "../page-head";

export default async function Page() {
  const out = await keepOut("/admin/events");
  if (out) return out;
  const table = await eventTable();
  return (
    <>
      <PageHead title="Region updates">
        Every world event the detectors wrote, newest first
      </PageHead>
      <DataTable
        table={table}
        initialSort={{ key: "observed", dir: "desc" }}
        empty=" forecasts, road and rail reports, opening hours, local events and safety notices, with the region each applies to and how many trips it touched.:No events yet."
      />
    </>
  );
}
