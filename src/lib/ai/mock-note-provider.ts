import type { SpecialtyId } from "@/types/domain";
import { DIAGNOSIS_NOT_SPECIFIED, NOT_RECORDED, formatNote, type NoteSections } from "./note-format";
import type { ClinicalNoteProvider } from "./types";

/**
 * Deterministic, rule-based note generator for development and tests.
 *
 * It never adds information: every sentence in the output is taken from the
 * transcript (light rephrasing of speaker framing only). Sections with no
 * matching content are filled with "Neconsemnat" / "Nespecificat de medic".
 * This makes it a useful baseline for the hallucination-prevention tests –
 * but it is NOT a clinical-grade summariser.
 */

type Speaker = "doctor" | "patient" | "unknown";
interface Utterance {
  speaker: Speaker;
  sentence: string;
}

const DOCTOR_LABELS = /^(doctor|doctorul|medic|medicul|dr\.?)\s*:/i;
const PATIENT_LABELS = /^(pacient|pacientul|pacienta)\s*:/i;
/** Diarization labels ("Vorbitor N") carry no role information – treated as unknown speaker. */
const NEUTRAL_LABELS = /^vorbitor\s+\S+\s*:/i;

const RX = {
  complaint: /(m[aă] doare|m[aă] dor|am venit|acuz|dureri?|am (?:o )?(?:tuse|febr[aă]|grea[tț][aă]|ame[tț]eal[aă])|nu m[aă] simt|problema)/i,
  history:
    /(de (?:\w+ )?(?:zile|zi|s[aă]pt[aă]m[aâ]ni|s[aă]pt[aă]m[aâ]n[aă]|luni|ani|ieri)|a [iî]nceput|s-a agravat|am luat|am avut|noaptea|diminea[tț]a|iradiaz[aă]|am m[aă]surat|valori|uneori|m[aă] simt)/i,
  background:
    /(alergi[ck]|hipertensiune|diabet|astm|operat|interven[tț]ie|boal[aă] cronic|tratament (?:zilnic|cronic)|iau zilnic|iau tratamentul|fumez|fuma[tț]i|am renun[tț]at|nu am alte boli|nu iau niciun|antecedente|iau (?:\w+ )?\d+ miligrame|\d+ miligrame (?:diminea[tț]a|de dou[aă] ori))/i,
  exam:
    /(temperatura este|tensiunea(?: arterial[aă])? (?:este )?\d|tensiunea este|pulsul|satura[tț]ia|faringele|amigdal|ganglion|murmur|raluri|zgomotele cardiace|abdomen|la palpare|palpare|manevra|for[tț]a muscular|musculatura|tegumente|auscult|examinez|examen)/i,
  diagnosis:
    /(diagnostic|cel mai probabil|pare s[aă] fie|suspectez|avem de-a face|(?<![\p{L}])este o |nu stabilim)/iu,
  plan:
    /(recomand|prescriu|s[aă] lua[tț]i|pute[tț]i lua|lua[tț]i|cre[sș]tem|sc[aă]dem|tratament|reveni[tț]i|control|analize|radiografi|test rapid|facem|hidratare|repaus|evita[tț]i|nota[tț]i)/i,
};

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[\p{Lu}[])/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseTranscript(transcript: string): Utterance[] {
  const utterances: Utterance[] = [];
  for (const rawLine of transcript.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let speaker: Speaker = "unknown";
    let content = line;
    if (DOCTOR_LABELS.test(line)) {
      speaker = "doctor";
      content = line.replace(DOCTOR_LABELS, "").trim();
    } else if (PATIENT_LABELS.test(line)) {
      speaker = "patient";
      content = line.replace(PATIENT_LABELS, "").trim();
    } else if (NEUTRAL_LABELS.test(line)) {
      content = line.replace(NEUTRAL_LABELS, "").trim();
    }
    for (const sentence of splitSentences(content)) utterances.push({ speaker, sentence });
  }
  return utterances;
}

/** Removes de-identification placeholders and greetings from a sentence. */
function clean(sentence: string): string {
  return sentence
    .replace(/,?\s*(?:CNP-ul meu este|m[aă] numesc|numele meu este)\s*\[[A-Z_]+\]\s*,?/gi, "")
    .replace(/\s*(?:Pute[tț]i s[aă] m[aă] suna[tț]i|M[aă] pute[tț]i suna) la \[TELEFON_ELIMINAT\]\.?/gi, "")
    .replace(/\[[A-Z_]+_ELIMINATA?\]/g, "")
    .replace(/^(?:Bun[aă] (?:ziua|diminea[tț]a|seara)[,.!]?\s*(?:doamna doctor|domnule doctor)?[,.!]?\s*)/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .trim();
}

function isQuestion(s: string): boolean {
  return s.trim().endsWith("?");
}

function asPatientReport(sentences: string[]): string {
  if (!sentences.length) return "";
  return sentences.map((s) => `- Pacientul relatează: „${s.replace(/[.]$/, "")}”.`).join("\n");
}

function asDoctorStatement(sentences: string[]): string {
  return sentences.map((s) => `- ${s}`).join("\n");
}

export function buildMockSections(transcript: string): NoteSections {
  const utterances = parseTranscript(transcript)
    .map((u) => ({ ...u, sentence: clean(u.sentence) }))
    .filter((u) => u.sentence.length > 2 && !isQuestion(u.sentence));

  const used = new Set<string>();
  const take = (filter: (u: Utterance) => boolean, limit = 6): string[] => {
    const out: string[] = [];
    for (const u of utterances) {
      if (out.length >= limit) break;
      if (used.has(u.sentence) || !filter(u)) continue;
      used.add(u.sentence);
      out.push(u.sentence);
    }
    return out;
  };

  const notDoctor = (u: Utterance) => u.speaker !== "doctor";
  const isDoctor = (u: Utterance) => u.speaker === "doctor";

  // Order matters: more specific categories first so sentences are not duplicated.
  const background = take((u) => notDoctor(u) && RX.background.test(u.sentence));
  const complaint = take((u) => notDoctor(u) && RX.complaint.test(u.sentence), 2);
  const history = take((u) => notDoctor(u) && RX.history.test(u.sentence));
  const exam = take((u) => isDoctor(u) && RX.exam.test(u.sentence) && !RX.diagnosis.test(u.sentence));
  const diagnosis = take((u) => isDoctor(u) && RX.diagnosis.test(u.sentence), 2);
  const plan = take((u) => isDoctor(u) && RX.plan.test(u.sentence) && !/lua[tț]i loc|a[tț]i venit/i.test(u.sentence), 8);

  const examText = exam
    .map((s) => s.replace(/^(?:Bun\.\s*)?(?:Acum v[aă] examinez\.?|Ascult pl[aă]mânii\.?|Deschide[tț]i gura, v[aă] rog\.?|V[aă] rog s[aă] v[aă] [iî]ntinde[tț]i pe canapea\.?)\s*/i, ""))
    .filter((s) => s.length > 3);

  return {
    motive: asPatientReport(complaint) || NOT_RECORDED,
    istoric: asPatientReport(history) || NOT_RECORDED,
    antecedente: asPatientReport(background) || NOT_RECORDED,
    examen: examText.length ? asDoctorStatement(examText) : NOT_RECORDED,
    diagnostic: diagnosis.length ? asDoctorStatement(diagnosis) : DIAGNOSIS_NOT_SPECIFIED,
    plan: plan.length ? asDoctorStatement(plan) : NOT_RECORDED,
  };
}

export class MockClinicalNoteProvider implements ClinicalNoteProvider {
  readonly name = "mock";
  constructor(private readonly latencyMs = 0) {}

  async generateNote(transcript: string, _specialty?: SpecialtyId): Promise<string> {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
    return formatNote(buildMockSections(transcript));
  }
}
