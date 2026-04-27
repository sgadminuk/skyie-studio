import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Input — Skyie-native. 1px ink border on transparent, no shadow,
 * sharp edges, ink-on-paper text, signal focus ring (the global rule
 * in globals.css does the heavy lifting).
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full bg-transparent border border-ink/30 px-4 py-2",
          "text-ink placeholder:text-ink/45",
          "transition-colors hover:border-ink/60",
          "file:border-0 file:bg-transparent file:text-mono-sm file:text-ink",
          "focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-4 focus-visible:border-ink",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
