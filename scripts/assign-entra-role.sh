#!/usr/bin/env bash
# Assign an Entra ID user to a Modern Accounting app role.
#
# Usage:
#   ./scripts/assign-entra-role.sh <email> <role>
#
# Roles: Admin, Accountant, Viewer, Employee
#
# Examples:
#   ./scripts/assign-entra-role.sh alice@company.com Admin
#   ./scripts/assign-entra-role.sh bob@company.com Accountant

set -euo pipefail

APP_CLIENT_ID="2685fbc4-b4fd-4ea7-8773-77ec0826e7af"
SP_ID="63bc5388-e308-479b-be03-16604b71598b"

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <email> <role>"
  echo "Roles: Admin, Accountant, Viewer"
  exit 1
fi

EMAIL="$1"
ROLE="$2"

# Validate role
case "$ROLE" in
  Admin)      ROLE_ID="130d606c-7fbb-4881-a29d-3c7d0a0c2c80" ;;
  Accountant) ROLE_ID="40443e11-4854-49a4-954f-7b9df4096d08" ;;
  Viewer)     ROLE_ID="a6a449ca-3f4d-40e7-8310-51851203c2b0" ;;
  *)
    echo "Error: Invalid role '$ROLE'. Must be one of: Admin, Accountant, Viewer"
    exit 1
    ;;
esac

# Look up user
echo "Looking up user: $EMAIL"
USER_ID=$(az ad user show --id "$EMAIL" --query "id" -o tsv 2>/dev/null) || {
  echo "Error: User '$EMAIL' not found in Entra ID"
  exit 1
}
echo "  User ID: $USER_ID"

# Assign role
echo "Assigning role '$ROLE' to $EMAIL..."
RESULT=$(az rest --method POST \
  --url "https://graph.microsoft.com/v1.0/servicePrincipals/$SP_ID/appRoleAssignments" \
  --body "{\"principalId\": \"$USER_ID\", \"resourceId\": \"$SP_ID\", \"appRoleId\": \"$ROLE_ID\"}" \
  2>&1) && {
  echo "$RESULT" | grep -q "principalDisplayName" && echo "  Assignment created successfully."
  echo ""
  echo "Done! $EMAIL now has the '$ROLE' role."
  echo "The user must sign out and back in for the new role to take effect."
} || {
  if echo "$RESULT" | grep -qi "already exist"; then
    echo "  User already has this role assigned. No changes needed."
  else
    echo "Error: $RESULT"
    exit 1
  fi
}
