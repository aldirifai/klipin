import { cn } from "@/lib/cn";

export function Card({
  className,
  hoverable,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hoverable?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)]",
        hoverable &&
          "transition-colors duration-150 hover:border-[color:var(--border-strong)]",
        className,
      )}
      {...props}
    />
  );
}
