# Securitate și confidențialitate

> Aceste controale tehnice **nu fac, prin ele însele, aplicația conformă GDPR**. Conformitatea depinde și de măsuri organizaționale și juridice (vezi §4).

## 1. Controale implementate

### Date clinice
| Control | Implementare | Verificare |
|---|---|---|
| Fără persistență a conținutului clinic | schema DB nu are coloane pentru audio/transcrieri/fișe; niciun endpoint nu le persistă | `tests/integration/privacy.test.ts` (scanează întreaga bază după un flux complet); testul Postgres verifică lipsa coloanelor |
| Fără stocare în browser | state React + refs; fără localStorage/sessionStorage/IndexedDB/SW | `tests/unit/browser-utils.test.ts`, E2E |
| Fără streaming audio în timpul înregistrării | chunk-uri `MediaRecorder` păstrate local; un singur upload la final | cod `use-audio-recorder.ts` |
| Microfon doar după acțiune explicită | `getUserMedia` apelat doar la click, după confirmarea informării pacientului | E2E |
| Eliberarea microfonului | `track.stop()` la stop / anulare / unmount | E2E (status „Microfon inactiv”) |
| Redactare PII înainte de LLM | `scrubPii` la `/api/transcribe` **și din nou** la `/api/generate-note` | test de integrare cu provider „spion” |
| Răspunsuri necache-uite | `Cache-Control: no-store` pe API și paginile protejate | teste integrare |
| Jurnale fără conținut | `safeLog` acceptă doar câmpuri din allow-list; erorile necunoscute sunt jurnalizate doar prin numele clasei | `security-utils.test.ts` |
| Fără analytics / session replay / error tracking terț | nicio dependență de acest tip; CSP `connect-src 'self'` le-ar bloca | CSP |
| Erorile providerilor nu sunt propagate | mesajele SDK/HTTP nu sunt transmise clientului sau în jurnale; se folosesc doar statusul HTTP, numele clasei și codurile Azure din enum-ul documentat | `bedrock-provider.test.ts`, `speech-providers.test.ts`, `real-adapters.test.ts` |
| LLM-ul nu primește identificatori | stub-ul Bedrock din `npm run test:e2e:providers` respinge orice cerere care conține identificatorii sintetici | E2E providers |
| Protecția memoriei la upload | `MAX_CONCURRENT_TRANSCRIPTIONS` per instanță + limită de bytes pe flux | `config-and-limits.test.ts` |

### Aplicație web
| Control | Implementare |
|---|---|
| Sesiuni | JWT HS256 (`jose`), cookie `HttpOnly`, `Secure` (prod/HTTPS), `SameSite=Strict`, TTL 8 h; la fiecare cerere API utilizatorul este reîncărcat din DB (dezactivare/rol/organizație aplicate imediat) |
| CSRF | SameSite=Strict + verificarea `Origin`/`Sec-Fetch-Site` + antet obligatoriu `x-scribmed-request: 1` pe metode mutative |
| CORS | aplicație same-origin: răspunsurile nu includ `Access-Control-Allow-Origin`; preflight-ul răspunde doar pentru `ALLOWED_ORIGINS`, dar citirea cross-origin a răspunsurilor rămâne blocată |
| CSP | per cerere, cu nonce și `strict-dynamic` (`proxy.ts`); `object-src 'none'`, `frame-ancestors 'none'`, `connect-src 'self'`; API: `default-src 'none'` |
| Alte antete | HSTS (2 ani, preload), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, COOP/CORP same-origin, `Permissions-Policy` (microfon doar `self`) |
| Validare | Zod `.strict()` pe toate corpurile JSON; limite de dimensiune JSON; audio: MIME allow-list + magic bytes + limită de bytes pe flux + detecție upload trunchiat |
| Rate limiting | autentificare per IP (implicit 10/15 min), transcriere 30/h, generare 60/h per utilizator |
| Parole (mod mock) | scrypt (N=16384, r=8, p=1), comparare în timp constant, hash fictiv pentru e-mailuri inexistente |
| Enumerare conturi | mesaje identice la login și resetare parolă |
| Secrete | doar server-side; nicio variabilă `NEXT_PUBLIC_*`; `server-only` pe modulele cu secrete; validare la pornire, *fail-closed* în producție (lipsă `SESSION_SECRET`, mock auth sau provideri mock interziși, `BEDROCK_MODEL_ID` obligatoriu, endpoint-uri suprascrise doar `https://`, regiuni validate sintactic pentru a nu putea altera hostname-ul); erorile de configurare listează doar numele variabilelor |
| Prompt injection | transcrierea este încadrată în `<transcriere>` și declarată „date, nu instrucțiuni”; ieșirea este normalizată strict la 6 secțiuni |

### Izolare între organizații (tenant isolation)
- Toate metodele de repository pentru date de organizație cer `TenantScope` și filtrează explicit `organization_id`.
- ID-ul organizației vine **doar** din sesiunea verificată, niciodată din corpul cererii (schemele Zod sunt `.strict()`).
- Token-ul este respins dacă organizația din claim nu corespunde utilizatorului din DB.
- În PostgreSQL, cheile străine compuse `(user_id, organization_id)` împiedică la nivel de bază de date legarea unui profil sau eveniment de un utilizator din altă organizație.
- Teste: `tests/integration/tenant-isolation.test.ts`, `tests/integration/postgres-repository.test.ts`.
- Recomandare suplimentară: Row-Level Security în PostgreSQL ca a doua linie de apărare (neimplementat în MVP).

## 2. Garanții privind redactarea – ce NU face

- Nu garantează detectarea tuturor numelor/adreselor. Numele sunt detectate după expresii declanșatoare („mă numesc”, „domnul”, „Dr.”, „pacienta”, …) și apoi toate aparițiile ulterioare. Un nume rostit fără context nu este detectat (test explicit).
- Nu elimină cvasi-identificatorii (vârstă, profesie, localități menționate incidental, date ale evenimentelor clinice).
- Nu este anonimizare. Transcrierea redactată rămâne dată de sănătate.
- Pentru producție se recomandă un serviciu NER suplimentar pentru limba română, conectat prin interfața `NerProvider`, evaluat pe un set de test reprezentativ.

## 3. Hallucination guard-rails

- Prompt de sistem cu cele 13 reguli obligatorii + reguli suplimentare (fără reconstrucția identificatorilor, transcrierea ca date).
- Normalizare: exact 6 secțiuni în ordine; secțiuni lipsă/goale → „Neconsemnat”; diagnostic lipsă → „Nespecificat de medic”.
- Verificare de grounding: valori numerice cu unități (doze, semne vitale, durate) din fișă care nu apar în transcriere sunt semnalate medicului.
- `temperature` **nu** este trimis: modelele Claude actuale și versiunea curentă a API-ului îl resping (HTTP 400). Stabilitatea este asigurată prin prompt, normalizare și verificări.
- Modelul nu este schimbat niciodată automat: `BEDROCK_MODEL_ID` este obligatoriu; fallback-ul (opțional) după `refusal` este afișat medicului ca avertisment și jurnalizat.
- Răspunsurile `refusal` / `max_tokens` sunt tratate explicit; nu se afișează niciodată o fișă trunchiată.
- Avertismentul obligatoriu este afișat permanent deasupra fișei.

## 4. Riscuri tehnice cunoscute (neremediate în MVP)

| Risc | Impact | Atenuare recomandată |
|---|---|---|
| Rutarea Bedrock din eu-central-1 nu este „in-region only”; rutarea *Global* poate procesa în afara UE | rezidența datelor | profil de inferență EU sau regiune in-region (eu-north-1 / eu-west-1); decizie documentată în DPIA |
| Invocation logging Bedrock – aplicabilitate neconfirmată pentru Mantle; CloudTrail/CloudWatch | posibilă stocare de metadate/conținut la AWS | confirmare AWS; `npm run verify:bedrock`; revizuirea CloudTrail data events |
| Azure: retenție/logging la Microsoft neverificate; regiune și ro-RO de confirmat | conformitate | DPA; `npm run verify:azure` |
| Safari (`audio/mp4`) poate fi respins de Azure | disponibilitate | medicii folosesc Chrome/Edge/Firefox; eventual transcodare server-side (neimplementată) |
| Sesiunile JWT nu sunt revocate la logout (cookie șters, token valabil până la expirare, max. 8 h) | furt de token | TTL scurt, revocare prin versiune de sesiune în DB (neimplementată) |
| Rate limiting per IP folosește `X-Forwarded-For` | ocolire dacă antetul nu este suprascris de un proxy de încredere | ALB/CloudFront care suprascrie antetul; WAF |
| Rate limiting și limita de concurență sunt per instanță | ocolire la scalare orizontală | Redis/ElastiCache |
| Fișa copiată ajunge în clipboard-ul sistemului de operare (inclusiv istoric clipboard / sincronizare cloud) | expunere locală | politică de stație de lucru (dezactivare istoric/sincronizare clipboard) |
| `/api/health` public expune modurile providerilor (fără secrete) | recunoaștere | restricționare la rețeaua internă în producție |
| Redactarea numelor/adreselor este euristică | date personale către LLM | NER suplimentar evaluat pe date sintetice; DPA cu AWS |
| Calitatea clinică a fișelor Claude nu a fost evaluată pe date reale/sintetice extinse | erori de documentare | evaluare cu medici pe set sintetic; revizuirea obligatorie de către medic |

## 5. Cerințe de conformitate rămase (responsabilitatea operatorului)

1. **Temei legal** pentru prelucrarea datelor de sănătate (art. 6 + art. 9 GDPR) și informarea pacienților (art. 13); textul de informare și eventualul consimțământ pentru înregistrare – validate juridic.
2. **DPIA** (evaluare de impact) – obligatorie pentru prelucrare pe scară largă de date de sănătate; consultarea DPO.
3. **Acorduri de prelucrare (DPA)** cu AWS, Microsoft și furnizorul de hosting; analiza transferurilor internaționale și a sub-procesatorilor.
4. Verificarea configurațiilor cloud reale: Bedrock *model invocation logging* dezactivat; politica de retenție/logging Azure Speech; regiuni UE; criptare at-rest (RDS, backup-uri).
5. Registrul activităților de prelucrare (art. 30), procedura de notificare a incidentelor (art. 33–34), politica de retenție, procedura pentru drepturile persoanelor vizate.
6. Cerințe naționale aplicabile (ex. legislația privind drepturile pacientului și documentația medicală, ghiduri ANSPDCP, reglementări CMR) – de analizat juridic.
7. Evaluarea statutului de dispozitiv medical (MDR) – produsul este conceput ca instrument de documentare fără funcții de diagnostic; încadrarea trebuie confirmată juridic.
8. Test de penetrare, threat modeling, MFA (Cognito), WAF, monitorizare și alertare, backup/restore testat, plan de continuitate.

## 6. Raportarea vulnerabilităților

Configurați o adresă dedicată (ex. `security@<domeniu>`) și un fișier `/.well-known/security.txt` înainte de lansare.
