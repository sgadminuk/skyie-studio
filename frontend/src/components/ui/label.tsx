"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Label — Skyie-native. Mono-uppercase, thin tracking. Reads more like
 * a HUD readout label than a form label, which is exactly the brief.
 */
const labelVariants = cva(
  "text-mono-sm tracking-[0.16em] text-ink/55 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
)

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
