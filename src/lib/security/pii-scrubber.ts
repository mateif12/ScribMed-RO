/**
 * ScribMed RO – deterministic personal-identifier redaction for Romanian text.
 *
 * WHAT THIS IS
 *   A best-effort *redaction* (de-identification) layer that removes direct
 *   identifiers from consultation transcripts before they are sent to an LLM.
 *   Detected identifiers are replaced with category tags such as
 *   `[CNP_ELIMINAT]`. No re-identification key / mapping table is created or
 *   stored.
 *
 * WHAT THIS IS NOT
 *   - It is NOT anonymisation in the sense of GDPR Recital 26. Clinical
 *     narrative, rare conditions, ages, professions, dates or places can still
 *     allow re-identification. The redacted transcript must therefore still be
 *     treated as personal data concerning health (GDPR Art. 9).
 *   - Regex and heuristic detection cannot be complete. Names and addresses in
 *     particular are detected only in common phrasings (see tests).
 *
 * DESIGN
 *   - Deterministic regex detectors for structured identifiers
 *     (CNP, phone, e-mail, ID card, licence plate, IBAN, date of birth, postal code).
 *   - A replaceable `NerProvider` for contextual entities (names, addresses).
 *     The default `HeuristicRomanianNerProvider` is trigger-phrase based; a
 *     statistical NER service can be plugged in without touching callers.
 *   - Overlapping detections are merged; the longest / highest-priority span wins.
 */

export const PII_TYPES = [
  "CNP",
  "TELEFON",
  "EMAIL",
  "CI",
  "NR_INMATRICULARE",
  "IBAN",
  "DATA_NASTERII",
  "COD_POSTAL",
  "NUME",
  "ADRESA",
] as const;
export type PiiType = (typeof PII_TYPES)[number];

export const PII_PLACEHOLDERS: Record<PiiType, string> = {
  CNP: "[CNP_ELIMINAT]",
  TELEFON: "[TELEFON_ELIMINAT]",
  EMAIL: "[EMAIL_ELIMINAT]",
  CI: "[CI_ELIMINAT]",
  NR_INMATRICULARE: "[NR_AUTO_ELIMINAT]",
  IBAN: "[IBAN_ELIMINAT]",
  DATA_NASTERII: "[DATA_NASTERII_ELIMINATA]",
  COD_POSTAL: "[COD_POSTAL_ELIMINAT]",
  NUME: "[NUME_ELIMINAT]",
  ADRESA: "[ADRESA_ELIMINATA]",
};

/** Higher wins when two detections overlap with equal length. */
const PRIORITY: Record<PiiType, number> = {
  CNP: 100,
  IBAN: 95,
  EMAIL: 90,
  CI: 85,
  TELEFON: 80,
  NR_INMATRICULARE: 70,
  DATA_NASTERII: 65,
  COD_POSTAL: 60,
  ADRESA: 50,
  NUME: 40,
};

export interface PiiDetection {
  type: PiiType;
  start: number;
  end: number;
  source: "regex" | "ner";
}

/** Contextual entity detector (names, addresses). Replaceable. */
export interface NerProvider {
  readonly name: string;
  detect(text: string): PiiDetection[] | Promise<PiiDetection[]>;
}

export interface RedactionResult {
  /** Redacted text. */
  text: string;
  /** Number of redactions per category (counts only – never values). */
  counts: Record<PiiType, number>;
  total: number;
  /** Explicit, honest description of the guarantee level. */
  method: "redactare_deterministica_si_euristica";
}

// ---------------------------------------------------------------------------
// Character classes
// ---------------------------------------------------------------------------
const UPPER = "A-ZĂÂÎȘŞȚŢ";
const LOWER = "a-zăâîșşțţ";
const CAP_WORD = `[${UPPER}][${LOWER}]+(?:-[${UPPER}][${LOWER}]+)?`;

const RO_COUNTY_CODES = [
  "AB", "AR", "AG", "BC", "BH", "BN", "BT", "BV", "BR", "BZ", "CS", "CL", "CJ", "CT", "CV",
  "DB", "DJ", "GL", "GR", "GJ", "HR", "HD", "IL", "IS", "IF", "MM", "MH", "MS", "NT", "OT",
  "PH", "SM", "SJ", "SB", "SV", "TR", "TM", "TL", "VS", "VL", "VN",
];

// ---------------------------------------------------------------------------
// Regex detectors (deterministic)
// ---------------------------------------------------------------------------
interface RegexDetector {
  type: PiiType;
  pattern: RegExp;
  /** Optional: which capture group is the identifier (default whole match). */
  group?: number;
  /** Optional validation of the matched identifier. */
  validate?: (match: string) => boolean;
}

/** 13 digits, optionally separated by single spaces, dots or dashes. */
const CNP_PATTERN = /(?<![\d])[1-9](?:[\s.-]?\d){12}(?![\d])/g;

/**
 * Structural check for a Romanian CNP: S AA LL ZZ JJ NNN C.
 * We intentionally do NOT require a valid checksum – over-redaction is safer
 * than leaking a mistyped/mis-transcribed CNP.
 */
export function looksLikeCnp(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 13) return false;
  const month = Number(digits.slice(3, 5));
  const day = Number(digits.slice(5, 7));
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/** Official CNP checksum (weights 279146358279). Exposed for tests/UI hints. */
export function isValidCnpChecksum(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (!/^\d{13}$/.test(digits)) return false;
  const weights = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const rest = sum % 11;
  const control = rest === 10 ? 1 : rest;
  return control === Number(digits[12]);
}

const REGEX_DETECTORS: RegexDetector[] = [
  // CNP – any 13-digit sequence (with optional separators) and plausible date part.
  { type: "CNP", pattern: CNP_PATTERN, validate: looksLikeCnp },
  // Explicit "CNP ..." mention followed by any long digit run (partial / mis-transcribed CNP).
  {
    type: "CNP",
    pattern: /\b(?:CNP|cod(?:ul)? numeric personal)\s*(?:este|e|:)?\s*((?:\d[\s.-]?){6,13})/giu,
    group: 1,
  },
  // E-mail
  { type: "EMAIL", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // Also spoken form: "ion punct popescu arond gmail punct com"
  {
    type: "EMAIL",
    pattern: /\b[\p{L}\d._-]+(?:\s+punct\s+[\p{L}\d_-]+)*\s+(?:arond|at|a rond)\s+[\p{L}\d-]+(?:\s+punct\s+[\p{L}]{2,})+/giu,
  },
  // IBAN RO
  {
    type: "IBAN",
    pattern: /\bRO\d{2}[\s]?[A-Z]{4}(?:[\s]?[A-Z0-9]{4}){4}\b/gi,
  },
  // Romanian phone numbers: mobile 07xx, landline 02x/03x, +40 / 0040 prefixes.
  {
    type: "TELEFON",
    pattern: /(?<![\d+])(?:(?:\+|00)\s?40[\s.-]?(?:\(0\)\s?)?|0)(?:7\d|[23]\d)(?:[\s.-]?\d){7}(?!\d)/g,
  },
  // ID card: "seria XB nr. 123456" (case-insensitive when anchored by keyword)
  {
    type: "CI",
    pattern: /\bseri[ae]\s+([a-z]{2})\s*,?\s*(?:nr\.?|num[aă]r(?:ul)?)?\s*(\d{6})\b/giu,
  },
  // ID card bare form, uppercase series: "RX 123456" / "KX123456"
  { type: "CI", pattern: /\b[A-Z]{2}\s?\d{6}\b/g },
  // Passport
  {
    type: "CI",
    pattern: /\bpa[sș]aport(?:ul|ului)?\s*(?:nr\.?|num[aă]r(?:ul)?)?\s*:?\s*([A-Z0-9]{6,9})\b/giu,
    group: 1,
  },
  // Licence plates: "B 123 ABC", "CJ 12 XYZ", "IS-05-ABC"
  {
    type: "NR_INMATRICULARE",
    pattern: new RegExp(
      `\\b(?:B[\\s-]?\\d{2,3}|(?:${RO_COUNTY_CODES.join("|")})[\\s-]?\\d{2})[\\s-]?[A-Z]{3}\\b`,
      "g",
    ),
  },
  // Plates introduced by a keyword, case-insensitive (STT may lowercase)
  {
    type: "NR_INMATRICULARE",
    pattern: new RegExp(
      `\\b(?:num[aă]r(?:ul)? de [iî]nmatriculare|nr\\.? auto|num[aă]rul ma[sș]inii)\\s*(?:este|e|:)?\\s*([a-z]{1,2}[\\s-]?\\d{2,3}[\\s-]?[a-z]{3})\\b`,
      "giu",
    ),
    group: 1,
  },
  // Date of birth (numeric): "născut la 12.05.1984", "data nașterii: 12/05/1984"
  {
    type: "DATA_NASTERII",
    pattern:
      /\b(?:n[aă]scut[aă]?|data na[sș]terii|n[aă]scut[aă]? pe|n[aă]scut[aă]? [iî]n)\s*(?:la|pe|[iî]n)?\s*(?:data de\s*)?:?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s+(?:ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie)\s+\d{4})/giu,
    group: 1,
  },
  // Postal code
  { type: "COD_POSTAL", pattern: /\bcod(?:ul)? po[sș]tal\s*:?\s*(\d{6})\b/giu, group: 1 },
];

function runRegexDetectors(text: string): PiiDetection[] {
  const out: PiiDetection[] = [];
  for (const det of REGEX_DETECTORS) {
    det.pattern.lastIndex = 0;
    for (const m of text.matchAll(det.pattern)) {
      if (m.index === undefined) continue;
      let start = m.index;
      let value = m[0];
      if (det.group !== undefined && m[det.group] !== undefined) {
        const groupValue = m[det.group] as string;
        const offset = m[0].indexOf(groupValue);
        start = m.index + offset;
        value = groupValue;
      }
      // CI pattern with two groups: redact series + number together.
      if (det.type === "CI" && det.group === undefined && m[1] && m[2]) {
        const seriesOffset = m[0].indexOf(m[1]);
        start = m.index + seriesOffset;
        value = m[0].slice(seriesOffset);
      }
      const trimmed = value.replace(/[\s.,-]+$/u, "");
      if (det.validate && !det.validate(trimmed)) continue;
      if (trimmed.length === 0) continue;
      out.push({ type: det.type, start, end: start + trimmed.length, source: "regex" });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Heuristic NER for Romanian names and addresses
// ---------------------------------------------------------------------------

/** Words that are capitalised at sentence start but are not names. */
const NAME_STOPWORDS = new Set([
  "Bună", "Buna", "Da", "Nu", "Și", "Si", "Dar", "Deci", "Acum", "Aici", "Am", "Are", "Este", "E",
  "Doctor", "Doctorul", "Doamna", "Domnul", "Pacient", "Pacientul", "Pacienta", "Medic", "Medicul",
  "Vă", "Va", "Mulțumesc", "Multumesc", "Ziua", "Seara", "Dimineața", "Luni", "Marți", "Miercuri",
  "Joi", "Vineri", "Sâmbătă", "Duminică", "Spitalul", "Clinica", "Doctore", "Doamnă",
]);

const NAME_TRIGGERS = [
  "[Mm][aă] numesc",
  "[Nn]umele meu (?:este|e)",
  "[Mm][aă] cheam[aă]",
  "[Nn]umele (?:pacientului|pacientei|copilului|so[tț]ului|so[tț]iei) (?:este|e)",
  "[Dd]omnul(?:ui)?",
  "[Dd]oamn(?:a|ei)",
  "[Dd]omni[sș]oar(?:a|ei)",
  "[Dd]l\\.?",
  "[Dd]na\\.?",
  "[Dd]-(?:l|na|ra)",
  "[Pp]acient(?:ul|a|ului|ei)",
  "[Dd]octor(?:ul|ului|i[tț]a)?",
  "[Dd]r\\.",
  "[Ss]o[tț]ul meu|[Ss]o[tț]ia mea",
  "[Ff]iul meu|[Ff]iica mea|[Mm]ama mea|[Tt]ata(?:l)? meu",
  "[Mm]edicul (?:de familie|curant)",
];

const NAME_REGEX = new RegExp(
  `(?:${NAME_TRIGGERS.join("|")})\\s+(${CAP_WORD}(?:\\s+${CAP_WORD}){0,2})`,
  "gu",
);

const STREET_TRIGGER =
  "(?:[Ss]trad(?:a|ă)|[Ss]tr\\.|[Bb]ulevardul|[Bb]d\\.|[Bb]-dul|[Cc]alea|[Aa]leea|[ȘşŞșSs]oseaua|[Ss]os\\.|[Pp]ia[tț]a|[Ii]ntrarea|[Ss]plaiul)";
const STREET_REGEX = new RegExp(
  `${STREET_TRIGGER}\\s+(?:[${UPPER}0-9][\\p{L}0-9.-]*\\s*){1,4}` +
    `(?:,?\\s*(?:nr\\.?|num[aă]r(?:ul)?)\\s*\\d+[A-Za-z]?)?` +
    `(?:,?\\s*(?:bl(?:oc(?:ul)?)?\\.?)\\s*[A-Z0-9]+)?` +
    `(?:,?\\s*(?:sc(?:ara)?\\.?)\\s*[A-Z0-9]+)?` +
    `(?:,?\\s*(?:et(?:aj(?:ul)?)?\\.?)\\s*\\d+)?` +
    `(?:,?\\s*(?:ap(?:artament(?:ul)?)?\\.?)\\s*\\d+)?`,
  "gu",
);

const BLOCK_REGEX =
  /\b(?:bl(?:oc(?:ul)?)?\.?\s*[A-Z0-9]{1,4}[,\s]+)?(?:sc(?:ara)?\.?\s*[A-Z0-9]{1,2}[,\s]+)?(?:et(?:aj(?:ul)?)?\.?\s*\d{1,2}[,\s]+)?ap(?:artament(?:ul)?)?\.?\s*\d{1,4}\b/giu;

const DOMICILE_REGEX =
  /(?<![\p{L}])(?:[Dd]omiciliat[aă]?|[Ll]ocuie(?:sc|[sș]te|m)|[Ss]t[aă]m|[Aa]dresa (?:mea|lui|ei|pacientului|pacientei) (?:este|e))\s+(?:[iî]n|pe|la)?\s*((?:[\p{Lu}][\p{L}.-]*|nr\.?|\d+[A-Za-z]?)(?:[\s,]+(?:[\p{Lu}][\p{L}.-]*|nr\.?|\d+[A-Za-z]?|bl\.?|sc\.?|ap\.?|et\.?|jude[tț]ul|sectorul|comuna|satul|ora[sș]ul)){0,8})/gu;

export class HeuristicRomanianNerProvider implements NerProvider {
  readonly name = "heuristic-ro";

  detect(text: string): PiiDetection[] {
    const out: PiiDetection[] = [];
    const nameTokens = new Set<string>();

    // Names introduced by trigger phrases
    NAME_REGEX.lastIndex = 0;
    for (const m of text.matchAll(NAME_REGEX)) {
      if (m.index === undefined || !m[1]) continue;
      const words = m[1].split(/\s+/);
      // drop trailing stopwords / leading stopword (e.g. "Doamna Bună")
      while (words.length && NAME_STOPWORDS.has(words[words.length - 1] as string)) words.pop();
      if (!words.length || NAME_STOPWORDS.has(words[0] as string)) continue;
      const nameValue = words.join(" ");
      const start = m.index + m[0].lastIndexOf(m[1]);
      out.push({ type: "NUME", start, end: start + nameValue.length, source: "ner" });
      for (const w of words) if (w.length >= 3) nameTokens.add(w);
    }

    // Re-occurrences of already detected name tokens elsewhere in the text
    for (const token of nameTokens) {
      const re = new RegExp(`(?<![\\p{L}])${escapeRegExp(token)}(?:ului|ei|ul|a)?(?![\\p{L}])`, "gu");
      for (const m of text.matchAll(re)) {
        if (m.index === undefined) continue;
        out.push({ type: "NUME", start: m.index, end: m.index + m[0].length, source: "ner" });
      }
    }

    // Street addresses
    for (const re of [STREET_REGEX, BLOCK_REGEX]) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        if (m.index === undefined) continue;
        const value = m[0].replace(/[\s,.]+$/u, "");
        if (value.length < 4) continue;
        out.push({ type: "ADRESA", start: m.index, end: m.index + value.length, source: "ner" });
      }
    }

    // Domicile phrases ("locuiesc în Cluj-Napoca, strada ...")
    DOMICILE_REGEX.lastIndex = 0;
    for (const m of text.matchAll(DOMICILE_REGEX)) {
      if (m.index === undefined || !m[1]) continue;
      const value = m[1].replace(/[\s,.]+$/u, "");
      if (value.length < 3) continue;
      const start = m.index + m[0].lastIndexOf(m[1]);
      out.push({ type: "ADRESA", start, end: start + value.length, source: "ner" });
    }

    return out;
  }
}

export class NoopNerProvider implements NerProvider {
  readonly name = "none";
  detect(): PiiDetection[] {
    return [];
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Merge & replace
// ---------------------------------------------------------------------------

/** Resolves overlapping detections; union-merges overlapping spans. */
export function mergeDetections(detections: PiiDetection[]): PiiDetection[] {
  const sorted = [...detections]
    .filter((d) => d.end > d.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: PiiDetection[] = [];
  for (const d of sorted) {
    const last = merged[merged.length - 1];
    if (last && d.start < last.end) {
      // Overlap: keep the union span, type of the longer / higher-priority detection.
      const lastLen = last.end - last.start;
      const dLen = d.end - d.start;
      const winner =
        dLen > lastLen || (dLen === lastLen && PRIORITY[d.type] > PRIORITY[last.type]) ? d : last;
      merged[merged.length - 1] = {
        type: winner.type,
        source: winner.source,
        start: Math.min(last.start, d.start),
        end: Math.max(last.end, d.end),
      };
    } else {
      merged.push({ ...d });
    }
  }
  return merged;
}

function emptyCounts(): Record<PiiType, number> {
  return Object.fromEntries(PII_TYPES.map((t) => [t, 0])) as Record<PiiType, number>;
}

export function applyRedactions(text: string, detections: PiiDetection[]): RedactionResult {
  const merged = mergeDetections(detections);
  const counts = emptyCounts();
  let result = "";
  let cursor = 0;
  for (const d of merged) {
    result += text.slice(cursor, d.start) + PII_PLACEHOLDERS[d.type];
    cursor = d.end;
    counts[d.type] += 1;
  }
  result += text.slice(cursor);
  return {
    text: result,
    counts,
    total: merged.length,
    method: "redactare_deterministica_si_euristica",
  };
}

const defaultNer = new HeuristicRomanianNerProvider();

/** Synchronous redaction with the regex detectors + a synchronous NER provider. */
export function scrubPiiSync(text: string, ner: NerProvider = defaultNer): RedactionResult {
  const nerResult = ner.detect(text);
  if (nerResult instanceof Promise) {
    throw new Error("scrubPiiSync necesită un NerProvider sincron");
  }
  return applyRedactions(text, [...runRegexDetectors(text), ...nerResult]);
}

/** Async redaction – supports remote NER providers. */
export async function scrubPii(text: string, ner: NerProvider = defaultNer): Promise<RedactionResult> {
  const nerDetections = await ner.detect(text);
  return applyRedactions(text, [...runRegexDetectors(text), ...nerDetections]);
}

/**
 * Returns true if the text still contains a structured identifier detectable
 * by the deterministic regex layer. Used as a final guard before LLM calls.
 */
export function containsDeterministicIdentifiers(text: string): boolean {
  return runRegexDetectors(text).length > 0;
}
