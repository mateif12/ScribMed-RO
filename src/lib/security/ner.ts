import "server-only";
import { getEnv } from "@/config/env";
import { HeuristicRomanianNerProvider, NoopNerProvider, type NerProvider } from "./pii-scrubber";

let instance: NerProvider | null = null;

/** Factory for the contextual-entity detector used by the redaction engine. */
export function getNerProvider(): NerProvider {
  if (instance) return instance;
  instance = getEnv().NER_PROVIDER === "none" ? new NoopNerProvider() : new HeuristicRomanianNerProvider();
  return instance;
}

export function setNerProvider(p: NerProvider | null): void {
  instance = p;
}
