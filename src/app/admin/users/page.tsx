import { userTable } from "@/bll/admin";
import { DataTable } from "../data-table";
import { keepOut } from "../gate";
import { PageHead } from "../page-head";

export default async function Page() {
  const out = await keepOut("/admin/users");
  if (out) return out;
  const table = await userTable();
  return (
    <>
      <PageHead title="Users">Everyone who has opened the product</PageHead>
      <DataTable
        table={table}
        initialSort={{ key: "joined", dir: "desc" }}
        empty=" accounts and the guests who planned a trip before signing up. Open a name for their sessions, devices and trips.:There is nobody yet."
      />
    </>
  );
}
