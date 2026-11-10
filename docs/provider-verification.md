# Verificarea integrărilor AI – ce este confirmat și ce nu

Data verificării: 2026-11-10. Nu au existat credențiale Azure sau AWS în mediul de dezvoltare, deci **niciun apel către serviciile reale nu a fost efectuat**. Distincția de mai jos este strictă:

- **Verificat (sursă oficială)** – confirmat dintr-o specificație/documentație oficială accesată efectiv.
- **Verificat (offline)** – confirmat prin rularea codului real contra unui server local.
- **Neverificat** – trebuie confirmat de operator cu `npm run verify:azure`, `npm run verify:bedrock` și/sau `npm run test:e2e:live`.

## 1. Azure AI Speech – Fast Transcription

| Aspect | Status | Detalii / sursă |
|---|---|---|
| Endpoint `POST {endpoint}/speechtotext/transcriptions:transcribe?api-version=2024-11-15` | Verificat (sursă oficială) | OpenAPI Microsoft: `Azure/azure-rest-api-specs`, `specification/cognitiveservices/data-plane/SpeechToText/stable/2024-11-15/speechtotext.json`, operația `Transcriptions_Transcribe` |
| Autentificare: antet `Ocp-Apim-Subscription-Key` | Verificat (sursă oficială) | `securityDefinitions.api_key` în aceeași specificație |
| `multipart/form-data`: `audio` (fișier) + `definition` (JSON `TranscribeDefinition`) | Verificat (sursă oficială) + (offline) | câmpurile `locales[]`, `profanityFilterMode` (`None`/`Removed`/`Tags`/`Masked`), `diarization {enabled, maxSpeakers}`; corpul trimis este parsat corect de un parser multipart (test `real-adapters.test.ts`) |
| Răspuns `TranscribeResult`: `durationMilliseconds`, `combinedPhrases[].text`, `phrases[]` (`speaker`, `offsetMilliseconds`, …) | Verificat (sursă oficială) | `phrases[].speaker` este atribuit „fără o ordine anume” – aplicația **nu** deduce rolul medic/pacient din numărul vorbitorului |
| Limite fișier: < 2 h și < 250 MB (api-version 2024-11-15) | Verificat (sursă oficială) | descrierea parametrului `audio`. Pagina Microsoft Learn actuală menționează, după rezultatele căutării, 5 h / 500 MB pentru versiuni mai noi. Limitele aplicației (45 min, 40 MiB) sunt mult sub ambele |
| Coduri de eroare (`ErrorCode` enum: `UnsupportedMediaType`, `TooManyRequests`, `Unauthorized`, …) | Verificat (sursă oficială) | aplicația citește **doar** acest câmp enum; mesajele Azure sunt ignorate |
| Lista de locale `GET /speechtotext/transcriptions/locales` → câmpul `Transcribe` | Verificat (sursă oficială) | folosit de `verifyLocale()` / `npm run verify:azure` |
| **ro-RO disponibil pentru fast transcription** | **Neverificat** | se confirmă la rulare cu `npm run verify:azure` (cheia dvs., regiunea dvs.) |
| **Regiunea (ex. `westeurope`) oferă fast transcription** | **Neverificat** | tabelul de regiuni Microsoft nu a putut fi accesat; un anunț din 2024 (preview) menționa West Europe – posibil depășit |
| Formate acceptate | Parțial | Pagina Microsoft Learn (prin rezultate de căutare, pagina nu a putut fi deschisă direct) listează WAV, MP3, OPUS/OGG, FLAC, WMA, AAC, ALAW/MULAW în WAV, AMR, **WebM**, SPEEX. Chrome/Edge/Firefox înregistrează WebM/Opus sau Ogg/Opus → acoperit. **Safari (`audio/mp4`) nu este listat explicit → neverificat**; dacă Azure răspunde `UnsupportedMediaType`, medicul primește un mesaj clar în română |
| Retenția/logarea datelor de către Azure | **Neverificat** | de verificat contractual (DPA) și în documentația Microsoft |
| Versiune API mai nouă `2025-10-15` | Informativ | există în același repo; adaugă `enhancedMode`, `phraseList`, `audioUrl`. Aplicația rămâne pe `2024-11-15` (configurabil prin `AZURE_SPEECH_API_VERSION`) |

## 2. Claude în Amazon Bedrock

| Aspect | Status | Detalii / sursă |
|---|---|---|
| Endpoint `https://bedrock-mantle.{region}.api.aws/anthropic/v1/messages`, corp Messages API | Verificat (sursă oficială) + (offline) | documentația Anthropic „Claude in Amazon Bedrock” (platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock); sonda offline a confirmat calea și corpul |
| ID model Claude Sonnet 5.5 = `anthropic.claude-sonnet-5-5` | Verificat (sursă oficială) | tabelul „Supported models” din aceeași pagină (acces: „See Access” – trebuie activat în consola Bedrock) |
| Semnare SigV4, serviciul `bedrock-mantle`, regiunea `eu-central-1` | Verificat (offline) | SDK-ul instalat (`@anthropic-ai/bedrock-sdk` 1.1.1, `AnthropicBedrockMantle`) a semnat `Credential=…/eu-central-1/bedrock-mantle/aws4_request` cu dependențele existente |
| Permisiune IAM `bedrock-mantle:CreateInference` pe ARN-urile modelelor permise | Verificat (sursă oficială) | documentația Anthropic; **formatul exact al ARN-ului de model pentru bedrock-mantle este neverificat** |
| `temperature` nu este trimis | Verificat (sursă oficială) | SDK-ul trimite `anthropic-version: 2026-10-21`, versiune care respinge `temperature`; Claude Sonnet 5.5 respinge și valori non-implicite |
| Răspunsul poate conține blocuri `thinking` | Verificat (offline) | doar blocurile `text` sunt folosite |
| **Rezidența datelor în eu-central-1** | **Verificat: NU este garantată** | tabelul de regiuni: eu-central-1 = „Global, EU”, **nu** „In-region only”. *Global* = rutare dinamică în toate regiunile (inclusiv non-UE); *EU* = profil de inferență pe geografia UE; regiunile UE marcate „In-region only” sunt **eu-north-1** și **eu-west-1** |
| **Cum se selectează rutarea EU vs Global pe endpoint-ul Mantle** (ID profil EU) | **Neverificat** | pagina trimite la documentația AWS (inaccesibilă din mediu). `npm run verify:bedrock` listează profilurile de inferență vizibile și regiunile în care rutează |
| **Model invocation logging se aplică endpoint-ului bedrock-mantle?** | **Neverificat** | `GetModelInvocationLoggingConfiguration` există (verificat în SDK `@aws-sdk/client-bedrock`) și este verificat de script; aplicabilitatea pentru Mantle trebuie confirmată cu AWS. Documentația Anthropic precizează că oferta emite jurnale în CloudWatch și CloudTrail |
| Retenția datelor | Neverificat | „Data handling for this offering is governed by Amazon Bedrock” – de verificat în *Data protection in Amazon Bedrock* și DPA AWS |
| Fallback server-side (`fallbacks`) | Verificat (sursă oficială): nesuportat pe Bedrock | aplicația folosește un fallback client-side **opțional** (`BEDROCK_FALLBACK_MODEL_ID`), vizibil medicului și jurnalizat |

## 3. Ce demonstrează testele automate

| Test | Ce dovedește | Ce NU dovedește |
|---|---|---|
| `tests/unit/speech-providers.test.ts` | maparea erorilor, retry, termen limită, verificarea localei, formatarea răspunsului | comportamentul serviciului real |
| `tests/integration/real-adapters.test.ts` | codul real (fetch multipart, SDK SigV4) produce cereri conforme contractului | autorizarea/regiunea reale |
| `npm run test:e2e:providers` | fluxul complet din browser (microfon sintetic → adaptorul Azure real → redactare → SDK Bedrock real cu SigV4 → fișă → clipboard → ștergere) contra unor stub-uri care **resping** încălcările de contract și orice identificator neredactat ajuns la LLM | calitatea transcrierii în română, calitatea fișei Claude, latența reală |
| `npm run test:e2e:live` (opțional) | lanțul real complet, cu un fișier WAV **sintetic** furnizat de operator ca intrare de microfon | – (se rulează doar cu credențiale reale) |

## 4. Procedura de acceptanță înainte de producție

1. `npm run verify:azure` → `[OK] Locale ro-RO … suportat`.
2. `npm run verify:azure -- --audio <dialog-sintetic.webm>` → transcriere reușită (înregistrare sintetică, ex. text-to-speech al unui dialog fictiv).
3. `npm run verify:bedrock` → fără `FAIL`; `Invocation logging` = OK; profilurile listate rutează doar în regiuni `eu-*` (dacă rezidența UE este cerință).
4. `LIVE_E2E=1 LIVE_E2E_AUDIO=<dialog-sintetic.wav> npm run test:e2e:live`.
5. Evaluarea calității clinice pe un set de transcrieri sintetice revizuite de medici (nu este automatizată în acest repo).
