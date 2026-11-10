/**
 * Minimal non-blocking semaphore: limits how many audio uploads are held in
 * memory simultaneously on one instance. Excess requests are rejected (429 + Retry-After)
 * instead of queued, so memory use stays bounded (≈ limit × MAX_AUDIO_BYTES).
 */
export class Semaphore {
  private active = 0;
  constructor(private readonly limit: () => number) {}

  tryAcquire(): (() => void) | null {
    if (this.active >= this.limit()) return null;
    this.active += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active -= 1;
      }
    };
  }

  get inUse(): number {
    return this.active;
  }
}

const globalForSem = globalThis as unknown as { __scribmedTranscribeSem?: Semaphore };
export function getTranscriptionSemaphore(limit: () => number): Semaphore {
  globalForSem.__scribmedTranscribeSem ??= new Semaphore(limit);
  return globalForSem.__scribmedTranscribeSem;
}
