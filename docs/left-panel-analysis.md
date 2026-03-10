# Left panel – diff-analys (Dashboard vs Project)

## STEG 1 – ANALYS

### 1.1 Används samma komponentfil?

**Nej.** Samma **container** används (`SharePointLeftPanel.js`) i båda vyerna, men **innehållet** som ritar raderna är olika:

| Vy        | Container           | Radkomponent för lista                    |
|-----------|---------------------|-------------------------------------------|
| Dashboard | SharePointLeftPanel | **Site-rad:** SidebarItem. **Barn (mappar/projekt):** RecursiveFolderView (egna `<div>`, inte SidebarItem) |
| Project   | SharePointLeftPanel | **Alla rader:** ProjectTree → ProjectTreeFolder → **SidebarItem** |

Alltså:
- **Dashboard:** Site-rubrik = SidebarItem (LEFT_NAV). Mapp-/projektrader = **RecursiveFolderView** med inline-stylade `<div>` (padding, font, border).
- **Project:** Alla rader = **ProjectTreeFolder** som anropar **SidebarItem** med LEFT_NAV.

Därför ser dashboard “tight” ut (site-raden följer LEFT_NAV) medan mappraderna är “luftigare” (RecursiveFolderView har annan padding/font). Projektvyn använder SidebarItem överallt och följer LEFT_NAV bättre.

---

### 1.2 Wrappers och layout

**SharePointLeftPanel – yttre container (rad ~2780):**

```js
padding: isWeb && selectedProject ? 0 : 8
```

- **Dashboard:** `padding: 8` på hela panelen.
- **Project:** `padding: 0` när projekt är valt.

→ Olika känsla: dashboard får luft runt, project är kant-i-kant.

**Banner (collapse/hem/refresh):**  
Samma i båda: `paddingVertical: 6`, `paddingHorizontal: 6`, `marginBottom: 12`. Bannerhöjden påverkar inte radstorlek, men total layout är densamma.

**Träd-wrappers:**

- **Dashboard:** Innehållet ligger i `<View style={{ paddingHorizontal: 4 }}>` (rad ~3258) runt `displayHierarchy`.
- **Project:** Innehållet är `<View style={{ flex: 1, minHeight: 0 }}>` (rad ~2974) runt `<ProjectTree>`.

→ Olika padding (4 vs 0) och olika syfte (flex vs bara horisontell padding).

---

### 1.3 Konkret diff – CSS / stil per radtyp

Design tokens (LEFT_NAV) som **mål**:

- `rowMinHeight`: 38  
- `rowMinHeightCompact`: 32  
- `rowPaddingVertical`: 8  
- `rowPaddingHorizontal`: 12  
- `rowFontSize`: 13  
- `rowBorderRadius`: 6  
- `indentPerLevel`: 12  
- `chevronSize`: 12  

**Dashboard – site-rad (SidebarItem):**

- Komponent: SidebarItem  
- minHeight: 32 (override)  
- paddingVertical: 8, paddingHorizontal: 12  
- fontSize: 13  
- borderRadius: 6  
- borderLeft (active): 4px  
- chevron: 12  
- indent: 0  

**Dashboard – mapp/projekt-rad (RecursiveFolderView, web):**

- Komponent: **raw `<div>`**  
- padding: **4px 8px** (inte 8/12)  
- fontSize: **14** (inte 13)  
- borderRadius: **4** (inte 6)  
- borderLeft (active): **ingen**  
- chevron: **Math.max(12, 16 - level)**  
- indent: marginLeft 12*level, **barn-wrapper marginLeft: 8**  

**Project – alla rader (ProjectTreeFolder → SidebarItem):**

- Komponent: SidebarItem  
- minHeight: 32 (header) / 38 (övriga)  
- paddingVertical: 8, paddingHorizontal: 12 (för main)  
- fontSize: 13 (via labelStyle)  
- borderRadius: 6  
- borderLeft (active): 4px  
- chevron: 12  
- indent: LEFT_NAV.indentPerLevel * level  

**Firestore-fallback (dashboard, inga sites):**  
Raw `<div>` med `padding: '6px 8px'`, `fontSize: 14` – samma problem som RecursiveFolderView.

---

### 1.4 Sammanfattning – varför det inte är identiskt

1. **RecursiveFolderView** använder inte SidebarItem utan egna div:ar med **4px 8px**, **fontSize 14**, **borderRadius 4** och ingen aktiv vänsterkant.  
2. **Container-padding** skiljer: 8 (dashboard) vs 0 (project).  
3. **Träd-wrappers** skiljer: paddingHorizontal 4 (dashboard) vs ingen (project).  
4. **Firestore-projektrader** (fallback) använder också div med 6px 8px och 14px font.

---

## STEG 2 – REFAKTORERING (plan)

1. **En radkomponent:** Alla rader ska gå via **SidebarItem** och LEFT_NAV. RecursiveFolderView (web) ska rendera **SidebarItem** istället för div.  
2. **Samma container-padding:** En gemensam padding (t.ex. 0 eller en token) för panelens innehåll oavsett vy.  
3. **Samma träd-wrapper:** Gemensam padding (t.ex. 0 eller LEFT_NAV.rowPaddingHorizontal) runt både displayHierarchy och ProjectTree.  
4. **Firestore-fallback:** Använda SidebarItem (eller samma tokens) för projektrader.  
5. **Ingen duplicerad rad-CSS:** All radstyling från LEFT_NAV + SidebarItem StyleSheet; ingen inline-styling för padding/font/height på rader (överens med “en källa till sanning”).

---

## STEG 2 – GENOMFÖRD REFAKTORERING

### Filer som ändrades

| Fil | Ändring |
|-----|--------|
| `components/common/SharePointLeftPanel.js` | 1) RecursiveFolderView (web): egna `<div>`-rader ersatta med **SidebarItem** (indent, labelStyle fontSize, LEFT_NAV.chevronSize, indentPerLevel för barn). 2) Yttre container: `padding: isWeb ? 0 : 8` så dashboard och project får samma padding på web. 3) Tillagt `StyleSheet` med `leftPanelTreeRoot: { paddingHorizontal: 0 }`. 4) Alla träd-roots använder `styles.leftPanelTreeRoot`. 5) Texter "Inga SharePoint-siter...", "Projekt (från Firestore)" använder LEFT_NAV.rowPaddingHorizontal, textMuted, rowFontSize. 6) Firestore-fallback: projektraderna använder **SidebarItem** (fullWidth, labelStyle fontSize, left=fas-dot med LEFT_NAV.phaseDotBorder). |
| `docs/left-panel-analysis.md` | Denna analys + genomförd refaktorering dokumenterad. |

Övriga komponenter som redan använde SidebarItem/LEFT_NAV ändrades inte: `SidebarItem.js`, `ProjectTreeFolder.js` (edgeToEdge), `constants/leftNavTheme.js`.

### Varför det inte såg lika ut från början

1. **Olika radkomponenter:** Dashboard använde RecursiveFolderView med egna `<div>` (4px 8px, 14px font, borderRadius 4). Projektvyn använde ProjectTreeFolder → SidebarItem. Samma container men olika innehållsstil.
2. **Olika container-padding:** Panelens padding var `selectedProject ? 0 : 8` på web, så dashboard fick 8px och project 0px.
3. **Olika träd-wrapper:** Dashboard hade `paddingHorizontal: 4` på träd-roten, project hade ingen sådan padding.

### Verifiering (computed styles)

Efter refaktorering ska båda vyerna ha:

- **Rad:** `min-height` 38 (eller 32 för rubrikrad), `padding` 8px 12px, `font-size` 13px, `border-radius` 6px, samma `border-left` vid aktiv.
- **Indent:** 12px per nivå (`indentPerLevel`).
- **Chevron:** 12px (LEFT_NAV.chevronSize).

Kontroll i DevTools: inspektera en rad i Dashboard (t.ex. ett projekt under en site) och en rad i Project (t.ex. "Översikt"). Jämför computed `padding`, `font-size`, `min-height` och `border-radius` – de ska vara identiska.
