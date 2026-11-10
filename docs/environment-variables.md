# Variabile de mediu

Toate variabilele sunt citite **exclusiv pe server** și validate cu Zod la prima utilizare (`src/config/env.ts`). Valorile goale (`VAR=`) sunt tratate ca nesetate. Nu există variabile `NEXT_PUBLIC_*`.

| Variabilă | Implicit | Obligatorie | Descriere |
|---|---|---|---|
| `NODE_ENV` | `development` | – | `production` activează verificările *fail-closed* |
| `APP_URL` | `http://localhost:3000` | prod | URL-ul public; origine permisă pentru CSRF; `https://` activează cookie `Secure` și `upgrade-insecure-requests` |
| `ALLOWED_ORIGINS` | – | nu | origini suplimentare (separate prin virgulă) pentru CORS/CSRF |
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
| `AZURE_SPEECH_REGION` | `westeurope` | nu | regiunea resursei (UE) |
| `AZURE_SPEECH_ENDPOINT` | – | nu | endpoint personalizat (`https://<resursă>.cognitiveservices.azure.com`); are prioritate față de regiune |
| `AZURE_SPEECH_LOCALE` | `ro-RO` | nu | limba transcrierii |
| `AZURE_SPEECH_API_VERSION` | `2024-11-15` | nu | versiunea API Fast Transcription |
| `AZURE_SPEECH_TIMEOUT_MS` | `600000` | nu | timeout transcriere (min. 10 000) |
| `AZURE_SPEECH_DIARIZATION` | `false` | nu | separarea vorbitorilor (max. 2) – etichete „Vorbitor 1/2” |
| `NOTE_PROVIDER` | `mock` | – | `mock` sau `bedrock` |
| `BEDROCK_REGION` | `eu-central-1` | nu | regiunea Bedrock |
| `BEDROCK_MODEL_ID` | `anthropic.claude-sonnet-5-5` | nu | ID-ul modelului / inference profile disponibil în contul dvs. |
| `BEDROCK_FALLBACK_MODEL_ID` | – | nu | model reîncercat o singură dată dacă modelul principal răspunde cu `refusal` |
| `BEDROCK_MAX_TOKENS` | `8000` | nu | limita de tokeni de ieșire (1 000–64 000) |
| `BEDROCK_EFFORT` | – | nu | `low` / `medium` / `high`; nesetat = implicitul modelului |
| `BEDROCK_TIMEOUT_MS` | `180000` | nu | timeout cerere LLM |
| `AWS_PROFILE` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` | – | nu | lanțul standard de credențiale AWS (în producție: rol IAM) |
| `NER_PROVIDER` | `heuristic` | nu | `heuristic` sau `none` (doar identificatori deterministici) |
| `MAX_AUDIO_BYTES` | `41943040` (40 MiB) | nu | dimensiunea maximă a înregistrării |
| `MAX_TRANSCRIPT_CHARS` | `200000` | nu | lungimea maximă a transcrierii |
| `MOCK_PROVIDER_LATENCY_MS` | `600` | nu | latență simulată pentru providerii mock |
| `RATE_LIMIT_TRANSCRIBE_PER_HOUR` | `30` | nu | per utilizator |
| `RATE_LIMIT_GENERATE_PER_HOUR` | `60` | nu | per utilizator |
| `RATE_LIMIT_AUTH_PER_15_MIN` | `10` | nu | per IP |
| `TEST_DATABASE_URL` | – | nu | doar pentru teste: rulează testele PostgreSQL (tabelele sunt golite!) |
| `NEXT_TELEMETRY_DISABLED` | – | nu | recomandat `1` (dezactivează telemetria Next.js) |
