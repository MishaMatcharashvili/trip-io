import Link from "next/link";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  // The agent's own actions. One per surface, never two.
  primary: "bg-agent text-white hover:bg-agent-hover",
  secondary: "bg-surface border-control text-ink hover:bg-canvas",
  ghost: "bg-transparent text-ink-muted hover:text-ink",
};

const sizes: Record<Size, string> = {
  sm: "h-[30px] px-3 text-small rounded-control",
  md: "h-[38px] px-[15px] text-[13px] rounded-control",
  lg: "h-11 px-4 text-title rounded-[10px]",
};

type Styling = {
  variant?: Variant;
  size?: Size;
  /** Fills the width of its container — used for the mobile stacked actions. */
  block?: boolean;
  className?: string;
};

function buttonClass({
  variant = "secondary",
  size = "md",
  block,
  className,
}: Styling) {
  return cx(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap border border-transparent font-medium transition-colors",
    variants[variant],
    sizes[size],
    block && "w-full",
    className,
  );
}

export function Button({
  variant,
  size,
  block,
  className,
  type = "button",
  ...rest
}: Styling & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, block, className })}
      {...rest}
    />
  );
}

export function ButtonLink({
  variant,
  size,
  block,
  className,
  ...rest
}: Styling & React.ComponentProps<typeof Link>) {
  return (
    <Link
      className={buttonClass({ variant, size, block, className })}
      {...rest}
    />
  );
}

/** A text action with no chrome — "Keep current plan", "Not interested". */
export function QuietAction({
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx(
        "text-small text-ink-muted transition-colors hover:text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
