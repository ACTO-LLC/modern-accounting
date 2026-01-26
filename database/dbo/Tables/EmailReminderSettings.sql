CREATE TABLE [dbo].[EmailReminderSettings]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT (newid()),
    [Name] NVARCHAR(100) NOT NULL,
    [ReminderDays] INT NOT NULL,
    [TemplateId] UNIQUEIDENTIFIER NULL,
    [IsEnabled] BIT NOT NULL DEFAULT ((1)),
    [SendTime] TIME NULL DEFAULT ('09:00:00'),
    [CooldownDays] INT NOT NULL DEFAULT ((7)),
    [MaxReminders] INT NOT NULL DEFAULT ((3)),
    [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysdatetime()),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysdatetime())
)
GO
