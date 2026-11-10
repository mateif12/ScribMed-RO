/**
 * SYNTHETIC consultation transcripts used by the mock speech provider and tests.
 * All persons, identifiers and numbers are fictional. The CNP below is a made-up
 * value used only to demonstrate redaction.
 */
export interface SyntheticTranscript {
  id: string;
  title: string;
  text: string;
}

export const SYNTHETIC_TRANSCRIPTS: SyntheticTranscript[] = [
  {
    id: "faringita",
    title: "Odinofagie și febră",
    text: [
      "Doctor: Bună ziua, luați loc. Spuneți-mi ce vă aduce astăzi la noi.",
      "Pacient: Bună ziua, doamna doctor. Mă numesc Andrei Marinescu, CNP-ul meu este 1840512400123. Am venit pentru că mă doare foarte tare în gât.",
      "Doctor: De când vă doare în gât?",
      "Pacient: De trei zile. A început ușor și s-a agravat de ieri. Aseară am avut febră, 38,5 grade, și am luat un paracetamol.",
      "Doctor: Aveți tuse, nas înfundat, dureri de urechi?",
      "Pacient: Am o tuse seacă, mai ales noaptea. Nas înfundat nu am. Urechile nu mă dor.",
      "Doctor: Suferiți de vreo boală cronică? Luați vreun tratament zilnic?",
      "Pacient: Am hipertensiune și iau zilnic amlodipină 5 miligrame. Sunt alergic la penicilină, am făcut urticarie acum câțiva ani.",
      "Doctor: Fumați?",
      "Pacient: Nu, am renunțat acum doi ani.",
      "Doctor: Bun. Acum vă examinez. Temperatura este 37,9 grade. Tensiunea arterială 135 pe 85, pulsul 92 pe minut.",
      "Doctor: Deschideți gura, vă rog. Faringele este congestionat, amigdalele sunt mărite, cu depozite albicioase. Ganglionii laterocervicali sunt măriți și sensibili la palpare.",
      "Doctor: Ascult plămânii. Murmur vezicular prezent bilateral, fără raluri.",
      "Doctor: Cel mai probabil este o amigdalită acută, posibil bacteriană. Facem un test rapid pentru streptococ.",
      "Doctor: Pentru că sunteți alergic la penicilină, vă recomand claritromicină 500 miligrame, de două ori pe zi, timp de 7 zile, dacă testul iese pozitiv.",
      "Doctor: Pentru febră și durere puteți lua paracetamol 500 miligrame la nevoie, maxim de patru ori pe zi. Hidratare abundentă și repaus.",
      "Doctor: Dacă nu vă simțiți mai bine în 48 de ore sau apare dificultate la respirație, reveniți la control. Puteți să mă sunați la 0712345678.",
      "Pacient: Mulțumesc frumos.",
    ].join("\n"),
  },
  {
    id: "lombalgie",
    title: "Durere lombară",
    text: [
      "Doctor: Bună ziua. Cu ce vă pot ajuta?",
      "Pacient: Bună ziua. Mă doare spatele, jos, de vreo două săptămâni. Lucrez în depozit și ridic multe cutii.",
      "Doctor: Durerea iradiază în picior?",
      "Pacient: Uneori simt că merge pe piciorul stâng, până la genunchi. Nu am amorțeli.",
      "Doctor: Ați mai avut probleme cu spatele? Alte boli?",
      "Pacient: Nu am alte boli. Nu iau niciun tratament. Alergii nu știu să am.",
      "Doctor: Vă rog să vă întindeți pe canapea. Musculatura paravertebrală lombară este contractată, cu sensibilitate la palpare. Manevra Lasègue este negativă bilateral. Forța musculară este păstrată.",
      "Doctor: Deocamdată nu stabilim un diagnostic definitiv, vreau să văd o radiografie de coloană lombară.",
      "Doctor: Vă recomand să evitați ridicarea de greutăți două săptămâni și să reveniți cu radiografia.",
      "Pacient: Bine, mulțumesc.",
    ].join("\n"),
  },
  {
    id: "control-hta",
    title: "Control hipertensiune",
    text: [
      "Doctor: Bună dimineața. Ați venit la controlul pentru tensiune.",
      "Pacient: Da. Mă simt bine în general, doar uneori am dureri de cap dimineața.",
      "Doctor: V-ați măsurat tensiunea acasă?",
      "Pacient: Da, are valori pe la 150 cu 90 dimineața. Iau tratamentul, dar uneori uit.",
      "Doctor: Ce tratament luați acum?",
      "Pacient: Perindopril 5 miligrame dimineața. Am și diabet, iau metformin 1000 miligrame de două ori pe zi.",
      "Doctor: Acum tensiunea este 148 pe 92, pulsul 76. Zgomotele cardiace sunt ritmice, fără sufluri.",
      "Doctor: Diagnosticul este hipertensiune arterială insuficient controlată.",
      "Doctor: Creștem perindoprilul la 10 miligrame dimineața. Vă rog să luați tratamentul zilnic, fără pauze, și să notați valorile tensiunii.",
      "Doctor: Faceți analize: hemoglobină glicată, creatinină și profil lipidic. Control peste o lună.",
    ].join("\n"),
  },
];
