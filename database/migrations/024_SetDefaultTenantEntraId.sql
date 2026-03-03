-- Set the Entra ID tenant ID on the default tenant for JWT-based resolution (Priority 3)
UPDATE [dbo].[Tenants]
SET [EntraIdTenantId] = 'f8ac75ce-d250-407e-b8cb-e05f5b4cd913'
WHERE [Slug] = 'default' AND [EntraIdTenantId] IS NULL;
