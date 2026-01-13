-- Submissions table for bug reports, enhancement requests, and questions
CREATE TABLE Submissions (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Title NVARCHAR(200) NOT NULL,
    Type NVARCHAR(20) NOT NULL CHECK (Type IN ('Bug', 'Enhancement', 'Question')),
    Priority NVARCHAR(20) NOT NULL DEFAULT 'Medium' CHECK (Priority IN ('Low', 'Medium', 'High', 'Critical')),
    Status NVARCHAR(20) NOT NULL DEFAULT 'Open' CHECK (Status IN ('Open', 'InProgress', 'Resolved', 'Closed')),
    Description NVARCHAR(MAX),
    StepsToReproduce NVARCHAR(MAX),
    ExpectedBehavior NVARCHAR(MAX),
    ActualBehavior NVARCHAR(MAX),
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CreatedBy NVARCHAR(100)
);

-- Submission attachments (store as base64 for simplicity)
CREATE TABLE SubmissionAttachments (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    SubmissionId UNIQUEIDENTIFIER NOT NULL REFERENCES Submissions(Id) ON DELETE CASCADE,
    FileName NVARCHAR(255) NOT NULL,
    ContentType NVARCHAR(100) NOT NULL,
    FileData NVARCHAR(MAX) NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
