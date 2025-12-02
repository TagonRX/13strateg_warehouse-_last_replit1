#!/bin/bash

echo "🔐 Testing login..."

response=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"123456"}')

echo "Response: $response"

if echo "$response" | jq -e '.token' > /dev/null 2>&1; then
    echo "✅ Login successful!"
    echo "$response" | jq '.'
else
    echo "❌ Login failed!"
    echo "$response" | jq '.'
fi
