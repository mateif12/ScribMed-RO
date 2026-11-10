# Fluxuri de date și retenție

## 1. Fluxul unei consultații

```
Browser medic                     Server ScribMed RO                    Procesatori terți (UE)
─────────────                     ──────────────────                    ──────────────────────
1. Confirmare informare pacient
2. getUserMedia + MediaRecorder
   chunk-uri audio în memorie (RAM)
   — nimic nu e transmis în timpul înregistrării —
3. „Finalizează și Generează Fișa”
   un singur POST /api/transcribe ──▶ 4. auth, CSRF, rate limit
   (HTTPS)                            5. citire flux cu limită, validare MIME + magic bytes
                                      6. audio în memorie ───────────────▶ Azure AI Speech (ro-RO)
                                                                            Fast Transcription
                                      7. transcriere brută ◀──────────────
                                         buffer audio suprascris (best effort)
                                      8. redactare PII (regex + NER)
                                         referința la textul brut eliminată
   transcriere redactată ◀──────────  9. NDJSON „done” (no-store)
10. POST /api/generate-note ────────▶ 11. RE-redactare server-side (clientul nu e de încredere)
                                      12. prompt strict + transcriere ────▶ Claude in Amazon Bedrock
                                                                            (endpoint eu-central-1; rutare
                                                                             Global/EU – vezi §4)
                                      13. text fișă ◀─────────────────────
                                      14. normalizare 6 secțiuni + verificări grounding
   fișă + avertismente ◀────────────  15. răspuns JSON (no-store)
16. Medicul editează / copiază în clipboard
17. „Consultație nouă” / „Șterge sesiunea” → state RESET, referințe eliminate
```

Transcrierea brută (neredactată) **nu părăsește serverul**; browserul primește doar varianta redactată. Furnizorul LLM primește exclusiv text redactat (pasul 11 este aplicat indiferent de ce trimite clientul și este acoperit de un test de integrare).

## 2. Ce se stochează și unde

| Dată | Browser | Server (memorie) | Bază de date | Jurnale | Terți |
|---|---|---|---|---|---|
| Audio | RAM, până la transcriere reușită sau ștergere | durata cererii | **niciodată** | **niciodată** | Azure (vezi §4) |
| Transcriere brută | – | durata cererii | **niciodată** | **niciodată** | Azure (output) |
| Transcriere redactată | RAM, până la ștergerea sesiunii | durata cererii | **niciodată** | **niciodată** | Bedrock (input) |
| Fișa generată / editată | RAM, până la ștergerea sesiunii | durata cererii | **niciodată** | **niciodată** | Bedrock (output) |
| Cont, organizație, profil medic | – | – | da | id-uri opace | Cognito (identitate) |
| Abonament | – | – | da | – | (viitor: Stripe) |
| Metrici operaționale | – | – | da: tip eveniment, durată audio (s), timp procesare (ms), număr identificatori eliminați, specialitate | – | – |

Nu se folosesc `localStorage`, `sessionStorage`, IndexedDB, Cache Storage sau service workers pentru date clinice (verificat de un test care scanează codul și de testul E2E). Răspunsurile API au `Cache-Control: no-store`.

### Despre „ștergere”

Eliminarea referințelor JavaScript și suprascrierea buffer-elor Node.js reduc durata de viață a datelor în memorie, dar **nu garantează ștergerea forensică**: runtime-ul, garbage collector-ul, stiva HTTP, sistemul de operare sau swap-ul pot păstra copii temporare în afara controlului aplicației.

## 3. Retenție

- Date clinice: fără retenție în aplicație (procesare tranzitorie).
- Date de cont/organizație: pe durata contractului; ștergerea organizației (`ON DELETE CASCADE`) elimină utilizatorii, profilurile, abonamentul și metricile. Un flux de export/ștergere la cerere (drepturile persoanei vizate) trebuie implementat înainte de producție.
- Metrici operaționale: recomandat 24 de luni, apoi agregare/ștergere (de stabilit de operator; job-ul de curățare nu este inclus în MVP).
- Jurnale aplicație: doar metadate (rută, status, durată, cod eroare, UUID-uri). Retenția este configurată în platforma de logging (ex. CloudWatch).

## 4. Procesatori terți

| Procesator | Scop | Date primite | Regiune (configurabilă) | De verificat contractual / tehnic |
|---|---|---|---|---|
| Microsoft Azure AI Speech | transcriere | audio consultație | `AZURE_SPEECH_REGION` (implicit `westeurope`) | DPA Microsoft, politica de logging/retenție a serviciului, disponibilitatea Fast Transcription și a `ro-RO` în regiune (`npm run verify:azure`) |
| Amazon Bedrock (Claude in Amazon Bedrock, endpoint bedrock-mantle) | redactare fișă | transcriere redactată + prompt | endpoint în `BEDROCK_REGION` (implicit `eu-central-1`); **locul procesării depinde de rutare**: eu-central-1 oferă doar „Global” (toate regiunile) sau „EU” (geografie UE), nu procesare exclusiv în Frankfurt; „In-region only” în UE: eu-north-1, eu-west-1 | DPA AWS, decizia de rutare, *model invocation logging* (aplicabilitate la Mantle de confirmat), CloudTrail/CloudWatch |
| AWS Cognito | autentificare | e-mail, parolă (hash la Cognito) | `COGNITO_REGION` | DPA AWS |
| Furnizor PostgreSQL (ex. RDS) | date de cont | date de cont, metrici | la alegere | criptare at-rest, backup |

## 5. Pseudonimizare vs. anonimizare

Redactarea înlocuiește identificatorii direcți detectați cu etichete (`[CNP_ELIMINAT]` etc.) **fără a păstra o cheie de re-identificare**. Totuși, textul rămas (afecțiuni, vârstă, profesie, locuri, date, combinații rare) poate permite re-identificarea. Prin urmare:

- rezultatul **nu** este „anonimizat” în sensul GDPR (Considerentul 26) și rămâne **date personale privind sănătatea** (art. 9 GDPR);
- regex-urile și euristicile au limite cunoscute (ex. nume fără expresie declanșatoare – vezi testul „documents a known limitation”).
