-- Migration 046: Seed common payment terms
-- These are standard payment terms used across accounting systems

IF NOT EXISTS (SELECT 1 FROM [dbo].[Terms] WHERE [Name] = 'Due on Receipt')
    INSERT INTO [dbo].[Terms] ([Name], [DueDays], [IsActive])
    VALUES ('Due on Receipt', 0, 1);

IF NOT EXISTS (SELECT 1 FROM [dbo].[Terms] WHERE [Name] = 'Net 15')
    INSERT INTO [dbo].[Terms] ([Name], [DueDays], [IsActive])
    VALUES ('Net 15', 15, 1);

IF NOT EXISTS (SELECT 1 FROM [dbo].[Terms] WHERE [Name] = 'Net 30')
    INSERT INTO [dbo].[Terms] ([Name], [DueDays], [IsActive])
    VALUES ('Net 30', 30, 1);

IF NOT EXISTS (SELECT 1 FROM [dbo].[Terms] WHERE [Name] = 'Net 45')
    INSERT INTO [dbo].[Terms] ([Name], [DueDays], [IsActive])
    VALUES ('Net 45', 45, 1);

IF NOT EXISTS (SELECT 1 FROM [dbo].[Terms] WHERE [Name] = 'Net 60')
    INSERT INTO [dbo].[Terms] ([Name], [DueDays], [IsActive])
    VALUES ('Net 60', 60, 1);

IF NOT EXISTS (SELECT 1 FROM [dbo].[Terms] WHERE [Name] = 'Net 90')
    INSERT INTO [dbo].[Terms] ([Name], [DueDays], [IsActive])
    VALUES ('Net 90', 90, 1);
