import type { Metadata } from "next";
import { AdminNav } from "./nav";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-6 px-4 py-6">
      <AdminNav />
      {children}
    </div>
  );
}
