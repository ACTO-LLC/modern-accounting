# Entra ID User Management

How to add users to Modern Accounting via Microsoft Entra ID (formerly Azure AD).

## Prerequisites

- **Azure Portal** access with at least **Cloud Application Administrator** role
- The Modern Accounting **App Registration** already exists (Client ID: `2685fbc4-b4fd-4ea7-8773-77ec0826e7af`)

## Application Roles

Modern Accounting defines 4 app roles. Users must be assigned one to access the system.

| Role | Value | Access |
|------|-------|--------|
| **Admin** | `Admin` | Full system access (all CRUD, settings, user management) |
| **Accountant** | `Accountant` | Accounting operations (invoices, bills, journal entries, banking, reports) |
| **Viewer** | `Viewer` | Read-only access to data and reports |
| **Employee** | `Employee` | Self-service (time entries, expense submission, own records only) |

## Adding a User

### Step 1: Ensure the user exists in Entra ID

1. Go to [Azure Portal](https://portal.azure.com) > **Microsoft Entra ID** > **Users**
2. If the user doesn't exist, click **New user** > **Create new user** or **Invite external user**
3. Fill in the required fields (name, email) and create

### Step 2: Assign the user to the Enterprise Application

1. Go to **Microsoft Entra ID** > **Enterprise applications**
2. Search for **Modern Accounting** (or filter by Client ID `2685fbc4-b4fd-4ea7-8773-77ec0826e7af`)
3. Click on the application > **Users and groups** in the left sidebar
4. Click **Add user/group**
5. Under **Users**, click **None Selected** and search for the user
6. Select the user and click **Select**
7. Under **Role**, click **None Selected** and choose the appropriate role (Admin, Accountant, Viewer, or Employee)
8. Click **Assign**

The user can now sign in at the production URL and will have the assigned role.

### Step 3: Verify access

1. Have the user navigate to the app URL
2. They will be redirected to Microsoft login
3. On first login, they may be prompted to consent to permissions
4. After login, their role determines what they can see and do

## Managing Roles via Entra ID Groups (Optional)

Instead of assigning roles per-user, you can map Entra ID security groups to roles for easier management.

### Create security groups

Create one group per role in **Entra ID** > **Groups**:

| Group Name | Maps to Role |
|------------|-------------|
| `MA-Admins` | Admin |
| `MA-Accountants` | Accountant |
| `MA-Viewers` | Viewer |
| `MA-Employees` | Employee |

### Configure group claims

1. Go to **Entra ID** > **App registrations** > **Modern Accounting**
2. Click **Token configuration** in the left sidebar
3. Click **Add groups claim**
4. Select **Security groups**
5. Under **Customize token properties by type**, check **Group ID** for both ID and Access tokens
6. Click **Add**

### Assign groups to the Enterprise Application

1. Go to **Enterprise applications** > **Modern Accounting** > **Users and groups**
2. Click **Add user/group**
3. Under **Users**, select the group (e.g., `MA-Admins`)
4. Under **Role**, select the corresponding role (e.g., `Admin`)
5. Click **Assign**

Now, adding a user to the `MA-Accountants` group automatically gives them the Accountant role in Modern Accounting.

## Removing a User

1. Go to **Enterprise applications** > **Modern Accounting** > **Users and groups**
2. Select the user (checkbox)
3. Click **Remove**

The user will lose access on their next login attempt.

## Changing a User's Role

1. Go to **Enterprise applications** > **Modern Accounting** > **Users and groups**
2. Click on the user's current assignment
3. Click **Edit assignment**
4. Change the role and click **Assign**

Or remove the existing assignment and add a new one with the desired role.

## Requiring User Assignment

To ensure only explicitly assigned users can access the app (recommended):

1. Go to **Enterprise applications** > **Modern Accounting** > **Properties**
2. Set **Assignment required?** to **Yes**
3. Click **Save**

With this enabled, users not assigned to the application will see an `AADSTS50105` error when trying to sign in.

## Troubleshooting

### User gets 403 after login
- Verify the user is assigned to the Enterprise Application with a role
- Check **Enterprise applications** > **Users and groups** — the user should appear with a role

### User sees "AADSTS50105: Your administrator has configured..."
- The user is not assigned to the Enterprise Application
- Follow Step 2 above to assign them

### Role not reflected in the app
- Roles are read from the access token. The user must sign out and sign back in after a role change
- Clear browser cache/cookies if the old token is cached
- Check the token at [jwt.ms](https://jwt.ms) — look for the `roles` claim

### User can sign in but sees limited data
- Check which role they're assigned — Viewer and Employee have restricted access
- Verify in **Enterprise applications** > **Users and groups** that the correct role is shown

## CLI Reference

For scripting or bulk operations, use the Azure CLI:

```bash
# List users assigned to the app
az ad app show --id 2685fbc4-b4fd-4ea7-8773-77ec0826e7af --query "appRoles"

# Get the Enterprise Application (Service Principal) object ID
SP_ID=$(az ad sp show --id 2685fbc4-b4fd-4ea7-8773-77ec0826e7af --query id -o tsv)

# List current role assignments
az rest --method GET \
  --url "https://graph.microsoft.com/v1.0/servicePrincipals/$SP_ID/appRoleAssignedTo"

# Assign a user to a role
USER_ID=$(az ad user show --id "user@company.com" --query id -o tsv)
ROLE_ID="<app-role-id>"  # Get from appRoles list above

az rest --method POST \
  --url "https://graph.microsoft.com/v1.0/servicePrincipals/$SP_ID/appRoleAssignments" \
  --body "{
    \"principalId\": \"$USER_ID\",
    \"resourceId\": \"$SP_ID\",
    \"appRoleId\": \"$ROLE_ID\"
  }"
```
