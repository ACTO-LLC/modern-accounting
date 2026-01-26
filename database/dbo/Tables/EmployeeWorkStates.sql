CREATE TABLE [dbo].[EmployeeWorkStates]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [EmployeeId] UNIQUEIDENTIFIER NOT NULL,
    [StateCode] CHAR(2) NOT NULL,
    [Percentage] DECIMAL(5,2) NOT NULL,
    [EffectiveDate] DATE NOT NULL,
    [EndDate] DATE NULL,
    [IsPrimary] BIT NOT NULL DEFAULT 0,
    [Notes] NVARCHAR(500) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT [FK_EmployeeWorkStates_Employee] FOREIGN KEY ([EmployeeId]) REFERENCES [dbo].[Employees]([Id]),
    CONSTRAINT [CK_EmployeeWorkStates_Percentage] CHECK ([Percentage] >= 0 AND [Percentage] <= 100)
)
GO

CREATE INDEX [IX_EmployeeWorkStates_EmployeeId] ON [dbo].[EmployeeWorkStates] ([EmployeeId])
GO

CREATE INDEX [IX_EmployeeWorkStates_EffectiveDate] ON [dbo].[EmployeeWorkStates] ([EffectiveDate], [EndDate])
GO
