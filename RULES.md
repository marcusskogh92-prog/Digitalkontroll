PROMPT – Skapa GOLDEN RULES för Digitalkontroll

(kopiera exakt som en text, inga kodblock)

⸻

Vi ska nu skapa ett dokument RULES.md i repo-root som innehåller Golden Rules för utveckling av Digitalkontroll.

Syftet:
	•	Minska teknisk skuld
	•	Skapa konsekvent UI/UX
	•	Undvika framtida refactors
	•	Göra framtida promter enklare och säkrare

Dokumentet ska vara normativt (detta är regler, inte förslag).

⸻

Innehåll i RULES.md

1. UI & Design (obligatoriskt)
	•	Font-weight får aldrig överstiga 500.
	•	Primär text: normal (400–500), aldrig bold-heavy.
	•	Färger:
	•	Blå = primär action
	•	Röd/gul/grön = status (aldrig bakgrund för innehåll)
	•	Samma typografi ska användas i:
	•	Dashboard
	•	Fråga/Svar
	•	Tidsplan
	•	Projektvyer
	•	Inga “modal på modal”.
	•	En användarhandling = max en modal.

⸻

2. Komponentstorlek & kodhygien
	•	En fil ska inte överstiga ~1000 rader.
	•	Om den gör det:
	•	bryt ut logik
	•	bryt ut UI-delar
	•	Inga “gud-komponenter”.

⸻

3. State & dataflöde
	•	Firestore är alltid source of truth.
	•	SharePoint är lagring, aldrig primär logik.
	•	Excel/Word/PDF:
	•	genereras från Firestore
	•	uppdateras async
	•	får aldrig blockera UI
	•	UI ska aldrig bero på SharePoint-svar för att fungera.

⸻

4. Feedback till användaren
	•	Alla långsamma operationer ska visa:
	•	loading
	•	eller tydlig status-text
	•	Inga “tysta” fel.
	•	Fel ska:
	•	vara begripliga
	•	inte skrämma användaren
	•	Retry ska ske automatiskt när möjligt.

⸻

5. Struktur & mapp-logik
	•	Mappstrukturer är spikade när de används i projekt.
	•	UI-namn kan skilja sig från SharePoint-namn.
	•	Sortering får aldrig bero på UI-labels – endast på struktur/metadata.

⸻

6. Promt-regel (viktig)
	•	Ändra en sak i taget.
	•	Undvik:
	•	stora arkitekturskiften i samma promt
	•	flera UI-koncept samtidigt
	•	Om en promt blir lång:
	•	dela upp den
	•	pausa och verifiera mellan stegen

⸻

7. Utforskaren (vänsterträdet) – Golden Rule
	•	Alla mappar ska alltid visa mapp-ikon + namn på samma rad.
	•	Chevron får bara visas om noden faktiskt kan expandera (har/kan ha undermappar).
	•	Bladmappar (utan undermappar) ska inte expandera.
	•	Klick på en blad-mapp ska ge kort “shake/vibration” som feedback.
	•	Shake gäller bara mapp-ikonen (inte chevron eller text).
	•	Shake får bara triggas av klick (aldrig på mount/remount vid expand).

⸻

8. Modal-standard (golden rule)
	•	Alla modaler i systemet ska se ut och bete sig som Företagsinställningar (AdminCompanyModal).
	•	Detaljerad beskrivning: docs/MODAL_GOLDEN_RULE.md.
	•	Loading: Använd komponenten LoadingState (animerad spinner + text). Tema: LOADING_THEME i constants/modalTheme.js. Se MODAL_GOLDEN_RULE.md §4.
	•	Banner (header):
	•	Mörk färg (ICON_RAIL.bg). Titel 14px, undertitel 12px på en rad. Ikonruta 28×28 px. Stäng (X): mörk bakgrund, vit ikon.
	•	Footer-knappar:
	•	Stäng och Spara ska vara mörka (samma färg som bannern) med vit text.
	•	Tangentbord: Esc stänger. Enter sparar när fokus inte är i input/textarea. Tab och pilar fungerar normalt.
	•	Webb: modalen ska vara flyttbar (drag i bannern) och storleksändringbar (dra i högerkant, nederkant, nedre högra hörnet). Vid mus över kant/hörn ska muspekaren bli resize-cursor (streck med pilar, Windows-liknande).
	•	Implementering:
	•	Nya modaler: använd StandardModal (components/common/StandardModal.js).
	•	Tema: constants/modalTheme.js (MODAL_THEME). Hooks: useDraggableResizableModal, useModalKeyboard.
	•	Befintliga modaler ska uppdateras till samma utseende och beteende vid underhåll.

⸻

9. Digitalkontrolls Utforskare (filutforskaren) – Golden Rule
	•	Alla filvyer (FFU, AF, Bilder, Kalkyl, Myndigheter m.fl.) ska använda komponenten DigitalkontrollsUtforskare (components/common/DigitalkontrollsUtforskare).
	•	Underliggande implementation: SharePointFolderFileArea.
	•	Varje sektion får isolerade filer via eget rootPath.
	•	Vid buggfix eller förbättring: uppdatera SharePointFolderFileArea – ändringen gäller automatiskt överallt.
	•	Skapa-knappen: Ska alltid visas i FFU (Förfrågningsunderlag) – både på sektionsrot och inne i flikar. Dropdown: Ny mapp, Word-dokument, Excel-dokument. Alla tre ska öppna en modal för namn innan skapande (likt "Ny undermapp"). Automatisk filändelse (.docx/.xlsx) om användaren inte anger den. Duplikathantering (t.ex. "Rapport (1).docx").
	•	Flikar (lower topbar): Skapa flik, Byt namn, Ta bort via context-meny. Drag-and-drop för omordning – lift on drag, vertikal drop-indikator, push-animation, toast vid reorder. Positionsbaserad dragover (70 %-regel) och drop-zoner vid start/slut. Flikarna persisterar vid sektionsbyte.
	•	Bilder och framtida sektioner: Samma logik som Förfrågningsunderlag – inga hårdkodade undermappar vid projektkapande. Användare skapar flikar/mappar via Skapa flik eller Skapa > Ny mapp i utforskaren.
	•	Layout: Utforskaren fyller hela tillgänglig höjd ned till rail-nivå (inställningsknappen). Ingen separat grå drop-box – filerna dras direkt i listan.
	•	Filer och mappar: Tabell med kolumner (Filnamn, Typ, Uppladdad av, Skapad, Senast ändrad). Drag-and-drop av filer till listan eller till mappar. Context-meny (Byt namn, Ta bort) på rader. Inline-rename vid dubbelklick.
	•	Breadcrumb: Visar sökväg. Valfritt onBreadcrumbNavigateToSection för att navigera tillbaka till sektionsrot vid klick på första segmentet.
	•	Tomt tillstånd: "Inga filer eller mappar ännu" med instruktion att dra och släppa i listan.

⸻

Slut

Detta dokument är en del av systemets arkitektur och ska följas i all vidare utveckling.
