CREATE TABLE [dbo].[StateTaxReciprocity]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [ResidentState] CHAR(2) NOT NULL,
    [WorkState] CHAR(2) NOT NULL,
    [ReciprocityType] NVARCHAR(50) NOT NULL,
    [Description] NVARCHAR(500) NULL,
    [EffectiveDate] DATE NOT NULL DEFAULT '2024-01-01',
    [EndDate] DATE NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT [UQ_StateTaxReciprocity_States] UNIQUE ([ResidentState], [WorkState], [EffectiveDate])
)
GO

CREATE INDEX [IX_StateTaxReciprocity_Lookup] ON [dbo].[StateTaxReciprocity] ([ResidentState], [WorkState], [IsActive])
GO
