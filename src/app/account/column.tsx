import { Display } from "@/ui/text";

/** The account page's column and its heading, which are the same whoever asks. */
export function AccountColumn({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-5 px-4 pb-28 pt-6 lg:pb-12 lg:pt-10">
      <Display className="text-[26px]">Account</Display>
      {children}
    </main>
  );
}
