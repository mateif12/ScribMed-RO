# Variabile de mediu

Toate variabilele sunt citite **exclusiv pe server** și validate cu Zod la prima utilizare (`src/config/env.ts`). Valorile goale (`VAR=`) sunt tratate ca nesetate. Nu există variabile `NEXT_PUBLIC_*`.

| Variabilă | Implicit | Obligatorie | Descriere |
|---|---|---|---|
| `NODE_ENV` | `development` | – | `production` activează verificările *fail-closed* |
| `APP_URL` | `http://localhost:3000` | prod | URL-ul public; origine permisă pentru CSRF; `https://` activează cookie `Secure` și `upgrade-insecure-requests` |
| `ALLOWED_ORIGINS` | – | nu | origini suplimentare acceptate de verificarea CSRF și de preflight-ul CORS. Răspunsurile API nu includ `Access-Control-Allow-Origin`, deci citirea cross-origin rămâne blocată (aplicația este same-origin) |
| `SESSION_SECRET` | secret de dezvoltare | **prod** | ≥ 32 caractere aleatorii (`openssl rand -base64 48`) |
| `SESSION_TTL_HOURS` | `8` | nu | durata sesiunii (1–24) |
| `AUTH_PROVIDER` | `mock` | – | `mock` sau `cognito` |
| `ALLOW_MOCK_AUTH_IN_PRODUCTION` | `false` | nu | permite mock auth în producție (doar demo-uri) |
| `COGNITO_REGION` | `eu-central-1` | cognito | regiunea User Pool |
| `COGNITO_USER_POOL_ID` | – | cognito | ex. `eu-central-1_AbCdEf123` |
| `COGNITO_CLIENT_ID` | – | cognito | ID app client |
| `COGNITO_CLIENT_SECRET` | – | nu | doar dacă app client-ul are secret (se calculează `SECRET_HASH`) |
| `DATABASE_PROVIDER` | `memory` | – | `memory` (dev, date pierdute la restart) sau `postgres` |
| `DATABASE_URL` | – | postgres | șir de conexiune PostgreSQL ≥ 13 |
| `DATABASE_SSL` | `false` | nu | `true` = TLS cu verificarea certificatului |
| `SPEECH_PROVIDER` | `mock` | – | `mock` sau `azure` |
| `AZURE_SPEECH_KEY` | – | azure | cheia resursei Speech |
| `AZURE_SPEECH_REGION` | `westeurope` | nu | regiunea resursei (UE); doar `[a-z0-9]` (este inserată în hostname). Disponibilitatea fast transcription: `npm run verify:azure` |
| `AZURE_SPEECH_ENDPOINT` | – | nu | endpoint personalizat (`https://<resursă>.cognitiveservices.azure.com`); are prioritate față de regiune; `https://` obligatoriu în producție |
| `AZURE_SPEECH_LOCALE` | `ro-RO` | nu | limba transcrierii |
| `AZURE_SPEECH_API_VERSION` | `2024-11-15` | nu | versiunea API Fast Transcription (contract verificat pentru 2024-11-15) |
| `AZURE_SPEECH_TIMEOUT_MS` | `600000` | nu | termen limită **total** per transcriere, inclusiv reîncercările (min. 10 000; sub `maxDuration` = 800 s) |
| `AZURE_SPEECH_MAX_RETRIES` | `1` | nu | reîncercări pentru 429/5xx/erori de rețea (0–2); `Retry-After` > 10 s nu este așteptat |
| `AZURE_SPEECH_DIARIZATION` | `false` | nu | separarea vorbitorilor (max. 2) – etichete „Vorbitor 1/2” |
| `NOTE_PROVIDER` | `mock` | – | `mock` sau `bedrock` |
| `BEDROCK_REGION` | `eu-central-1` | nu | regiunea endpoint-ului bedrock-mantle. **Nu garantează rezidența datelor** – vezi `deployment.md` §5 |
| `BEDROCK_MODEL_ID` | – (fără implicit) | **bedrock** | ID-ul exact al modelului / profilului de inferență activat în cont (Claude Sonnet 5.5: `anthropic.claude-sonnet-5-5`, conform documentației Anthropic). Nu este presupus sau înlocuit automat |
| `BEDROCK_ENDPOINT_URL` | – | nu | suprascrie endpoint-ul (ex. VPC endpoint); implicit `https://bedrock-mantle.<regiune>.api.aws/anthropic`; `https://` obligatoriu în producție |
| `BEDROCK_FALLBACK_MODEL_ID` | – | nu | model reîncercat o singură dată dacă modelul principal răspunde cu `refusal`; medicul vede un avertisment, iar evenimentul este jurnalizat |
| `BEDROCK_MAX_TOKENS` | `16000` | nu | limita de tokeni de ieșire, **inclusiv thinking** (1 000–64 000) |
| `BEDROCK_EFFORT` | – | nu | `low` / `medium` / `high`; nesetat = implicitul modelului |
| `BEDROCK_TIMEOUT_MS` | `180000` | nu | timeout per încercare; cel mai rău caz = timeout × (reîncercări + 1), sub `maxDuration` = 420 s |
| `BEDROCK_MAX_RETRIES` | `1` | nu | reîncercări SDK pentru 408/409/429/5xx și erori de conexiune (0–3) |
| `AWS_PROFILE` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` | – | nu | lanțul standard de credențiale AWS (în producție: rol IAM) |
| `NER_PROVIDER` | `heuristic` | nu | `heuristic` sau `none` (doar identificatori deterministici) |
| `MAX_AUDIO_BYTES` | `41943040` (40 MiB) | nu | dimensiunea maximă a înregistrării |
| `MAX_TRANSCRIPT_CHARS` | `200000` | nu | lungimea maximă a transcrierii |
| `MOCK_PROVIDER_LATENCY_MS` | `600` | nu | latență simulată pentru providerii mock |
| `ALLOW_MOCK_PROVIDERS_IN_PRODUCTION` | `false` | nu | permite providerii mock (conținut sintetic!) în producție – doar demo-uri |
| `MAX_CONCURRENT_TRANSCRIPTIONS` | `4` | nu | upload-uri audio simultane per instanță (protecția memoriei) |
| `RATE_LIMIT_TRANSCRIBE_PER_HOUR` | `30` | nu | per utilizator |
| `RATE_LIMIT_GENERATE_PER_HOUR` | `60` | nu | per utilizator |
| `RATE_LIMIT_AUTH_PER_15_MIN` | `10` | nu | per IP |
| `TEST_DATABASE_URL` | – | nu | doar pentru teste: rulează testele PostgreSQL (tabelele sunt golite!) |
| `LIVE_E2E`, `LIVE_E2E_AUDIO`, `LIVE_E2E_SECONDS`, `LIVE_E2E_EMAIL`, `LIVE_E2E_PASSWORD` | – | nu | doar pentru `npm run test:e2e:live` (fișier WAV **sintetic**) |
| `NEXT_TELEMETRY_DISABLED` | – | nu | recomandat `1` (dezactivează telemetria Next.js) |
