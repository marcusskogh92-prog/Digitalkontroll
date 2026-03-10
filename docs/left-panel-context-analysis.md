# Kontextanalys: Left panel – varför Dashboard och Project inte renderas identiskt

## 1. Jämförelse DOM-struktur (utifrån kod)

### Dashboard leftpanel (inga `selectedProject`)

```
HomeScreen
  View (flex: 1, flexDirection: 'row', alignItems: 'stretch', minHeight: 0)
    SharePointLeftPanel
      View (panel root: width, padding 0, flexShrink: 0, …)
        [Resizer]
        View (banner: paddingVertical 6, paddingHorizontal 6, marginBottom 12)
        ScrollView (flex: 1)
          View (leftPanelTreeRoot: paddingHorizontal 0)     ← endast denna wrapper
            View (key=site.id, marginBottom: 0)             ← rad-wrapper
              SidebarItem (site)
              View (marginLeft: 12)
                RecursiveFolderView → SidebarItem (mapp/projekt)
```

**Antal nivåer från ScrollView till första SidebarItem:**  
ScrollView → View(leftPanelTreeRoot) → View(site) → **SidebarItem** (3 nivåer).

### Project leftpanel (`selectedProject && projectPhaseKey`)

```
HomeScreen
  View (flex: 1, flexDirection: 'row', …)                  ← samma
    SharePointLeftPanel
      View (panel root: samma)
        [Resizer]
        View (banner: samma)
        ScrollView (flex: 1)
          View (flex: 1, minHeight: 0)                     ← EXTRA wrapper (endast i project)
            ProjectTree
              View (root, ingen style)                      ← ProjectTree root
                View (key=folder.id, edgeToEdge-style)      ← rad-wrapper
                  ProjectTreeFolder → SidebarItem
```

**Antal nivåer från ScrollView till första SidebarItem:**  
ScrollView → View(flex, minHeight) → ProjectTree → View → View(folder) → **SidebarItem** (5 nivåer).

---

## 2. Skillnader (parent wrappers, flex, padding, inheritance)

| Aspekt | Dashboard | Project |
|--------|-----------|---------|
| **ScrollView → första innehåll** | View(leftPanelTreeRoot): `paddingHorizontal: 0` | View: `flex: 1, minHeight: 0` (ingen padding) |
| **Flex på scroll-innehåll** | Ingen (View har ingen flex) | `flex: 1, minHeight: 0` → påverkar hur höjd fördelas |
| **Antal wrappers till SidebarItem** | 2 (tree root + rad-View) | 4 (flex-View + ProjectTree root + rad-View + ProjectTreeFolder) |
| **Rad-wrapper margin/padding** | Site: `marginBottom: 0`. RecursiveFolderView: `marginTop: 0|2` | ProjectTree: `marginBottom: 0`, `paddingVertical: 0`, `paddingHorizontal: 0` |
| **Banner** | Samma View (paddingVertical 6, paddingHorizontal 6, marginBottom 12) | Samma |
| **Layout-komponent (HomeScreen)** | Samma View (flex row) + samma SharePointLeftPanel | Samma |

**Font/line-height:** Ingen skillnad i komponentträd ovanför panelen; båda vyerna sitter under samma HomeScreen. Eventuella skillnader kommer från olika antal wrappers (olika nesting) och från att project-innehållet har en flex-wrapper som dashboard inte har.

---

## 3. Svar på kontrollfrågor

- **Olika layout-komponenter?** Nej. Båda använder samma HomeScreen och samma `View (flex row)` med SharePointLeftPanel.
- **Olika root-containers?** Nej. Samma panel root-View.
- **Bannerhöjd olika?** Nej. Samma banner-View.
- **Leftpanel positionerad olika i layoutträdet?** Nej. Den sitter på samma plats. Skillnaden är **inuti** panelen: ScrollView har olika direktbarn (olika wrapper och olika antal nivåer till SidebarItem).

---

## 4. Konkret diff – DOM-struktur och computed styles (förväntat)

### DOM-struktur (före refaktorering)

**Dashboard – första SidebarItem (t.ex. site-rad):**  
`ScrollView` → `View(leftPanelTreeRoot)` → `View(site)` → `SidebarItem` (Pressable).

**Project – första SidebarItem (t.ex. projektnamnsrad):**  
`ScrollView` → `View(flex:1, minHeight:0)` → `ProjectTree` → `View` → `View(folder)` → `ProjectTreeFolder` → `SidebarItem` (Pressable).

Alltså fler nivåer och annan wrapper-style i project.

### Computed styles på en rad (SidebarItem)

Efter refaktorering ska båda vyerna ge samma (LEFT_NAV):

| Egenskap | Förväntat värde |
|----------|------------------|
| padding-top / padding-bottom | 8px |
| padding-left / padding-right | 12px (eller 12+indent) |
| min-height | 32 (rubrik) eller 38 (vanlig rad) |
| font-size | 13px |
| border-radius | 6px (om inte squareCorners) |

### Computed styles på scroll-content-parent (View direkt under ScrollView)

| Egenskap | Förväntat värde (båda vyerna) |
|----------|--------------------------------|
| flex | 1 (eller 1 1 0%) |
| min-height | 0 |
| padding-left / padding-right | 0 |

Om dessa skiljer mellan dashboard och project efter ändringarna, är någon gren kvar med annan wrapper eller annan style.

---

Om vi antar att SidebarItem sätter samma stil själv:

- **Padding/margin från parent:** I project finns en extra View med `flex: 1, minHeight: 0` som kan påverka hur space fördelas. I dashboard finns ingen motsvarande flex-container runt trädet.
- **Rad-wrapper:** I dashboard: View med `marginBottom: 0` (och RecursiveFolderView med `marginTop`). I project: View med `marginBottom: 0`, `paddingVertical: 0`, `paddingHorizontal: 0`. Om någon global CSS träffar “View med flex” kan det ge andra computed values för barnen i project.

För att få **identiska computed styles** på en rad behöver:

1. Samma antal och typ av wrappers mellan ScrollView och SidebarItem.
2. Samma scroll-content-wrapper (samma flex/padding) i båda vyerna.

---

## 5. Refaktorering (genomförd)

### Ändrade filer

| Fil | Ändring |
|-----|--------|
| `SharePointLeftPanel.js` | 1) Tillagt `styles.leftPanelScrollContent` (flex: 1, minHeight: 0, paddingHorizontal: 0). 2) **Alla** grenar som är direktbarn till ScrollView använder nu `View(styles.leftPanelScrollContent)` (dashboard: sites, Firestore, “Inga SharePoint-siter”, fel/laddning; project: ProjectTree, laddning). 3) `nativeID="dk-tree-root"` sätts på denna View där det är meningsfullt. |
| `ProjectTree/ProjectTree.js` | 1) Ny prop `contentOnly`. 2) Innehållet (folder-raderna) är utdraget till variabeln `folderList`. 3) När `contentOnly && edgeToEdge && compact`: returneras `React.Fragment` med `folderList` (ingen root-View). 4) Annars: returneras som tidigare `View` med “Skapa mapp”-knapp + `folderList`. |
| `docs/left-panel-context-analysis.md` | Denna analys. |

### DOM-struktur efter refaktorering

**Båda vyerna:**

```
ScrollView
  View (leftPanelScrollContent: flex 1, minHeight 0, paddingHorizontal 0)  [nativeID dk-tree-root där det gäller]
    [Dashboard: site-Views med SidebarItem / Project: folder-Views med ProjectTreeFolder → SidebarItem]
```

- Dashboard: ScrollView → View(leftPanelScrollContent) → displayHierarchy.map(site View → SidebarItem + barn).
- Project: ScrollView → View(leftPanelScrollContent) → ProjectTree (contentOnly) → Fragment → folder View → ProjectTreeFolder → SidebarItem.

Samma antal nivåer från ScrollView till rad-wrapper (1), samma flex/padding på scroll-innehållet.

### Verifiering med computed styles

1. Öppna DevTools, välj en rad (t.ex. ett projekt under en site på dashboard, eller “Översikt” i projekt).
2. Jämför på rad-elementet (Pressable/div för SidebarItem):
   - `padding`, `min-height`, `font-size`, `border-radius` ska vara lika.
3. Jämför på radens **parent**:
   - Båda ska ha en parent med `flex: 1`, `min-height: 0`, `padding-left`/`padding-right: 0` (leftPanelScrollContent).
4. Om något skiljer: kontrollera att ingen annan CSS träffar den ena vyn (t.ex. via olika class eller olika nesting).
