import { z } from "zod";
import { SPECIALTY_IDS } from "@/types/domain";
import { isStrongPassword, PASSWORD_POLICY_DESCRIPTION } from "@/lib/auth/password";

const email = z.string().trim().toLowerCase().email("Adresă de e-mail invalidă.").max(254);
const password = z.string().min(1, "Parola este obligatorie.").max(256);
const strongPassword = z.string().max(256).refine(isStrongPassword, PASSWORD_POLICY_DESCRIPTION);
const code = z.string().trim().regex(/^\d{6}$/, "Codul trebuie să aibă 6 cifre.");
const name = z.string().trim().min(2, "Minimum 2 caractere.").max(200);

export const specialtySchema = z.enum(SPECIALTY_IDS);

export const loginSchema = z.object({ email, password }).strict();

export const registerSchema = z
  .object({
    fullName: name,
    email,
    password: strongPassword,
    clinicName: name,
    city: z.string().trim().max(100).optional().or(z.literal("")),
    specialty: specialtySchema.default("medicina_generala"),
    acceptTerms: z.literal(true, { message: "Trebuie să acceptați termenii." }),
  })
  .strict();

export const confirmSignUpSchema = z.object({ email, code }).strict();
export const forgotPasswordSchema = z.object({ email }).strict();
export const resetPasswordSchema = z.object({ email, code, newPassword: strongPassword }).strict();

export const profilePatchSchema = z
  .object({
    fullName: name.optional(),
    title: z.string().trim().max(100).nullable().optional(),
    specialty: specialtySchema.optional(),
    stampCode: z
      .string()
      .trim()
      .max(20)
      .regex(/^[A-Za-z0-9-]*$/, "Cod parafă invalid.")
      .nullable()
      .optional(),
    organization: z
      .object({
        name: name.optional(),
        city: z.string().trim().max(100).nullable().optional(),
        fiscalCode: z
          .string()
          .trim()
          .max(20)
          .regex(/^(RO)?\d{2,10}$/i, "CUI invalid.")
          .nullable()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nu există modificări.");

export const generateNoteSchema = z
  .object({
    transcript: z.string().trim().min(20, "Transcrierea este prea scurtă pentru a genera o fișă.").max(200_000),
    specialty: specialtySchema.optional(),
  })
  .strict();

export const consultationEventSchema = z
  .object({
    type: z.enum(["consultation_started", "session_cleared"]),
    patientInformed: z.boolean().optional(),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type ProfilePatchInput = z.infer<typeof profilePatchSchema>;

/** Formats a Zod error into a safe message (field names + messages only, never values). */
export function zodMessage(err: z.ZodError): string {
  const first = err.issues[0];
  return first ? first.message : "Date invalide.";
}
