import { cn } from "@/lib/cn";

export function Card({
  className,
  hoverable,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hoverable?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/5 bg-zinc-900/60 backdrop-blur",
        hoverable &&
          "transition-all duration-200 hover:-translate-y-0.5 hover:border-white/10 hover:bg-zinc-900/80",
        className,
      )}
      {...props}
    />
  );
}
