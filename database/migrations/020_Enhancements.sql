-- Migration: Create Enhancements table for AI feature request queue
-- Purpose: Store enhancement requests from users to be processed by AI agents (Issue #88)
-- Date: 2026-01-14

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Enhancements')
BEGIN
    CREATE TABLE Enhancements (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        RequestorName NVARCHAR(200) NOT NULL,
        Description NVARCHAR(MAX) NOT NULL,
        Status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (Status IN ('pending', 'in-progress', 'deployed', 'reverted', 'failed')),
        CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        UpdatedAt DATETIME2 NULL,
        BranchName VARCHAR(100) NULL,
        PrNumber INT NULL,
        Notes NVARCHAR(MAX) NULL
    );

    CREATE INDEX IX_Enhancements_Status ON Enhancements(Status);
    CREATE INDEX IX_Enhancements_CreatedAt ON Enhancements(CreatedAt);

    PRINT 'Enhancements table created successfully';
END
GO
