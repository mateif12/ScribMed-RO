/**
 * Canonical structure of the generated consultation note and helpers that
 * enforce it regardless of what the model returns.
 */
export const NOT_RECORDED = "Neconsemnat";
export const DIAGNOSIS_NOT_SPECIFIED = "Nespecificat de medic";

export const NOTE_SECTIONS = [
  { id: "motive", title: "MOTIVELE PREZENTĂRII", label: "Motivele prezentării" },
  { id: "istoric", title: "ISTORICUL BOLII", label: "Istoricul bolii" },
  { id: "antecedente", title: "ANTECEDENTE ȘI ALERGII", label: "Antecedente și alergii" },
  { id: "examen", title: "EXAMEN CLINIC OBIECTIV", label: "Examen clinic obiectiv" },
  { id: "diagnostic", title: "DIAGNOSTIC PREZUMTIV", label: "Diagnostic prezumtiv" },
  { id: "plan", title: "PLAN DE TRATAMENT ȘI RECOMANDĂRI", label: "Plan de tratament și recomandări" },
] as const;

export type NoteSectionId = (typeof NOTE_SECTIONS)[number]["id"];
export type NoteSections = Record<NoteSectionId, string>;

export const NOTE_DISCLAIMER =
  "Document generat automat ca suport de redactare. Necesită verificarea și validarea medicului curant.";

function normalizeHeading(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const HEADING_KEYS = NOTE_SECTIONS.map((s) => ({ id: s.id, key: normalizeHeading(s.title) }));

/** Returns the section id if the line is one of the six headings (numbered or not, markdown or not). */
function matchHeading(line: string): NoteSectionId | null {
  const cleaned = line.replace(/^[#*\s]*(?:\d+\s*[.)]\s*)?/, "").replace(/[*:#\s]+$/, "");
  const norm = normalizeHeading(cleaned);
  if (!norm) return null;
  const hit = HEADING_KEYS.find((h) => norm === h.key);
  return hit ? hit.id : null;
}

/** Parses a note into its sections. Text outside headings is ignored. */
export function parseNote(text: string): Partial<NoteSections> {
  const result: Partial<NoteSections> = {};
  let current: NoteSectionId | null = null;
  const buffer: Record<string, string[]> = {};
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const heading = matchHeading(line);
    if (heading) {
      current = heading;
      buffer[current] = buffer[current] ?? [];
      continue;
    }
    if (current) buffer[current]!.push(line);
  }
  for (const [id, lines] of Object.entries(buffer)) {
    result[id as NoteSectionId] = lines.join("\n").trim();
  }
  return result;
}

/** Ensures all six sections exist, in order, with explicit placeholders when empty. */
export function normalizeSections(partial: Partial<NoteSections>): NoteSections {
  const out = {} as NoteSections;
  for (const s of NOTE_SECTIONS) {
    const value = partial[s.id]?.trim();
    if (value) out[s.id] = value;
    else out[s.id] = s.id === "diagnostic" ? DIAGNOSIS_NOT_SPECIFIED : NOT_RECORDED;
  }
  return out;
}

export function formatNote(sections: NoteSections): string {
  return NOTE_SECTIONS.map((s, i) => `${i + 1}. ${s.title}\n${sections[s.id]}`).join("\n\n");
}

/** parse → normalise → format. Guarantees exactly the six required sections. */
export function normalizeNote(raw: string): { text: string; sections: NoteSections; missingHeadings: NoteSectionId[] } {
  const parsed = parseNote(raw);
  const missingHeadings = NOTE_SECTIONS.filter((s) => parsed[s.id] === undefined).map((s) => s.id);
  const sections = normalizeSections(parsed);
  return { text: formatNote(sections), sections, missingHeadings };
}
