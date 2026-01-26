CREATE TABLE [dbo].[PayStubStateWithholdings]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [PayStubId] UNIQUEIDENTIFIER NOT NULL,
    [StateCode] CHAR(2) NOT NULL,
    [GrossWages] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [Percentage] DECIMAL(5,2) NOT NULL,
    [StateWithholding] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [ReciprocityApplied] BIT NOT NULL DEFAULT 0,
    [ReciprocityStateCode] CHAR(2) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT [FK_PayStubStateWithholdings_PayStub] FOREIGN KEY ([PayStubId]) REFERENCES [dbo].[PayStubs]([Id])
)
GO

CREATE INDEX [IX_PayStubStateWithholdings_PayStubId] ON [dbo].[PayStubStateWithholdings] ([PayStubId])
GO
