import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Button — Skyie-native re-skin. Same API + variants as the old shadcn
 * button (callers don't change), but the visuals match the Skyie brand:
 *
 *   - sharp edges, no rounded corners, no shadows
 *   - mono-uppercase, tight tracking
 *   - default: ink fill, paper text, inverts on hover
 *   - outline: ink border, transparent fill, inverts on hover
 *   - secondary: char fill (slightly off ink), paper text
 *   - ghost: no chrome until hover
 *   - destructive: signal-coloured boundary, ink fill on hover
 *   - link: signal-blue underline-on-hover
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "text-mono-sm tracking-[0.18em] uppercase",
    "transition-colors cursor-pointer",
    "focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-4",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-ink text-paper border border-ink hover:bg-paper hover:text-ink",
        destructive:
          "bg-transparent text-destructive border border-destructive hover:bg-destructive hover:text-paper",
        outline:
          "bg-transparent text-ink border border-ink/40 hover:border-ink hover:bg-ink hover:text-paper",
        secondary:
          "bg-char text-paper border border-char hover:bg-paper hover:text-ink hover:border-ink",
        ghost:
          "bg-transparent text-ink/65 border border-transparent hover:text-ink hover:border-ink/15",
        link:
          "text-signal hover:underline underline-offset-4 normal-case tracking-normal",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-3 text-[0.6875rem]",
        lg: "h-12 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
