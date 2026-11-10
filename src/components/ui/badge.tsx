import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3", {
  variants: {
    variant: {
      default: "bg-accent text-accent-foreground",
      navy: "bg-navy text-white",
      secondary: "bg-secondary text-secondary-foreground",
      outline: "border text-muted-foreground",
      destructive: "bg-red-50 text-destructive",
      warning: "bg-warning-bg text-warning",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
