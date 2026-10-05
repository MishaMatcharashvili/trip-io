// An operator's page, like the curation queue: a centred line, not the product's skeleton.
export default function Loading() {
  return (
    <main
      className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center text-zinc-600 dark:text-zinc-400"
      aria-busy="true"
    >
      Loading
    </main>
  );
}
