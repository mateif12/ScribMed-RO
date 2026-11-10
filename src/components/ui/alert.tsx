import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva("relative w-full rounded-xl border p-4 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4 [&>svg~*]:pl-7", {
  variants: {
    variant: {
      default: "bg-background text-foreground",
      info: "border-sky-200 bg-sky-50 text-sky-900 [&>svg]:text-sky-600",
      success: "border-emerald-200 bg-accent text-accent-foreground [&>svg]:text-primary",
      warning: "border-amber-200 bg-warning-bg text-amber-900 [&>svg]:text-warning",
      destructive: "border-red-200 bg-red-50 text-red-900 [&>svg]:text-destructive",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Alert({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}
export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h5 className={cn("mb-1 font-semibold leading-none", className)} {...props} />;
}
export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-sm leading-relaxed [&_p]:leading-relaxed", className)} {...props} />;
}
