#!/usr/bin/env bash
# Skriver ut värden från .env som ska fyllas i som GitHub Actions Secrets.
# Kör: ./scripts/print-azure-env-for-secrets.sh (eller bash scripts/print-azure-env-for-secrets.sh)
# Kopiera värdet till GitHub → Settings → Secrets → New repository secret.

set -e
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Filen .env finns inte i projektroten."
  exit 1
fi

echo "--- Fyll i dessa som GitHub Secrets (Settings → Secrets and variables → Actions) ---"
echo ""
echo "1) Secret name: EXPO_PUBLIC_AZURE_CLIENT_ID"
echo "   Value (kopiera raden nedan):"
grep -E '^EXPO_PUBLIC_AZURE_CLIENT_ID=' .env | sed 's/^EXPO_PUBLIC_AZURE_CLIENT_ID=//' || true
echo ""
echo "2) Secret name: EXPO_PUBLIC_AZURE_TENANT_ID"
echo "   Value (kopiera raden nedan, kan vara 'common' eller tom):"
grep -E '^EXPO_PUBLIC_AZURE_TENANT_ID=' .env | sed 's/^EXPO_PUBLIC_AZURE_TENANT_ID=//' || echo "common"
echo ""
echo "--- Klart. Radera inte .env; den används lokalt. ---"
