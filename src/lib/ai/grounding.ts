/**
 * Post-generation grounding checks (hallucination guard-rails).
 *
 * These are heuristic checks that surface warnings to the doctor; they do not
 * prove the note is correct. The doctor's review remains mandatory.
 */

export interface GroundingWarning {
  code: "UNGROUNDED_NUMBER" | "MISSING_SECTION" | "PLACEHOLDER_LEAK" | "POSSIBLE_REIDENTIFICATION" | "FALLBACK_MODEL_USED";
  message: string;
}

const NUMBER_WITH_UNIT =
  /(\d+(?:[.,]\d+)?)\s*(mg|miligrame|g|grame|ml|mililitri|mmhg|bpm|°c|grade|%|ui|zile|ore|săptămâni|luni|ani|pe minut|\/min)/giu;

const NUMBER_WORDS: Record<string, string> = {
  unu: "1", una: "1", un: "1", o: "1", doi: "2", două: "2", trei: "3", patru: "4", cinci: "5", șase: "6",
  șapte: "7", opt: "8", nouă: "9", zece: "10",
};

function normalizeNumber(n: string): string {
  return n.replace(",", ".").replace(/\.0+$/, "");
}

function collectNumbers(text: string): Set<string> {
  const nums = new Set<string>();
  for (const m of text.matchAll(/\d+(?:[.,]\d+)?/g)) nums.add(normalizeNumber(m[0]));
  for (const w of text.toLowerCase().split(/[^\p{L}]+/u)) {
    const n = NUMBER_WORDS[w];
    if (n) nums.add(n);
  }
  return nums;
}

/** Flags numeric values with units (doses, vitals, durations) that do not appear in the transcript. */
export function checkGrounding(note: string, transcript: string): GroundingWarning[] {
  const warnings: GroundingWarning[] = [];
  const transcriptNumbers = collectNumbers(transcript);
  const seen = new Set<string>();
  for (const m of note.matchAll(NUMBER_WITH_UNIT)) {
    const value = normalizeNumber(m[1] ?? "");
    if (!transcriptNumbers.has(value) && !seen.has(m[0])) {
      seen.add(m[0]);
      warnings.push({
        code: "UNGROUNDED_NUMBER",
        message: `Valoarea „${m[0].trim()}” nu a fost identificată în transcriere. Verificați înainte de utilizare.`,
      });
    }
  }
  return warnings;
}
