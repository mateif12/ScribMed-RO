import { Check, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { PROCESSING_STEPS, type ConsultationStatus } from "@/lib/consultation/state-machine";
import { cn } from "@/lib/utils";

export function ProcessingSteps({ status, uploadProgress }: { status: ConsultationStatus; uploadProgress: number }) {
  const activeIndex = PROCESSING_STEPS.findIndex((s) => s.status === status);
  return (
    <div className="space-y-4" aria-live="polite" data-testid="processing-steps">
      <ol className="space-y-3">
        {PROCESSING_STEPS.map((step, i) => {
          const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
          return (
            <li key={step.status} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border text-xs font-semibold",
                  state === "done" && "border-primary bg-primary text-white",
                  state === "active" && "border-primary bg-accent text-primary",
                  state === "pending" && "text-muted-foreground",
                )}
              >
                {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : state === "active" ? <Loader2 className="size-3.5 animate-spin" /> : i + 1}
              </span>
              <span className={cn("text-sm", state === "pending" ? "text-muted-foreground" : "font-medium text-navy")}>{step.label}</span>
            </li>
          );
        })}
      </ol>
      {status === "uploading" ? (
        <div>
          <Progress value={uploadProgress} aria-label="Progres încărcare" />
          <p className="mt-1.5 text-xs text-muted-foreground">{uploadProgress}% încărcat</p>
        </div>
      ) : null}
    </div>
  );
}
