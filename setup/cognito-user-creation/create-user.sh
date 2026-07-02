#!/bin/bash
# Create a new user in the MSK Load Simulation Tool Cognito User Pool.
#
# Usage: ./create-user.sh <user-pool-id> <username> <email> <temp-password>

set -e

USER_POOL_ID=$1
USERNAME=$2
EMAIL=$3
TEMP_PASSWORD=$4

if [ -z "$USER_POOL_ID" ] || [ -z "$USERNAME" ] || [ -z "$EMAIL" ] || [ -z "$TEMP_PASSWORD" ]; then
    echo "Usage: ./create-user.sh <user-pool-id> <username> <email> <temp-password>"
    echo ""
    echo "Example:"
    echo "  ./create-user.sh us-east-1_abc123 testuser user@example.com TempPass123!"
    exit 1
fi

echo "Creating user '$USERNAME' in pool '$USER_POOL_ID'..."

aws cognito-idp admin-create-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$USERNAME" \
    --temporary-password "$TEMP_PASSWORD" \
    --user-attributes \
        Name=email,Value="$EMAIL" \
        Name=email_verified,Value=true \
    --message-action SUPPRESS

echo "User '$USERNAME' created successfully."
echo "The user will be prompted to change password on first login."
