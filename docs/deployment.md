# Implementare (deployment)

## 1. Presupuneri

- Doar **HTTPS** (TLS terminat la load balancer / CDN). Cookie-urile de sesiune sunt `Secure`; HSTS este trimis.
- Runtime Node.js ≥ 20.9 (testat cu Node 22). Rutele API rulează pe runtime-ul `nodejs`.
- Recomandat: container de lungă durată (AWS ECS Fargate / App Runner / EKS) în `eu-central-1`, în spatele unui ALB. Pe platforme serverless, verificați limitele de dimensiune a corpului cererii, durata maximă și dacă platforma buferizează corpul pe disc.
- Timeout-uri: ALB *idle timeout* și orice proxy din față trebuie să depășească durata maximă a transcrierii (ex. 900 s). Fluxul NDJSON menține conexiunea activă între etape, dar nu în timpul apelului către Azure. Rutele declară `maxDuration` 800 s (transcriere) și 420 s (fișă), corelate cu timeout-urile implicite ale providerilor.
- Memorie: fiecare upload audio este ținut în memorie; `MAX_CONCURRENT_TRANSCRIPTIONS` (implicit 4) limitează simultaneitatea per instanță (≈ 4 × 40 MiB, plus copiile temporare ale runtime-ului). Cererile peste limită primesc 429 cu `Retry-After`.
- Mai multe instanțe: rate limiter-ul este in-memory – folosiți un store comun (Redis/ElastiCache) implementând interfața `RateLimiter`.
- Dacă aplicația este în spatele unui proxy, asigurați-vă că `X-Forwarded-For` este setat de proxy-ul de încredere (folosit la rate limiting per IP).

## 2. Pași generali

```bash
npm ci
npm run typecheck
npm test
NEXT_TELEMETRY_DISABLED=1 npm run build
DATABASE_URL=postgres://... npm run db:migrate
npm run start   # sau: npx next start -p 3000
```

Variabile minime în producție: `NODE_ENV=production`, `APP_URL=https://…`, `SESSION_SECRET`, `AUTH_PROVIDER=cognito` + `COGNITO_*`, `DATABASE_PROVIDER=postgres` + `DATABASE_URL` (+ `DATABASE_SSL=true`), `SPEECH_PROVIDER=azure` + `AZURE_SPEECH_*`, `NOTE_PROVIDER=bedrock` + `BEDROCK_*`. Secretele se injectează din AWS Secrets Manager / SSM Parameter Store, nu din fișiere în imagine.

Aplicația refuză cererile în producție fără `SESSION_SECRET`, cu `AUTH_PROVIDER=mock`, cu providerii mock de transcriere/fișă (generează conținut sintetic), fără `BEDROCK_MODEL_ID` când `NOTE_PROVIDER=bedrock` sau cu endpoint-uri suprascrise non-HTTPS (verificat: `/api/health` → 500, cu mesaj de configurare fără valori în jurnal).

## 3. AWS Cognito

1. Creați un **User Pool** în `eu-central-1`: autentificare cu e-mail, verificare e-mail, politică de parole (≥ 10 caractere, majuscule, minuscule, cifre, simboluri – identică cu validarea aplicației).
2. Creați un **App client** cu fluxul `ALLOW_USER_PASSWORD_AUTH` (și `ALLOW_REFRESH_TOKEN_AUTH`). Secretul de client este opțional (`COGNITO_CLIENT_SECRET`).
3. Setați `AUTH_PROVIDER=cognito`, `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`.
4. Fluxul: înregistrare → cod de confirmare pe e-mail (UI-ul îl cere automat) → autentificare. La login, ID token-ul Cognito este verificat (`aws-jwt-verify`), utilizatorul este legat prin `sub`, iar aplicația emite propriul cookie de sesiune.
5. Limitare MVP: provocările MFA / `NEW_PASSWORD_REQUIRED` nu sunt implementate (mesaj explicit în UI).

## 4. Azure AI Speech

Statusul verificării fiecărui aspect: [`provider-verification.md`](provider-verification.md) §1.

1. Portal Azure → creați o resursă **Speech** (sau Azure AI Services) într-o regiune **UE**. Fast transcription nu este disponibilă în toate regiunile – confirmarea se face la pasul 5.
2. Resursa → *Keys and Endpoint*: copiați **KEY 1** și **Location/Region** (ex. `westeurope`). Stocați cheia într-un secret manager (ex. AWS Secrets Manager), nu în imagine sau în repo.
3. Setați variabilele:
   ```
   SPEECH_PROVIDER=azure
   AZURE_SPEECH_KEY=<KEY 1>
   AZURE_SPEECH_REGION=<regiunea resursei, ex. westeurope>
   AZURE_SPEECH_LOCALE=ro-RO
   AZURE_SPEECH_API_VERSION=2024-11-15
   ```
   Opțional: `AZURE_SPEECH_ENDPOINT=https://<resursa>.cognitiveservices.azure.com` (are prioritate față de regiune; obligatoriu `https://` în producție), `AZURE_SPEECH_DIARIZATION=true`, `AZURE_SPEECH_TIMEOUT_MS` (termen limită total, implicit 600 000 ms), `AZURE_SPEECH_MAX_RETRIES` (implicit 1, doar pentru 429/5xx/rețea).
4. Rețea: permiteți ieșirea HTTPS către `https://<regiune>.api.cognitive.microsoft.com` (sau endpoint-ul personalizat).
5. Verificați (date sintetice):
   ```bash
   npm run verify:azure
   npm run verify:azure -- --audio ./dialog-sintetic.webm
   ```
   Primul pas confirmă că `ro-RO` apare în lista `Transcribe` a resursei. Al doilea transcrie o înregistrare **sintetică** și afișează doar lungimi și numărul de identificatori redactați (`--show` afișează transcrierea **redactată**).
6. Contractual: verificați politica Microsoft de logging/retenție pentru Speech și DPA-ul.

Contractul implementat (verificat din specificația OpenAPI oficială): `POST {endpoint}/speechtotext/transcriptions:transcribe?api-version=2024-11-15`, antet `Ocp-Apim-Subscription-Key`, `multipart/form-data` cu `audio` + `definition` (`{"locales":["ro-RO"],"profanityFilterMode":"None"}`), răspuns `combinedPhrases`/`phrases`. Limită per fișier < 2 h / < 250 MB.

Browsere: Chrome, Edge și Firefox înregistrează WebM/Opus sau Ogg/Opus (formate listate de Microsoft). Safari înregistrează `audio/mp4`, format **nelistat explicit** – dacă Azure îl respinge, medicul vede mesajul „folosiți Chrome, Edge sau Firefox”.

## 5. Claude în Amazon Bedrock

Statusul verificării: [`provider-verification.md`](provider-verification.md) §2. Sursa principală: documentația Anthropic „Claude in Amazon Bedrock”.

1. **Acces la model**: consola AWS → Amazon Bedrock → *Model access* → solicitați accesul pentru **Claude Sonnet 5.5** (ID documentat: `anthropic.claude-sonnet-5-5`). Accesul se acordă per model.
2. **Alegeți rutarea (rezidența datelor) – decizie explicită**:
   - În tabelul de regiuni Anthropic, `eu-central-1` (Frankfurt) suportă tipurile de endpoint **„Global, EU”** și **nu** este „In-region only”. Selectarea `eu-central-1` **nu garantează** procesarea în Frankfurt și, cu rutarea *Global*, nici în UE.
   - *Global* = rutare dinamică în toate regiunile disponibile (inclusiv non-UE).
   - *EU* = profil de inferență pe geografia UE (rutare între regiuni UE).
   - Regiunile UE marcate „In-region only” (procesare într-o singură regiune) sunt **eu-north-1** (Stockholm) și **eu-west-1** (Irlanda), cu un cost suplimentar de 10% conform documentației.
   - Identificatorul exact de folosit pentru rutarea EU pe endpoint-ul Mantle **nu a putut fi verificat** din documentația disponibilă: preluați-l din consola Bedrock / documentația AWS și setați-l în `BEDROCK_MODEL_ID`. Aplicația nu presupune și nu înlocuiește niciodată modelul.
3. **IAM** (fără chei statice în producție): atașați rolului task-ului ECS / instanței o politică ce permite `bedrock-mantle:CreateInference` **doar** pe ARN-urile modelelor/profilurilor permise. Pentru `npm run verify:bedrock` mai sunt necesare (doar pentru rolul operatorului, nu al aplicației) `bedrock:GetModelInvocationLoggingConfiguration` și `bedrock:ListInferenceProfiles`.
4. **Variabile**:
   ```
   NOTE_PROVIDER=bedrock
   BEDROCK_REGION=eu-central-1            # sau eu-north-1 / eu-west-1 pentru procesare într-o singură regiune
   BEDROCK_MODEL_ID=<ID exact din consolă, ex. anthropic.claude-sonnet-5-5 sau profilul EU>
   ```
   Opționale: `BEDROCK_MAX_TOKENS` (implicit 16 000, include tokenii de thinking), `BEDROCK_EFFORT`, `BEDROCK_TIMEOUT_MS` (implicit 180 000 per încercare), `BEDROCK_MAX_RETRIES` (implicit 1), `BEDROCK_ENDPOINT_URL` (ex. VPC endpoint; `https://` în producție), `BEDROCK_FALLBACK_MODEL_ID` (folosit o singură dată, doar la `refusal`, cu avertisment afișat medicului).
5. **Rețea**: ieșire HTTPS către `bedrock-mantle.<regiune>.api.aws` (sau VPC endpoint).
6. **Invocation logging**:
   ```bash
   aws bedrock get-model-invocation-logging-configuration --region eu-central-1
   ```
   Răspunsul nu trebuie să conțină `loggingConfig` (sau cel puțin `textDataDeliveryEnabled: false`). Dacă există, eliminați-l:
   ```bash
   aws bedrock delete-model-invocation-logging-configuration --region eu-central-1
   ```
   Aplicabilitatea acestei setări pentru endpoint-ul bedrock-mantle trebuie confirmată cu AWS. Verificați și ce înregistrează CloudTrail / CloudWatch pentru această ofertă.
7. **Verificare** (transcriere sintetică):
   ```bash
   BEDROCK_REGION=eu-central-1 BEDROCK_MODEL_ID=<id> npm run verify:bedrock
   ```
   Raportează: configurația de invocation logging, profilurile de inferență vizibile pentru model și regiunile în care rutează, apoi generează o fișă sintetică prin clasa de producție.

`temperature` nu este trimis: SDK-ul folosește `anthropic-version: 2026-10-21`, care îl respinge. Stabilitatea rezultatelor este asigurată prin prompt, normalizarea strictă a celor 6 secțiuni și verificările de grounding.

## 5bis. Test complet end-to-end cu providerii reali

Cu toate variabilele de mai sus în `.env.local` și un fișier WAV **sintetic** (dialog fictiv în română, PCM 16-bit):
```bash
LIVE_E2E=1 LIVE_E2E_AUDIO=./dialog-sintetic.wav LIVE_E2E_SECONDS=60 npm run test:e2e:live
```
Chromium folosește fișierul ca intrare de microfon și parcurge întregul flux: înregistrare → Azure → redactare → Claude → fișă → clipboard → ștergerea sesiunii. Cu Cognito, setați și `LIVE_E2E_EMAIL` / `LIVE_E2E_PASSWORD` pentru un cont de test.

## 6. PostgreSQL

- PostgreSQL ≥ 13 (ex. Amazon RDS în `eu-central-1`, criptare at-rest, backup automat, acces doar din VPC).
- `npm run db:migrate` este idempotent (tabelul `schema_migrations`).
- `npm run db:seed` creează contul demo – **doar pentru dezvoltare** (refuză să ruleze cu `NODE_ENV=production`).

## 7. Checklist înainte de lansare

- [ ] `SESSION_SECRET` generat aleatoriu și stocat în secret manager
- [ ] `AUTH_PROVIDER=cognito`, MFA evaluat
- [ ] Bedrock invocation logging dezactivat (verificat cu CLI / `npm run verify:bedrock`)
- [ ] Decizie documentată privind rutarea Bedrock (Global / EU / in-region) și ID-ul exact în `BEDROCK_MODEL_ID`
- [ ] `npm run verify:azure` confirmă ro-RO pentru regiunea aleasă
- [ ] `npm run test:e2e:live` trecut cu date sintetice
- [ ] Regiuni UE confirmate pentru toți procesatorii
- [ ] DPA semnate; DPIA finalizată
- [ ] Rate limiting distribuit (Redis) dacă rulează mai multe instanțe
- [ ] Jurnalele platformei nu înregistrează corpurile cererilor (ALB/CloudFront access logs nu conțin body; WAF logging fără body)
- [ ] Test de penetrare și monitorizare/alertare
