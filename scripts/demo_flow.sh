#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "$ curl -X POST $BASE_URL/api/documents -H 'content-type: application/json' -d @claim-packet.json"
DOCUMENT_RESPONSE="$(
  curl -sS -X POST "$BASE_URL/api/documents" \
    -H "content-type: application/json" \
    -d '{
      "channel": "email",
      "externalRef": "claim-email-1042",
      "filename": "claim-packet.txt",
      "mimeType": "text/plain",
      "contentText": "Claim Number: CLM-2026-1042\nPolicy Number: POL-88A\nClaimant: Ada Morgan\nLoss Date: 2026-05-17\nClaim Amount: $12840.50",
      "extractionProfile": "claims"
    }'
)"
echo "$DOCUMENT_RESPONSE"

DOCUMENT_ID="$(printf '%s' "$DOCUMENT_RESPONSE" | python -c "import json,sys; print(json.load(sys.stdin)['documentId'])")"

echo
echo "$ curl $BASE_URL/api/documents/$DOCUMENT_ID"
for _ in 1 2 3 4 5; do
  curl -sS "$BASE_URL/api/documents/$DOCUMENT_ID"
  echo
  sleep 1
done

