// What every admin page shows while it asks who is reading and fetches its rows.
// The nav is in the layout, so only the page under it waits.
export function LoadingLine() {
  return (
    <p
      className="py-16 text-center text-zinc-600 dark:text-zinc-400"
      aria-busy="true"
    >
      Loading
    </p>
  );
}
