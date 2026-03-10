# SSO: Fix "Kunde inte skapa session" – signBlob-behörighet

När **Logga in med arbetskonto** ger felmeddelandet **"Kunde inte skapa session. Försök igen."** och Cloud Logs visar:

- `code: auth/insufficient-permission`
- `message: Permission 'iam.serviceAccounts.signBlob' denied on resource...`

…beror det på att tjänstekontot som kör Cloud Function **ssoEntraLogin** inte får signera custom tokens. Detta är ett **IAM-behörighetsfel** i Google Cloud, inte ett kodfel.

## Lösning: Ge rätt roll åt tjänstekontot

Firebase Admin SDK använder IAM API (`iam.serviceAccounts.signBlob`) för att signera custom tokens. Tjänstekontot som kör funktionen måste ha rollen **Service Account Token Creator** på det konto som används för signering (vanligtvis App Engine-standardkontot).

### Steg i Google Cloud Console

1. Öppna **[IAM & Admin](https://console.cloud.google.com/iam-admin)** i Google Cloud Console och välj rätt projekt (t.ex. `digitalkontroll-8fd05` eller `digitalkontroll-8fd85`).

2. Gå till fliken **Service Accounts** (Tjänstekonton) eller öppna direkt:  
   **IAM & Admin → Service Accounts**.

3. Hitta **App Engine default service account**:
   - E-post: `PROJEKT_ID@appspot.gserviceaccount.com`  
   - (Ersätt `PROJEKT_ID` med ert Firebase-projekt-ID, t.ex. `digitalkontroll-8fd05`.)

4. Klicka på det här tjänstekontot (e-postraden).

5. Gå till fliken **Permissions** (Behörigheter).

6. Klicka **Grant access** / **Bevilja åtkomst** (eller **Lägg till princip**).

7. I **New principals** (Nya principer) ange **samma** tjänstekonto:
   - `PROJEKT_ID@appspot.gserviceaccount.com`

8. I **Role** (Roll) sök efter **Service Account Token Creator** och välj den.

9. Spara (Save).

Efter några minuter ska **ssoEntraLogin** kunna skapa custom tokens utan `signBlob`-felet.

### Alternativ: gcloud

Om du använder gcloud och projekt-ID är `digitalkontroll-8fd05`:

```bash
PROJECT_ID=digitalkontroll-8fd05
SA_EMAIL="${PROJECT_ID}@appspot.gserviceaccount.com"

gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountTokenCreator"
```

(Anpassa `PROJECT_ID` om ni använder ett annat projekt, t.ex. `digitalkontroll-8fd85`.)

## Referens

- [Firebase: Create custom tokens – troubleshooting](https://firebase.google.com/docs/auth/admin/create-custom-tokens#troubleshooting)
- Felet uppstår eftersom Cloud Functions (1st gen) kör som App Engine-standardkontot, som måste ha rätt att signera (Token Creator) på sig själv för att `createCustomToken()` ska fungera.
