# Analys: Spara Kund & Beställare (permission-denied / not-found)

## Vad som händer när du sparar

1. **UI:** Du fyller i Kund & Beställare (t.ex. Lejonfastigheter) och klickar **Spara**.
2. **Kod:** `OversiktSummary` → `updateProjectInHierarchy(updates)` → `patchCompanyProject(companyId, projectId, patch)`.
3. **Sökväg:** `foretag/{companyId}/projects/{projectId}`  
   T.ex. `foretag/MS Byggsystem/projects/2026-02-29`.
4. **Operation:**  
   - Om vi **inte** ändrar projektnummer: `setDoc(ref, payload, { merge: true })`.  
   - Om dokumentet **inte finns** → Firestore utvärderar **create**-regler.  
   - Om dokumentet **finns** → Firestore utvärderar **update**-regler.

## Möjliga fel och orsaker

| Fel | Betydelse |
|-----|-----------|
| **permission-denied** | Ingen create/update-regel tillät skriv. T.ex. token saknar `email`/`superadmin` och regeln kastade eller gav false. |
| **not-found** | `updateDoc()` användes mot ett dokument som inte finns. (Åtgärdat med `setDoc(..., { merge: true })`.) |

## Åtgärder som är gjorda

1. **setDoc med merge**  
   Vid “bara kund” (ingen projektnummerändring) används `setDoc(ref, payload, { merge: true })` så att dokumentet skapas om det inte finns.

2. **Create-regel utan projektnummer-index**  
   En create-regel tillåter att skapa projekt-dokument **utan** `projectNumberIndexId` (t.ex. bara kund) för användare som är företagsmedlem, global admin eller projektmedlem.

3. **Säkra token-claims i regler**  
   - `isGlobalAdmin()` och den explicita superadmin-regeln använder nu `request.auth.token.get('email', '')`, `request.auth.token.get('superadmin', false)` osv.  
   - Då kastar reglerna inte om t.ex. `email` eller `superadmin` saknas i token (t.ex. vid vissa inloggningsmetoder).

4. **isCompanyMember(company)**  
   Använder `request.auth.token.get('companyId', '')` så att saknad `companyId` inte får regeln att kasta.

## Vad du ska göra nu

1. **Deploya reglerna** (om du inte redan kört deploy efter senaste ändringarna):
   ```bash
   npm run firebase:deploy:rules
   ```

2. **Hård ladda om appen** (Ctrl+Shift+R / Cmd+Shift+R) eller logga ut och logga in igen så att en ny token med rätt claims används.

3. **Testa igen:** Projektinformation → Kund & Beställare → fyll i kund → Spara.

4. Om det **fortfarande** nekas:
   - Öppna Firebase Console → **Authentication** → din användare och kontrollera att e-post stämmer.
   - Kontrollera i **Firestore** att reglerna som visas under “Regler” matchar din lokala `firestore.rules` (särskilt `foretag/{company}/projects/{projectId}` create/update).
