import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full bg-transparent border border-ink/30 px-4 py-3",
        "text-ink placeholder:text-ink/45 leading-relaxed",
        "transition-colors hover:border-ink/60",
        "focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-4 focus-visible:border-ink",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "resize-y",
        className,
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
