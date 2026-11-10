import { describe, expect, it } from "vitest";
import {
  DIAGNOSIS_NOT_SPECIFIED,
  NOTE_DISCLAIMER,
  NOTE_SECTIONS,
  NOT_RECORDED,
  normalizeNote,
  parseNote,
} from "@/lib/ai/note-format";

describe("note structure enforcement / missing clinical information", () => {
  it("defines exactly the six required sections in order", () => {
    expect(NOTE_SECTIONS.map((s) => s.title)).toEqual([
      "MOTIVELE PREZENTĂRII",
      "ISTORICUL BOLII",
      "ANTECEDENTE ȘI ALERGII",
      "EXAMEN CLINIC OBIECTIV",
      "DIAGNOSTIC PREZUMTIV",
      "PLAN DE TRATAMENT ȘI RECOMANDĂRI",
    ]);
  });

  it("fills missing sections with Neconsemnat and the diagnosis with 'Nespecificat de medic'", () => {
    const { sections, missingHeadings, text } = normalizeNote("1. MOTIVELE PREZENTĂRII\nTuse de 3 zile.");
    expect(sections.motive).toBe("Tuse de 3 zile.");
    expect(sections.istoric).toBe(NOT_RECORDED);
    expect(sections.examen).toBe(NOT_RECORDED);
    expect(sections.diagnostic).toBe(DIAGNOSIS_NOT_SPECIFIED);
    expect(missingHeadings).toEqual(["istoric", "antecedente", "examen", "diagnostic", "plan"]);
    expect(text.match(/^\d\. [A-ZĂÂÎȘȚ ]+$/gmu)).toHaveLength(6);
  });

  it("treats empty sections as missing information", () => {
    const { sections } = normalizeNote("4. EXAMEN CLINIC OBIECTIV\n\n5. DIAGNOSTIC PREZUMTIV\n   \n");
    expect(sections.examen).toBe(NOT_RECORDED);
    expect(sections.diagnostic).toBe(DIAGNOSIS_NOT_SPECIFIED);
  });

  it("parses markdown / unnumbered / diacritic-free headings and reorders sections", () => {
    const raw = [
      "Iată fișa:",
      "## 6. Plan de tratament si recomandari",
      "Repaus.",
      "**MOTIVELE PREZENTARII**",
      "Febră.",
    ].join("\n");
    const parsed = parseNote(raw);
    expect(parsed.plan).toBe("Repaus.");
    expect(parsed.motive).toBe("Febră.");
    const { text } = normalizeNote(raw);
    expect(text.indexOf("MOTIVELE")).toBeLessThan(text.indexOf("PLAN DE TRATAMENT"));
    expect(text).not.toContain("Iată fișa");
  });

  it("exposes the mandatory disclaimer text verbatim", () => {
    expect(NOTE_DISCLAIMER).toBe(
      "Document generat automat ca suport de redactare. Necesită verificarea și validarea medicului curant.",
    );
  });
});
