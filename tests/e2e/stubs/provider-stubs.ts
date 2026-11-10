/**
 * Local contract stubs for Azure AI Speech (Fast Transcription, api-version
 * 2024-11-15) and Claude in Amazon Bedrock (Messages API on bedrock-mantle).
 *
 * The REAL production adapters (AzureSpeechProvider, AnthropicBedrockMantle via
 * BedrockClaudeProvider) talk to this server in the "providers" E2E suite.
 * Requests that violate the verified contracts are rejected, so the browser
 * test fails if the integration drifts. SYNTHETIC data only.
 *
 * Run: npx tsx tests/e2e/stubs/provider-stubs.ts   (PORT env, default 4010)
 */
import http from "node:http";

const PORT = Number(process.env.STUB_PORT ?? 4010);
export const STUB_AZURE_KEY = "stub-azure-key";
const EXPECTED_MODEL = process.env.STUB_EXPECTED_MODEL ?? "anthropic.claude-sonnet-5-5";

/** Synthetic transcript as Azure returns it without diarization: no speaker labels. Fictional identifiers. */
const SYNTHETIC_COMBINED_PHRASES = [
  "Bună ziua, luați loc. Ce vă aduce astăzi la noi?",
  "Bună ziua. Mă numesc Andrei Marinescu, CNP-ul meu este 1840512400123. Mă doare foarte tare în gât de trei zile.",
  "Aseară am avut febră, 38,5 grade. Sunt alergic la penicilină. Mă puteți suna la 0712345678.",
  "Temperatura este 37,9 grade. Faringele este congestionat, amigdalele sunt mărite.",
  "Cel mai probabil este o amigdalită acută. Vă recomand paracetamol 500 miligrame la nevoie și hidratare.",
];

/** Direct identifiers that must NEVER reach the LLM stub. */
const FORBIDDEN_IN_LLM = ["1840512400123", "0712345678", "Marinescu", "Andrei"];

const stats = { azureTranscribe: 0, azureLocales: 0, bedrock: 0, leaks: 0, contractViolations: [] as string[] };

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function violation(res: http.ServerResponse, status: number, code: string, what: string) {
  stats.contractViolations.push(what);
  json(res, status, { code, message: `stub contract violation: ${what}` });
}

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

async function handleAzureTranscribe(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  if (url.searchParams.get("api-version") !== "2024-11-15") return violation(res, 400, "InvalidRequest", "api-version");
  if (req.headers["ocp-apim-subscription-key"] !== STUB_AZURE_KEY) return violation(res, 401, "Unauthorized", "subscription key");
  const ct = req.headers["content-type"] ?? "";
  if (!ct.startsWith("multipart/form-data")) return violation(res, 415, "UnsupportedMediaType", "content-type");
  const body = await readBody(req);
  const form = await new Request("http://stub/", { method: "POST", headers: { "content-type": ct }, body: new Uint8Array(body) }).formData();
  const audio = form.get("audio");
  const definition = form.get("definition");
  if (!(audio instanceof Blob) || audio.size < 1024) return violation(res, 400, "InvalidArgument", "audio part");
  if (!["audio/webm", "audio/ogg", "audio/wav"].includes(audio.type)) return violation(res, 415, "UnsupportedMediaType", `audio type ${audio.type}`);
  let def: { locales?: string[]; profanityFilterMode?: string };
  try {
    def = JSON.parse(String(definition));
  } catch {
    return violation(res, 400, "InvalidArgument", "definition json");
  }
  if (JSON.stringify(def.locales) !== JSON.stringify(["ro-RO"])) return violation(res, 400, "InvalidArgument", "locales");
  if (def.profanityFilterMode && !["None", "Removed", "Tags", "Masked"].includes(def.profanityFilterMode))
    return violation(res, 400, "InvalidArgument", "profanityFilterMode");
  stats.azureTranscribe += 1;
  let offset = 0;
  json(res, 200, {
    durationMilliseconds: 61_000,
    combinedPhrases: [{ text: SYNTHETIC_COMBINED_PHRASES.join(" ") }],
    phrases: SYNTHETIC_COMBINED_PHRASES.map((text) => {
      const p = { offsetMilliseconds: offset, durationMilliseconds: 10_000, text, locale: "ro-RO", confidence: 0.9 };
      offset += 12_000;
      return p;
    }),
  });
}

async function handleBedrock(req: http.IncomingMessage, res: http.ServerResponse) {
  const auth = req.headers.authorization ?? "";
  if (!/^AWS4-HMAC-SHA256 Credential=[^/]+\/\d{8}\/eu-central-1\/bedrock-mantle\/aws4_request/.test(auth))
    return violation(res, 403, "AccessDenied", "SigV4 signature for eu-central-1/bedrock-mantle");
  if (!req.headers["x-amz-date"]) return violation(res, 403, "AccessDenied", "x-amz-date");
  const body = JSON.parse((await readBody(req)).toString("utf8")) as Record<string, unknown>;
  if (body.model !== EXPECTED_MODEL) return violation(res, 404, "not_found_error", `model ${String(body.model)}`);
  if ("temperature" in body) return violation(res, 400, "invalid_request_error", "temperature must not be sent");
  const system = String(body.system ?? "");
  if (!system.includes("You are a Romanian medical documentation assistant.") || !system.includes('write "Nespecificat de medic"'))
    return violation(res, 400, "invalid_request_error", "system prompt rules");
  const messages = body.messages as Array<{ role: string; content: string }>;
  const content = messages?.[0]?.content ?? "";
  if (!content.includes("<transcriere>")) return violation(res, 400, "invalid_request_error", "transcript wrapper");
  for (const id of FORBIDDEN_IN_LLM) {
    if (JSON.stringify(body).includes(id)) {
      stats.leaks += 1;
      return violation(res, 400, "invalid_request_error", "UNREDACTED IDENTIFIER REACHED THE LLM");
    }
  }
  stats.bedrock += 1;
  json(res, 200, {
    id: "msg_stub",
    type: "message",
    role: "assistant",
    model: EXPECTED_MODEL,
    stop_reason: "end_turn",
    content: [
      { type: "thinking", thinking: "", signature: "stub" },
      {
        type: "text",
        text: [
          "1. MOTIVELE PREZENTĂRII",
          "Odinofagie de 3 zile (relatat de pacient).",
          "",
          "2. ISTORICUL BOLII",
          "Pacientul relatează febră 38,5 °C în seara precedentă.",
          "",
          "3. ANTECEDENTE ȘI ALERGII",
          "Alergie la penicilină (relatat). Alte antecedente: Neconsemnat.",
          "",
          "4. EXAMEN CLINIC OBIECTIV",
          "Temperatură 37,9 °C. Faringe congestionat, amigdale hipertrofice.",
          "",
          "5. DIAGNOSTIC PREZUMTIV",
          "Amigdalită acută (formulare a medicului: „cel mai probabil”).",
          "",
          "6. PLAN DE TRATAMENT ȘI RECOMANDĂRI",
          "Paracetamol 500 mg la nevoie. Hidratare.",
        ].join("\n"),
      },
    ],
    usage: { input_tokens: 100, output_tokens: 100 },
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://stub");
    if (req.method === "POST" && url.pathname === "/speechtotext/transcriptions:transcribe") return await handleAzureTranscribe(req, res, url);
    if (req.method === "GET" && url.pathname === "/speechtotext/transcriptions/locales") {
      if (req.headers["ocp-apim-subscription-key"] !== STUB_AZURE_KEY) return violation(res, 401, "Unauthorized", "subscription key");
      stats.azureLocales += 1;
      return json(res, 200, { Transcribe: ["en-US", "ro-RO"], Submit: ["en-US", "ro-RO"] });
    }
    if (req.method === "POST" && url.pathname === "/anthropic/v1/messages") return await handleBedrock(req, res);
    if (req.method === "GET" && url.pathname === "/__stub/stats") return json(res, 200, stats);
    if (req.method === "GET" && url.pathname === "/__stub/health") return json(res, 200, { ok: true });
    json(res, 404, { code: "NotFound" });
  } catch {
    json(res, 500, { code: "InternalServerError" });
  }
});

server.listen(PORT, () => console.info(`provider stubs listening on ${PORT}`));
