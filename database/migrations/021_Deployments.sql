-- Migration: Create Deployments table for scheduled deployments
-- Purpose: Track scheduled deployments for approved enhancements (Issue #88)
-- Date: 2026-01-14

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Deployments')
BEGIN
    CREATE TABLE Deployments (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        EnhancementId INT NOT NULL,
        ScheduledDate DATETIME2 NOT NULL,
        Status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (Status IN ('pending', 'in-progress', 'deployed', 'failed')),
        DeployedAt DATETIME2 NULL,
        Notes NVARCHAR(MAX) NULL,
        CONSTRAINT FK_Deployments_Enhancements FOREIGN KEY (EnhancementId) REFERENCES Enhancements(Id)
    );

    CREATE INDEX IX_Deployments_Status ON Deployments(Status);
    CREATE INDEX IX_Deployments_ScheduledDate ON Deployments(ScheduledDate);
    CREATE INDEX IX_Deployments_EnhancementId ON Deployments(EnhancementId);

    PRINT 'Deployments table created successfully';
END
GO
