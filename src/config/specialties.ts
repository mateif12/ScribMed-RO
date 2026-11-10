import type { SpecialtyId } from "@/types/domain";

/**
 * Specialty registry. Each specialty may provide its own clinical template
 * (extra guidance appended to the base system prompt) and a terminology
 * dictionary used for prompt hints. The MVP ships the general-medicine template;
 * the others are declared and selectable once `enabled` is true.
 */
export interface SpecialtyDefinition {
  id: SpecialtyId;
  label: string;
  enabled: boolean;
  /** Extra, specialty-specific guidance appended to the system prompt. */
  templateGuidance: string;
  /** Preferred terminology (colloquial -> professional Romanian). */
  terminology: Record<string, string>;
}

export const SPECIALTIES: Record<SpecialtyId, SpecialtyDefinition> = {
  medicina_generala: {
    id: "medicina_generala",
    label: "Medicină generală",
    enabled: true,
    templateGuidance:
      "Context: consultație de medicină de familie / medicină generală în ambulatoriu. " +
      "Consemnează semnele vitale doar dacă au fost măsurate și rostite de medic.",
    terminology: {
      "durere de cap": "cefalee",
      "amețeală": "vertij / senzație de amețeală (conform descrierii pacientului)",
      "tensiune mare": "valori tensionale crescute",
      "febră": "febră / subfebrilitate (conform valorilor consemnate)",
      "greață": "greață",
      "arsuri la stomac": "pirozis",
      "respirație grea": "dispnee",
      "tuse cu flegmă": "tuse productivă",
    },
  },
  stomatologie: {
    id: "stomatologie",
    label: "Stomatologie",
    enabled: false,
    templateGuidance: "Folosește notația dentară FDI doar dacă a fost rostită explicit.",
    terminology: { "carie": "leziune carioasă", "sângerare gingii": "gingivoragie" },
  },
  dermatologie: {
    id: "dermatologie",
    label: "Dermatologie",
    enabled: false,
    templateGuidance: "Descrie leziunile elementare doar conform descrierii medicului.",
    terminology: { "mâncărime": "prurit", "roșeață": "eritem" },
  },
  psihiatrie: {
    id: "psihiatrie",
    label: "Psihiatrie",
    enabled: false,
    templateGuidance: "Examenul psihic se consemnează strict pe baza observațiilor medicului.",
    terminology: { "insomnie": "insomnie", "stare proastă": "dispoziție scăzută (conform relatării)" },
  },
  oftalmologie: {
    id: "oftalmologie",
    label: "Oftalmologie",
    enabled: false,
    templateGuidance: "Acuitatea vizuală și presiunea intraoculară doar dacă au fost rostite.",
    terminology: { "vedere încețoșată": "vedere încețoșată / scăderea acuității vizuale (relatat)" },
  },
  recuperare_medicala: {
    id: "recuperare_medicala",
    label: "Recuperare medicală",
    enabled: false,
    templateGuidance: "Consemnează testingul articular/muscular doar dacă a fost efectuat și rostit.",
    terminology: { "înțepenire": "redoare articulară" },
  },
  medicina_veterinara: {
    id: "medicina_veterinara",
    label: "Medicină veterinară",
    enabled: false,
    templateGuidance: "Pacientul este un animal; informațiile sunt relatate de proprietar.",
    terminology: {},
  },
};

export const DEFAULT_SPECIALTY: SpecialtyId = "medicina_generala";

export function getSpecialty(id: SpecialtyId | undefined | null): SpecialtyDefinition {
  return SPECIALTIES[id ?? DEFAULT_SPECIALTY] ?? SPECIALTIES[DEFAULT_SPECIALTY];
}

export function listSpecialties(): SpecialtyDefinition[] {
  return Object.values(SPECIALTIES);
}
