#!/usr/bin/env bash
# Usage: run this from repo root after installing Google Cloud SDK (gsutil)
# 1) Install gcloud (mac): brew install --cask google-cloud-sdk
# 2) Authenticate: gcloud init
# 3) Run this script: ./scripts/set-storage-cors.sh

BUCKET=gs://digitalkontroll-8fd05.firebasestorage.app
CORS_FILE="./cors.json"

if [ ! -f "$CORS_FILE" ]; then
  echo "Missing $CORS_FILE — create it in repo root before running."
  exit 1
fi

echo "Setting CORS on $BUCKET using $CORS_FILE"
gsutil cors set "$CORS_FILE" "$BUCKET"

if [ $? -eq 0 ]; then
  echo "CORS updated — please clear browser cache and reload the app."
else
  echo "gsutil failed. Ensure Google Cloud SDK is installed and you're authenticated."
fi
