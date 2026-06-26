#!/bin/bash
API_KEY="rnd_gBTgGb05YNC6Jpyt5rLUCQolLdD4"

OWNER_JSON=$(curl -s -X GET "https://api.render.com/v1/owners" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Accept: application/json")

OWNER_ID=$(echo "$OWNER_JSON" | grep -o '"id":"[^"]*"' | head -n 1 | cut -d'"' -f4)

CREATE_JSON=$(curl -s -X POST "https://api.render.com/v1/services" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "web_service",
    "name": "newapi-proxy",
    "ownerId": "'"$OWNER_ID"'",
    "env": "docker",
    "plan": "free",
    "serviceDetails": {
      "envSpecificDetails": {
        "dockerCommand": "",
        "dockerContext": ".",
        "dockerfilePath": ""
      },
      "envVars": [
        { "key": "TZ", "value": "Asia/Shanghai" }
      ]
    }
  }')

echo "$CREATE_JSON"
