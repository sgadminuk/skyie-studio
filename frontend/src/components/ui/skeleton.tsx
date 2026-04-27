import { cn } from "@/lib/utils";

/**
 * Skeleton — Skyie-native. Sharp edges, ink/8 fill, slow ink/10 pulse.
 * Calmer than the default shadcn skeleton (which over-pulses).
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse bg-ink/8", className)}
      {...props}
    />
  );
}

export { Skeleton };
