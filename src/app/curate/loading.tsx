// The curation queue is an operator's tool, not part of the product's design:
// a centred line, as the page itself is while it has nothing to show.
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
