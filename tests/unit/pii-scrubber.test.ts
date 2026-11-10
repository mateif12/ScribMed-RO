import { describe, expect, it } from "vitest";
import {
  HeuristicRomanianNerProvider,
  NoopNerProvider,
  PII_PLACEHOLDERS,
  applyRedactions,
  containsDeterministicIdentifiers,
  isValidCnpChecksum,
  looksLikeCnp,
  mergeDetections,
  scrubPii,
  scrubPiiSync,
  type NerProvider,
} from "@/lib/security/pii-scrubber";
import { SYNTHETIC_TRANSCRIPTS } from "@/lib/speech/synthetic-transcripts";

const r = (s: string) => scrubPiiSync(s).text;

describe("PII scrubber – examples from the specification", () => {
  it("redacts a CNP", () => {
    expect(r("1840512400123")).toBe("[CNP_ELIMINAT]");
  });
  it("redacts a Romanian mobile number", () => {
    expect(r("0712345678")).toBe("[TELEFON_ELIMINAT]");
  });
  it("redacts an e-mail address", () => {
    expect(r("test@example.com")).toBe("[EMAIL_ELIMINAT]");
  });
});

describe("CNP", () => {
  it("redacts CNPs inside sentences, with separators, and when introduced by keyword", () => {
    expect(r("CNP-ul meu este 1840512400123.")).toBe("CNP-ul meu este [CNP_ELIMINAT].");
    expect(r("Codul este 2950101 123456 acum")).toBe("Codul este [CNP_ELIMINAT] acum");
    expect(r("CNP 1 84 05 12 40 01 23")).toBe("CNP [CNP_ELIMINAT]");
    expect(r("CNP: 18405124")).toBe("CNP: [CNP_ELIMINAT]");
  });
  it("redacts structurally plausible CNPs even with an invalid checksum (over-redaction is safer)", () => {
    expect(isValidCnpChecksum("1840512400123")).toBe(false);
    expect(looksLikeCnp("1840512400123")).toBe(true);
  });
  it("validates checksum correctly for a computed synthetic CNP", () => {
    // digits 184051240012 · weights 279146358279 = 171; 171 mod 11 = 6 → control digit 6
    expect(isValidCnpChecksum("1840512400126")).toBe(true);
  });
  it("does not treat clinical numbers as CNP", () => {
    const text = "TA 140/90 mmHg, glicemie 126 mg/dl, hemoglobină 13,5 g/dl, puls 88.";
    expect(r(text)).toBe(text);
  });
});

describe("Phone numbers", () => {
  it.each([
    ["0712345678", "[TELEFON_ELIMINAT]"],
    ["0712 345 678", "[TELEFON_ELIMINAT]"],
    ["0712-345-678", "[TELEFON_ELIMINAT]"],
    ["+40 712 345 678", "[TELEFON_ELIMINAT]"],
    ["+40712345678", "[TELEFON_ELIMINAT]"],
    ["0040 712 345 678", "[TELEFON_ELIMINAT]"],
    ["021 312 45 67", "[TELEFON_ELIMINAT]"],
    ["0264 123 456", "[TELEFON_ELIMINAT]"],
  ])("redacts %s", (input, expected) => {
    expect(r(`Sunați la ${input}.`)).toBe(`Sunați la ${expected}.`);
  });
  it("does not redact short numbers or dosages", () => {
    const text = "Luați 1000 mg de 2 ori pe zi, timp de 10 zile.";
    expect(r(text)).toBe(text);
  });
});

describe("E-mail", () => {
  it("redacts standard and spoken e-mail addresses", () => {
    expect(r("Scrieți la ion.pop+test@clinica-x.ro acum")).toBe("Scrieți la [EMAIL_ELIMINAT] acum");
    expect(r("adresa e ion punct pop arond gmail punct com")).toContain("[EMAIL_ELIMINAT]");
  });
});

describe("Identity card, passport, IBAN, date of birth, postal code", () => {
  it("redacts ID card series and number", () => {
    expect(r("Buletinul are seria XB nr. 123456.")).toBe("Buletinul are seria [CI_ELIMINAT].");
    expect(r("seria rx numărul 654321")).toBe("seria [CI_ELIMINAT]");
    expect(r("CI KX123456 valabil")).toBe("CI [CI_ELIMINAT] valabil");
  });
  it("redacts passport numbers", () => {
    expect(r("Pașaportul nr. 051234567.")).toBe("Pașaportul nr. [CI_ELIMINAT].");
  });
  it("redacts IBAN", () => {
    expect(r("IBAN RO49 AAAA 1B31 0075 9384 0000")).toBe("IBAN [IBAN_ELIMINAT]");
  });
  it("redacts dates of birth but keeps other dates and ages", () => {
    expect(r("Născută la 12.05.1984, are 42 de ani.")).toBe("Născută la [DATA_NASTERII_ELIMINATA], are 42 de ani.");
    expect(r("Data nașterii: 3 martie 1990")).toBe("Data nașterii: [DATA_NASTERII_ELIMINATA]");
    expect(r("Simptomele au început pe 12.05.2026.")).toBe("Simptomele au început pe 12.05.2026.");
  });
  it("redacts postal codes", () => {
    expect(r("cod poștal 400114")).toBe("cod poștal [COD_POSTAL_ELIMINAT]");
  });
});

describe("Licence plates", () => {
  it.each(["B 123 ABC", "B 12 ABC", "CJ 12 XYZ", "IS-05-ABC", "TM 07 RDX"])("redacts %s", (plate) => {
    expect(r(`Mașina ${plate} e afară.`)).toBe("Mașina [NR_AUTO_ELIMINAT] e afară.");
  });
  it("redacts lowercase plates introduced by a keyword", () => {
    expect(r("numărul de înmatriculare este cj 12 abc")).toBe("numărul de înmatriculare este [NR_AUTO_ELIMINAT]");
  });
  it("does not flag medical abbreviations", () => {
    const text = "EKG normal, HTA grad 2, BPOC, VSH 12 mm/h.";
    expect(r(text)).toBe(text);
  });
});

describe("Names (heuristic NER)", () => {
  it("redacts names introduced by common phrases and their later mentions", () => {
    const out = r("Bună ziua, mă numesc Ion Popescu. Domnul Popescu are 45 de ani.");
    expect(out).toBe("Bună ziua, mă numesc [NUME_ELIMINAT]. Domnul [NUME_ELIMINAT] are 45 de ani.");
  });
  it("handles honorifics, doctors and relatives", () => {
    expect(r("Dr. Maria Ionescu l-a trimis.")).toBe("Dr. [NUME_ELIMINAT] l-a trimis.");
    expect(r("Doamna Elena Vasilescu așteaptă.")).toBe("Doamna [NUME_ELIMINAT] așteaptă.");
    expect(r("Soția mea Ana vine mâine.")).toBe("Soția mea [NUME_ELIMINAT] vine mâine.");
    expect(r("Pacienta Ioana-Maria Dumitru acuză cefalee.")).toBe("Pacienta [NUME_ELIMINAT] acuză cefalee.");
  });
  it("redacts Romanian genitive forms of a detected surname", () => {
    expect(r("Mă numesc Andrei Marinescu. Fișa lui Marinescu.")).toBe("Mă numesc [NUME_ELIMINAT]. Fișa lui [NUME_ELIMINAT].");
  });
  it("does not redact speaker labels or greetings", () => {
    const text = "Doctor: Bună ziua! Pacient: Bună ziua, doamna doctor.";
    expect(r(text)).toBe(text);
  });
  it("documents a known limitation: bare names without a trigger phrase are NOT detected", () => {
    // This test exists to make the limitation explicit – see docs/security.md.
    expect(r("Am vorbit ieri cu Gheorghe despre analize.")).toContain("Gheorghe");
  });
});

describe("Addresses (heuristic NER)", () => {
  it("redacts street addresses with number, block, staircase, apartment", () => {
    expect(r("Locuiesc pe strada Memorandumului nr. 28, bl. A2, sc. 1, ap. 14.")).toBe("Locuiesc pe [ADRESA_ELIMINATA].");
  });
  it("redacts domicile phrases", () => {
    expect(r("Locuiesc în Cluj-Napoca, de zece ani.")).toBe("Locuiesc în [ADRESA_ELIMINATA], de zece ani.");
    expect(r("Stăm la Bulevardul Eroilor 5")).toContain("[ADRESA_ELIMINATA]");
  });
  it("redacts block/apartment fragments", () => {
    expect(r("bloc C3, scara 2, ap. 45")).toBe("[ADRESA_ELIMINATA]");
  });
});

describe("Engine behaviour", () => {
  it("returns per-type counts and total, never the values", () => {
    const res = scrubPiiSync("CNP 1840512400123, tel 0712345678, mail a@b.ro");
    expect(res.counts.CNP).toBe(1);
    expect(res.counts.TELEFON).toBe(1);
    expect(res.counts.EMAIL).toBe(1);
    expect(res.total).toBe(3);
    expect(JSON.stringify(res.counts)).not.toContain("0712345678");
    expect(res.method).toBe("redactare_deterministica_si_euristica");
  });

  it("merges overlapping detections into a single placeholder", () => {
    const merged = mergeDetections([
      { type: "TELEFON", start: 0, end: 10, source: "regex" },
      { type: "CNP", start: 0, end: 13, source: "regex" },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ type: "CNP", start: 0, end: 13 });
    expect(applyRedactions("1840512400123", merged).text).toBe(PII_PLACEHOLDERS.CNP);
  });

  it("supports a replaceable (async) NER provider", async () => {
    const custom: NerProvider = {
      name: "custom",
      detect: async (text) => {
        const i = text.indexOf("Gheorghe");
        return i >= 0 ? [{ type: "NUME", start: i, end: i + 8, source: "ner" }] : [];
      },
    };
    const res = await scrubPii("Am vorbit cu Gheorghe.", custom);
    expect(res.text).toBe("Am vorbit cu [NUME_ELIMINAT].");
  });

  it("still redacts deterministic identifiers when NER is disabled", async () => {
    const res = await scrubPii("Mă numesc Ion Pop, CNP 1840512400123", new NoopNerProvider());
    expect(res.text).toContain("Ion Pop");
    expect(res.text).toContain("[CNP_ELIMINAT]");
  });

  it("is idempotent: scrubbing already-redacted text changes nothing", () => {
    const once = r(SYNTHETIC_TRANSCRIPTS[0]!.text);
    expect(r(once)).toBe(once);
    expect(containsDeterministicIdentifiers(once)).toBe(false);
  });

  it("removes every synthetic direct identifier from the demo transcripts", () => {
    for (const t of SYNTHETIC_TRANSCRIPTS) {
      const out = r(t.text);
      expect(out).not.toMatch(/1840512400123|0712345678|Andrei|Marinescu/);
    }
  });

  it("preserves clinical content of the synthetic transcripts", () => {
    const out = r(SYNTHETIC_TRANSCRIPTS[0]!.text);
    for (const term of ["38,5 grade", "amlodipină 5 miligrame", "penicilină", "135 pe 85", "claritromicină 500 miligrame"]) {
      expect(out).toContain(term);
    }
  });

  it("the heuristic provider is synchronous and named", () => {
    const p = new HeuristicRomanianNerProvider();
    expect(p.name).toBe("heuristic-ro");
    expect(Array.isArray(p.detect("text"))).toBe(true);
  });
});
