export function PageHead({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children && (
        <p className="max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          {children}
        </p>
      )}
    </header>
  );
}
