import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/80 text-primary-foreground hover:bg-primary/90 shadow-[0_0_12px_rgba(99,102,241,0.2)]",
        secondary:
          "border-white/[0.06] bg-white/[0.06] text-secondary-foreground hover:bg-white/[0.1]",
        destructive:
          "border-transparent bg-destructive/80 text-destructive-foreground hover:bg-destructive/90",
        outline: "text-foreground border-white/[0.12] bg-white/[0.03]",
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
