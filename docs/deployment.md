# Implementare (deployment)

## 1. Presupuneri

- Doar **HTTPS** (TLS terminat la load balancer / CDN). Cookie-urile de sesiune sunt `Secure`; HSTS este trimis.
- Runtime Node.js ≥ 20.9 (testat cu Node 22). Rutele API rulează pe runtime-ul `nodejs`.
- Recomandat: container de lungă durată (AWS ECS Fargate / App Runner / EKS) în `eu-central-1`, în spatele unui ALB. Pe platforme serverless, verificați limitele de dimensiune a corpului cererii, durata maximă și dacă platforma buferizează corpul pe disc.
- Timeout-uri: ALB *idle timeout* și orice proxy din față trebuie să depășească durata maximă a transcrierii (ex. 900 s). Fluxul NDJSON menține conexiunea activă între etape, dar nu în timpul apelului către Azure.
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

Aplicația refuză să pornească cereri în producție fără `SESSION_SECRET` sau cu `AUTH_PROVIDER=mock` (verificat: `/api/health` → 500 cu mesaj de configurare în jurnal).

## 3. AWS Cognito

1. Creați un **User Pool** în `eu-central-1`: autentificare cu e-mail, verificare e-mail, politică de parole (≥ 10 caractere, majuscule, minuscule, cifre, simboluri – identică cu validarea aplicației).
2. Creați un **App client** cu fluxul `ALLOW_USER_PASSWORD_AUTH` (și `ALLOW_REFRESH_TOKEN_AUTH`). Secretul de client este opțional (`COGNITO_CLIENT_SECRET`).
3. Setați `AUTH_PROVIDER=cognito`, `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`.
4. Fluxul: înregistrare → cod de confirmare pe e-mail (UI-ul îl cere automat) → autentificare. La login, ID token-ul Cognito este verificat (`aws-jwt-verify`), utilizatorul este legat prin `sub`, iar aplicația emite propriul cookie de sesiune.
5. Limitare MVP: provocările MFA / `NEW_PASSWORD_REQUIRED` nu sunt implementate (mesaj explicit în UI).

## 4. Azure AI Speech

1. În portalul Azure creați o resursă **Speech** (sau AI Services) într-o regiune UE care oferă *fast transcription* (ex. `westeurope`; verificați lista de regiuni curentă în documentația Microsoft).
2. Verificați că `ro-RO` este suportat pentru fast transcription (pagina „Language support” sau endpoint-ul de locales suportate).
3. Copiați **Key 1** în `AZURE_SPEECH_KEY` (secret manager) și regiunea în `AZURE_SPEECH_REGION`; opțional `AZURE_SPEECH_ENDPOINT` pentru un endpoint personalizat.
4. Setați `SPEECH_PROVIDER=azure`. Opțional `AZURE_SPEECH_DIARIZATION=true`.
5. Test: o consultație scurtă din UI; în jurnale apare doar `api_request` cu status și durată.
6. Verificați politica Microsoft de logging/retenție a datelor pentru serviciu și clauzele DPA.

Implementarea folosește `POST {endpoint}/speechtotext/transcriptions:transcribe?api-version=2024-11-15` cu `multipart/form-data` (`audio` + `definition` JSON cu `locales: ["ro-RO"]`) și citește `combinedPhrases` / `phrases`. **Notă:** documentația Microsoft nu a putut fi consultată din mediul de dezvoltare; adaptorul este testat cu un server simulat. Validați contra API-ului real (format WebM/Opus, limite de durată/dimensiune) înainte de producție.

## 5. Claude pe Amazon Bedrock

1. În consola Bedrock (`eu-central-1`) solicitați acces la modelul Claude Sonnet dorit (*Model access*).
2. Identificați ID-ul exact disponibil pentru contul și regiunea dvs. (model ID sau *inference profile* – ex. un profil cu prefix `eu.`); setați-l în `BEDROCK_MODEL_ID`. Valoarea implicită `anthropic.claude-sonnet-5-5` trebuie confirmată în consolă. **Atenție:** profilele de inferență *cross-region* pot ruta cereri către alte regiuni – alegeți unul limitat la UE dacă rezidența datelor este o cerință.
3. Credențiale: rol IAM al task-ului ECS/instanței (nu chei statice). Acordați permisiunea de invocare (`bedrock:InvokeModel` și, după caz, permisiunile cerute de endpoint-ul Messages API „Mantle” – verificați documentația AWS curentă) doar pe ARN-ul modelului/profilului folosit.
4. **Dezactivați/verificați model invocation logging**:
   ```bash
   aws bedrock get-model-invocation-logging-configuration --region eu-central-1
   ```
   Răspunsul nu trebuie să conțină o configurație activă de logging. Verificați și CloudTrail data events.
5. Setați `NOTE_PROVIDER=bedrock`, `BEDROCK_REGION=eu-central-1`. Opțional: `BEDROCK_EFFORT`, `BEDROCK_FALLBACK_MODEL_ID` (folosit o singură dată, doar la `stop_reason: "refusal"`).
6. `temperature` nu este trimis (respins de modelele actuale); vezi `security.md` §3.

SDK: `@anthropic-ai/bedrock-sdk` (`AnthropicBedrockMantle`), care folosește lanțul standard de credențiale AWS (rol IAM, `AWS_PROFILE`, variabile `AWS_*`).

## 6. PostgreSQL

- PostgreSQL ≥ 13 (ex. Amazon RDS în `eu-central-1`, criptare at-rest, backup automat, acces doar din VPC).
- `npm run db:migrate` este idempotent (tabelul `schema_migrations`).
- `npm run db:seed` creează contul demo – **doar pentru dezvoltare** (refuză să ruleze cu `NODE_ENV=production`).

## 7. Checklist înainte de lansare

- [ ] `SESSION_SECRET` generat aleatoriu și stocat în secret manager
- [ ] `AUTH_PROVIDER=cognito`, MFA evaluat
- [ ] Bedrock invocation logging dezactivat (verificat cu CLI)
- [ ] Regiuni UE confirmate pentru toți procesatorii
- [ ] DPA semnate; DPIA finalizată
- [ ] Rate limiting distribuit (Redis) dacă rulează mai multe instanțe
- [ ] Jurnalele platformei nu înregistrează corpurile cererilor (ALB/CloudFront access logs nu conțin body; WAF logging fără body)
- [ ] Test de penetrare și monitorizare/alertare
