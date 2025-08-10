#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | xargs)
fi

# Check if required variables are set
if [ -z "$KIMAI_URL" ] || [ -z "$KIMAI_TOKEN" ]; then
    echo "Error: KIMAI_URL and KIMAI_TOKEN must be set in .env file"
    exit 1
fi

echo "Testing Kimai API token..."
echo "URL: $KIMAI_URL"
echo "Token: ${KIMAI_TOKEN:0:10}..." # Show only first 10 chars for security

# Test the API token
response=$(curl -s -H "Authorization: Bearer $KIMAI_TOKEN" "$KIMAI_URL/api/version")

# Check if curl was successful
if [ $? -eq 0 ]; then
    echo "✓ API request successful"
    echo "Response:"
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
else
    echo "✗ API request failed"
    exit 1
fi