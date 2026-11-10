/**
 * Verifies a real Amazon Bedrock setup with SYNTHETIC data only.
 *
 *   BEDROCK_REGION=eu-central-1 BEDROCK_MODEL_ID=<id from your console> npm run verify:bedrock
 *   (add --show to print the generated synthetic note)
 *
 * Checks:
 *  1. Model invocation logging configuration (Bedrock control plane, same region).
 *  2. Inference profiles that reference the configured model, and the regions they route to.
 *  3. One synthetic note generation through the production provider class.
 *
 * Never sends real patient data. Uses the standard AWS credential chain.
 */
import {
  BedrockClient,
  GetModelInvocationLoggingConfigurationCommand,
  ListInferenceProfilesCommand,
} from "@aws-sdk/client-bedrock";
import { BedrockClaudeProvider } from "../src/lib/ai/bedrock-claude-provider";
import { checkGrounding } from "../src/lib/ai/grounding";
import { normalizeNote } from "../src/lib/ai/note-format";
import { scrubPiiSync } from "../src/lib/security/pii-scrubber";
import { SYNTHETIC_TRANSCRIPTS } from "../src/lib/speech/synthetic-transcripts";

type Status = "OK" | "WARN" | "FAIL" | "INFO";
const results: { check: string; status: Status; detail: string }[] = [];
const report = (check: string, status: Status, detail: string) => {
  results.push({ check, status, detail });
  console.info(`[${status}] ${check}: ${detail}`);
};

async function main() {
  const region = process.env.BEDROCK_REGION ?? "eu-central-1";
  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!modelId) {
    console.error("BEDROCK_MODEL_ID lipsește. Setați ID-ul exact (model sau inference profile) din consola Bedrock.");
    process.exit(2);
  }
  const control = new BedrockClient({ region });

  // 1. Invocation logging
  try {
    const res = await control.send(new GetModelInvocationLoggingConfigurationCommand({}));
    const cfg = res.loggingConfig;
    if (!cfg) {
      report("Invocation logging", "OK", `nicio configurație de logging a invocărilor în ${region}`);
    } else {
      const destinations = [cfg.cloudWatchConfig ? "CloudWatch" : null, cfg.s3Config ? "S3" : null].filter(Boolean).join(", ");
      report(
        "Invocation logging",
        cfg.textDataDeliveryEnabled ? "FAIL" : "WARN",
        `configurat (${destinations || "fără destinație"}); textDataDeliveryEnabled=${String(cfg.textDataDeliveryEnabled)}. ` +
          "Prompturile/răspunsurile pot fi stocate – dezactivați pentru ScribMed RO.",
      );
    }
  } catch (e) {
    report("Invocation logging", "WARN", `nu a putut fi citit (${(e as Error).name}); verificați manual în consolă`);
  }
  report(
    "Invocation logging – aplicabilitate",
    "INFO",
    "nu este confirmat din documentația disponibilă dacă setarea se aplică endpoint-ului bedrock-mantle; verificați cu AWS.",
  );

  // 2. Inference profiles referencing the model (routing geography)
  try {
    const needle = modelId.replace(/^(global|eu|us|apac|jp|au)\./, "");
    const profiles: { id: string; regions: string[] }[] = [];
    let nextToken: string | undefined;
    do {
      const page = await control.send(new ListInferenceProfilesCommand({ nextToken, maxResults: 100 }));
      for (const p of page.inferenceProfileSummaries ?? []) {
        const matches = p.inferenceProfileId?.includes(needle) || p.models?.some((m) => m.modelArn?.includes(needle));
        if (matches && p.inferenceProfileId) {
          const regions = [...new Set((p.models ?? []).map((m) => m.modelArn?.split(":")[3] ?? "?"))];
          profiles.push({ id: p.inferenceProfileId, regions });
        }
      }
      nextToken = page.nextToken;
    } while (nextToken);
    if (profiles.length === 0) {
      report("Inference profiles", "INFO", `niciun profil listat pentru „${needle}” în ${region} (endpoint-ul Mantle poate folosi alt mecanism de rutare)`);
    }
    for (const p of profiles) {
      const outsideEu = p.regions.filter((r) => !r.startsWith("eu-"));
      report(
        `Profil ${p.id}`,
        outsideEu.length ? "WARN" : "OK",
        `regiuni: ${p.regions.join(", ")}${outsideEu.length ? " – include regiuni din afara UE" : " – doar UE"}`,
      );
    }
  } catch (e) {
    report("Inference profiles", "WARN", `nu au putut fi listate (${(e as Error).name})`);
  }

  // 3. Synthetic invocation through the production provider
  const transcript = scrubPiiSync(SYNTHETIC_TRANSCRIPTS[0]!.text).text;
  const provider = new BedrockClaudeProvider({
    region,
    modelId,
    maxTokens: Number(process.env.BEDROCK_MAX_TOKENS ?? 16000),
    timeoutMs: Number(process.env.BEDROCK_TIMEOUT_MS ?? 180000),
    maxRetries: 0,
    endpointUrl: process.env.BEDROCK_ENDPOINT_URL,
    effort: (process.env.BEDROCK_EFFORT as "low" | "medium" | "high" | undefined) || undefined,
  });
  const started = Date.now();
  try {
    const gen = await provider.generateNoteWithMetadata(transcript, "medicina_generala");
    const normalized = normalizeNote(gen.text);
    const warnings = checkGrounding(normalized.text, transcript);
    report(
      "Generare fișă (sintetic)",
      normalized.missingHeadings.length ? "WARN" : "OK",
      `model=${gen.model}, ${Date.now() - started} ms, ${gen.text.length} caractere, secțiuni lipsă: ${normalized.missingHeadings.join(", ") || "niciuna"}, avertismente grounding: ${warnings.length}`,
    );
    if (process.argv.includes("--show")) console.info(`\n${normalized.text}\n`);
  } catch (e) {
    const err = e as { kind?: string; status?: number | null; message: string };
    report("Generare fișă (sintetic)", "FAIL", `${err.kind ?? "error"} (HTTP ${err.status ?? "-"}): ${err.message}`);
  }

  const failed = results.some((r) => r.status === "FAIL");
  console.info(failed ? "\nRezultat: EȘEC" : "\nRezultat: verificări finalizate (revizuiți WARN/INFO)");
  process.exit(failed ? 1 : 0);
}

void main();
