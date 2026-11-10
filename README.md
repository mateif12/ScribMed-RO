# ScribMed RO

**Ambient Clinical Intelligence pentru medicii și clinicile private din România.**
*„Tu asculți pacientul. Noi documentăm consultația.”*

ScribMed RO înregistrează (cu acordul pacientului) conversația medic–pacient, o transcrie în limba română, elimină identificatorii personali direcți și generează un **draft** de fișă de consultație structurată în 6 secțiuni, în terminologie medicală românească. Medicul verifică, editează, validează și copiază fișa în sistemul clinicii.

> ScribMed RO **nu** este un sistem de diagnostic, nu ia decizii medicale și nu înlocuiește dosarul electronic al pacientului. Fiecare fișă: *„Document generat automat ca suport de redactare. Necesită verificarea și validarea medicului curant.”*

## Funcționalități (MVP)

- Landing page, înregistrare clinică, autentificare, resetare parolă, rute protejate
- Panou: profil medic, clinică, abonament (placeholder Stripe), statistici, activitate recentă (doar metadate operaționale)
- Spațiu de lucru consultație: confirmarea informării pacientului, înregistrare reală din microfon (`MediaRecorder`), pauză/reluare, durată, stare și nivel microfon, anulare, progres real pe etape (încărcare → transcriere → eliminare date personale → redactare fișă)
- Editor de fișă: editare, copiere în clipboard, regenerare, consultație nouă, ștergerea sesiunii, avertismente de verificare
- Redactare PII (CNP, telefon, e-mail, CI/pașaport, numere auto, IBAN, data nașterii, cod poștal, nume și adrese detectabile)
- Provideri înlocuibili: Azure AI Speech / mock, Claude pe Amazon Bedrock / mock, Cognito / mock, PostgreSQL / memorie
- Multi-tenant: organizații, roluri (proprietar, administrator, medic), izolare între organizații
- Fără stocarea audio, a transcrierilor sau a fișelor

## Pornire rapidă (mod demonstrativ, fără credențiale)

Cerințe: Node.js ≥ 20.9 (testat cu 22), npm.

```bash
npm install
```

```bash
npm run dev
```

Deschideți http://localhost:3000 → **Autentificare** → cont demo precompletat:
`demo@scribmed.ro` / `Demo-Parola-2026!` (există doar în modul `AUTH_PROVIDER=mock` + `DATABASE_PROVIDER=memory`, în afara producției; datele se pierd la restart).

În modul demo, microfonul este real, dar transcrierea folosește **transcrieri sintetice** (persoane și identificatori fictivi), iar fișa este generată de un generator determinist bazat pe reguli care nu adaugă informații. Nu folosiți date reale ale pacienților în dezvoltare.

Opțional, copiați configurația: `cp .env.example .env.local` (valorile goale sunt tratate ca nesetate).

## Cu PostgreSQL local

```bash
createdb scribmed
```

```bash
DATABASE_URL=postgres://USER:PASS@localhost:5432/scribmed npm run db:migrate
```

```bash
DATABASE_URL=postgres://USER:PASS@localhost:5432/scribmed npm run db:seed
```

Apoi în `.env.local`: `DATABASE_PROVIDER=postgres` și `DATABASE_URL=...`, urmat de `npm run dev`.

## Conectarea providerilor reali

Pași detaliați în [`docs/deployment.md`](docs/deployment.md):

- **Azure AI Speech**: `SPEECH_PROVIDER=azure`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` (regiune UE cu fast transcription), `AZURE_SPEECH_LOCALE=ro-RO`.
- **Claude in Amazon Bedrock**: acces la Claude Sonnet 5.5 în consola Bedrock, rol IAM cu `bedrock-mantle:CreateInference`, `NOTE_PROVIDER=bedrock`, `BEDROCK_MODEL_ID` (obligatoriu, fără valoare implicită), decizie explicită de rutare (Global / EU / in-region), invocation logging dezactivat.
- **AWS Cognito**: User Pool + App client cu `ALLOW_USER_PASSWORD_AUTH`, `AUTH_PROVIDER=cognito`, `COGNITO_*`.

Lista completă: [`docs/environment-variables.md`](docs/environment-variables.md). Ce este verificat și ce nu: [`docs/provider-verification.md`](docs/provider-verification.md).

> Bedrock: `eu-central-1` nu este o regiune „in-region only” pentru Claude – alegerea regiunii **nu garantează** procesarea exclusiv în UE. Vezi `docs/deployment.md` §5.

## Scripturi

| Comandă | Ce face |
|---|---|
| `npm run dev` | server de dezvoltare |
| `npm run build` / `npm start` | build și pornire producție |
| `npm run typecheck` | TypeScript strict (`tsc --noEmit`) |
| `npm test` | Vitest: teste unitare și de integrare |
| `npm run test:e2e` | Playwright: suita mock + suita cu adaptoarele reale Azure/Bedrock contra stub-urilor de contract (fără credențiale) |
| `npm run test:e2e:live` | opțional: lanțul complet cu Azure și Bedrock reale, folosind un WAV **sintetic** ca microfon |
| `npm run verify:azure` / `npm run verify:bedrock` | verifică o configurație reală (locale ro-RO, invocation logging, rutare, apel sintetic) |
| `npm run db:migrate` / `npm run db:seed` | migrări PostgreSQL / cont demo |

Testele PostgreSQL rulează doar cu `TEST_DATABASE_URL` setat (tabelele din acea bază sunt golite):

```bash
TEST_DATABASE_URL=postgres://USER:PASS@localhost:5432/scribmed_test npm test
```

## Documentație

- [Arhitectură](docs/architecture.md)
- [Fluxuri de date, retenție, procesatori terți](docs/data-flow.md)
- [Securitate, limite ale redactării, cerințe de conformitate rămase](docs/security.md)
- [Implementare și conectarea providerilor](docs/deployment.md)
- [Verificarea integrărilor AI (confirmat vs. neconfirmat)](docs/provider-verification.md)
- [Variabile de mediu](docs/environment-variables.md)

## Confidențialitate – pe scurt

Audio, transcrierile și fișele sunt procesate tranzitoriu și **nu sunt stocate** de aplicație (nici în baza de date, nici în browser, nici în jurnale). Redactarea automată este *best effort* și **nu** echivalează cu anonimizarea: textul rămâne dată de sănătate. Măsurile tehnice nu fac, singure, utilizarea conformă GDPR – vezi [`docs/security.md`](docs/security.md) §5.
