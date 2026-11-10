import { cn } from "@/lib/utils";

/** Simple 12-bar microphone level meter. */
export function MicLevel({ level, active }: { level: number; active: boolean }) {
  const bars = 12;
  const lit = Math.round(level * bars);
  return (
    <div className="flex h-5 items-end gap-[3px]" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={cn("w-1.5 rounded-full transition-all duration-100", active && i < lit ? "bg-primary" : "bg-border")}
          style={{ height: `${30 + (i / bars) * 70}%` }}
        />
      ))}
    </div>
  );
}
