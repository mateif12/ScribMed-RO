# Arhitectură – ScribMed RO

> Documentație tehnică. (Interfața aplicației este în limba română; documentația tehnică folosește termeni de specialitate în engleză acolo unde sunt standard.)

## 1. Obiectiv și limite

ScribMed RO transformă conversația medic–pacient într-un **draft** de fișă de consultație cu 6 secțiuni. Nu este un sistem de diagnostic, nu ia decizii medicale, nu este EHR/HIS. Medicul verifică, editează și validează fiecare fișă.

## 2. Stack

| Strat | Tehnologie |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict |
| UI | Tailwind CSS v4, componente în stil shadcn/ui (Radix primitives), Lucide |
| Validare | Zod 4 |
| Autentificare | AWS Cognito User Pools (`USER_PASSWORD_AUTH`) sau provider local mock |
| Bază de date | PostgreSQL (≥ 13) prin `pg`, sau store în memorie pentru dezvoltare |
| Speech-to-text | Azure AI Speech – Fast Transcription REST, sau mock |
| LLM | Claude in Amazon Bedrock (`@anthropic-ai/bedrock-sdk`, client `AnthropicBedrockMantle`, endpoint `bedrock-mantle`, SigV4), sau mock |
| Teste | Vitest (unit + integrare, inclusiv adaptoarele reale contra serverelor locale), Playwright (E2E mock, E2E cu adaptoarele reale contra stub-urilor de contract, E2E live opțional) |

## 3. Structura proiectului

```
src/
  app/
    (auth)/login | register | forgot-password     pagini publice de autentificare
    (app)/dashboard, dashboard/profile, dashboard/team, consultation   pagini protejate
    api/                                            route handlers (vezi §5)
    page.tsx                                        landing page
  components/
    ui/            primitive UI (button, card, dialog, …)
    consultation/  spațiul de lucru al consultației, editorul de fișă
    dashboard/ auth/ layout/ brand/
  hooks/use-audio-recorder.ts       captură microfon (MediaRecorder)
  lib/
    ai/            ClinicalNoteProvider, prompt, normalizare fișă, verificări de grounding
    speech/        SpeechToTextProvider (Azure, mock), transcrieri sintetice
    security/      pii-scrubber, NER, rate limiting, logger sigur
    auth/          sesiuni, parole, IdentityProvider (Cognito, mock)
    database/      Repository (PostgreSQL, memorie)
    validation/    scheme Zod, validare audio
    consultation/  state machine, clipboard, capabilități media
    api/           wrapper withApi (auth, CSRF, rate limit, erori), client browser
  services/        logica aplicației (auth, profil, consultație)
  config/          env (validat), specialități
  types/           entități de domeniu
  proxy.ts         CSP cu nonce + protecția paginilor
db/migrations/     schema SQL
scripts/           migrate.ts, seed.ts, verify-azure.ts, verify-bedrock.ts
tests/e2e/stubs/   stub-uri de contract Azure + Bedrock pentru E2E
tests/unit | integration | e2e
```

## 4. Straturi și injectarea dependențelor

```
UI (client components) ──fetch/XHR──▶ API routes (withApi) ──▶ services ──▶ providers / repository
```

- **Providers prin interfețe** – logica aplicației depinde doar de interfețe:
  - `SpeechToTextProvider.transcribe(audio, options?) → Promise<string>` – `AzureSpeechProvider`, `MockSpeechProvider`
  - `ClinicalNoteProvider.generateNote(transcript, specialty?) → Promise<string>` – `BedrockClaudeProvider`, `MockClinicalNoteProvider`
  - `NerProvider.detect(text)` – `HeuristicRomanianNerProvider`, `NoopNerProvider` (înlocuibil cu un serviciu NER statistic)
  - `IdentityProvider` – `CognitoIdentityProvider`, `MockIdentityProvider`
  - `Repository` – `PostgresRepository`, `MemoryRepository`
  - `RateLimiter` – `MemoryRateLimiter` (înlocuibil cu Redis)
- Fabricile (`getSpeechProvider()`, `getClinicalNoteProvider()`, …) aleg implementarea din variabilele de mediu; fiecare are un setter pentru teste.

## 5. API

| Metodă | Rută | Auth | Descriere |
|---|---|---|---|
| GET | `/api/health` | nu | status + modurile providerilor (fără secrete) |
| POST | `/api/auth/login` · `register` · `confirm` · `forgot-password` · `reset-password` · `logout` | nu | ciclul de viață al contului |
| GET / PATCH | `/api/user/profile` | da | profil medic + date clinică (PATCH clinică: owner/admin) |
| GET | `/api/organization/members` | owner/admin | membrii propriei organizații |
| POST | `/api/consultation/events` | da | evenimente operaționale fără conținut (`consultation_started`, `session_cleared`) |
| POST | `/api/transcribe` | da | audio brut în corp → flux NDJSON de progres → transcriere **redactată** |
| POST | `/api/generate-note` | da | transcriere → re-redactare server-side → LLM → fișă normalizată + avertismente |

Nu există niciun endpoint care persistă transcrieri sau fișe.

`withApi()` aplică, în ordine: verificare origine + antet CSRF (pentru metode mutative) → autentificare (token + reîncărcarea utilizatorului din DB) → roluri → rate limit → handler → răspuns `no-store`; erorile sunt mapate la mesaje sigure în română și jurnalizate doar cu metadate.

## 6. Fluxul consultației (client)

State machine pură în `src/lib/consultation/state-machine.ts`:

```
idle → requesting_permission → recording ⇄ paused → uploading → transcribing → redacting → generating_note → completed
                       └────────────── orice stare activă ──────────────▶ error  (retry: start | transcribe | generate)
RESET (din orice stare) → idle, cu ștergerea tuturor datelor clinice din memorie
```

- Stările `transcribing` și `redacting` sunt reale: `/api/transcribe` trimite evenimente NDJSON (`received`, `transcribing`, `redacting`, `done`).
- Upload-ul folosește `XMLHttpRequest` pentru progresul încărcării (fetch nu raportează progresul upload-ului).

## 7. Consultații de 10–30 de minute

- Opus ~32 kbps ⇒ ~7,2 MB / 30 min (calcul: 32 000 bit/s × 1 800 s ÷ 8 = 7 200 000 B). Limita implicită este 40 MiB (`MAX_AUDIO_BYTES`), cu oprire automată la 45 min.
- Azure: se folosește **Fast Transcription** (sincron, pe fișier). API-ul REST „short audio” acceptă doar ~60 s, iar batch transcription cere încărcarea audio într-un storage – ambele nepotrivite.
- `/api/transcribe` este exclus din `proxy.ts`: în Next.js 16, când proxy-ul rulează, corpul cererii este clonat și **trunchiat silențios la 10 MB** (`proxyClientMaxBodySize`). Ruta citește fluxul cu limită strictă și verifică `Content-Length` pentru a detecta upload-uri incomplete.
- Azure: un singur termen limită total (`AZURE_SPEECH_TIMEOUT_MS`) acoperă și reîncercările; Bedrock: timeout per încercare × (reîncercări + 1). `maxDuration` (800 s / 420 s) este setat pentru platformele care îl respectă; pe infrastructură proprie (container/ECS), timeout-urile load balancer-ului trebuie să depășească durata transcrierii (vezi `deployment.md`).
- Platformele serverless pot buferiza corpul cererii pe disc sau pot impune limite de dimensiune; nu presupunem procesare exclusiv în memorie pe astfel de platforme.

## 8. Specialități

`src/config/specialties.ts` definește, per specialitate: `enabled`, `templateGuidance` (adăugat la promptul de sistem) și un dicționar terminologic. În MVP este activă doar **Medicină generală**; celelalte șase sunt declarate și apar ca „în curând”. Activarea unei specialități = completarea șablonului + `enabled: true` + teste.

## 9. Multi-tenancy și SaaS

Entități: `Organization`, `User` (roluri `owner`, `admin`, `doctor`), `DoctorProfile`, `Subscription` (pregătit pentru Stripe: `external_customer_id`, `external_subscription_id`), `UsageEvent` (metrici operaționale). Detalii despre izolare în `security.md`.
