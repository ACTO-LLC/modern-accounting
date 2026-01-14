-- Migration: 008_AddQBOConnections
-- Purpose: Store QBO OAuth tokens for persistent connections and automated testing
-- Date: 2026-01-13

-- QBO Connections table - stores OAuth credentials per company
CREATE TABLE QBOConnections (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    RealmId NVARCHAR(50) NOT NULL UNIQUE,  -- QBO company ID
    CompanyName NVARCHAR(255) NULL,
    AccessToken NVARCHAR(MAX) NOT NULL,
    RefreshToken NVARCHAR(MAX) NOT NULL,
    TokenExpiry DATETIME2 NOT NULL,
    RefreshTokenExpiry DATETIME2 NULL,  -- Refresh tokens expire in 100 days
    Environment NVARCHAR(20) DEFAULT 'sandbox',  -- 'sandbox' or 'production'
    IsActive BIT DEFAULT 1,
    LastUsedAt DATETIME2 NULL,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE()
);

-- Index for quick lookup by RealmId
CREATE INDEX IX_QBOConnections_RealmId ON QBOConnections(RealmId);

-- Index for finding active connections
CREATE INDEX IX_QBOConnections_Active ON QBOConnections(IsActive) WHERE IsActive = 1;

PRINT 'QBOConnections table created successfully';
