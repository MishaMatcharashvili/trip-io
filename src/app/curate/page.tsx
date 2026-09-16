import type { Metadata } from "next";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { isCurator } from "@/lib/curator";
import { CurationQueue } from "./curation-queue";
import { SignIn } from "./sign-in";

export const metadata: Metadata = {
  title: "Curation",
  robots: { index: false },
};

export default async function CuratePage() {
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (!session || session.user.isAnonymous) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Catalogue curation</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Sign in with a curator account to review places.
        </p>
        <SignIn />
      </Centered>
    );
  }

  if (!isCurator(session.user)) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Not a curator</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          {session.user.email} isn&apos;t in <code>CURATOR_EMAILS</code>.
        </p>
      </Centered>
    );
  }

  return <CurationQueue />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      {children}
    </main>
  );
}
