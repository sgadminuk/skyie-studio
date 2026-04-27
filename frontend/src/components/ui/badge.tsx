import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Badge — Skyie-native. Mono-uppercase, sharp edges, ink-on-paper or
 * paper-on-ink depending on variant.
 *
 *   default     — paper bg, ink text + border  (used as a label tag)
 *   secondary   — char fill, paper text         (used for queued status)
 *   destructive — destructive border, destructive text  (failure state)
 *   outline     — ink/15 border, paper bg, ink text
 */
const badgeVariants = cva(
  "inline-flex items-center px-2 py-0.5 text-mono-sm tracking-[0.16em]",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper border border-ink",
        secondary: "bg-char text-paper border border-char",
        destructive:
          "bg-transparent text-destructive border border-destructive",
        outline: "bg-transparent text-ink border border-ink/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
