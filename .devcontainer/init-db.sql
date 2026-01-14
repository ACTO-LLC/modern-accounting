-- Create the database if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'AccountingDB')
BEGIN
    CREATE DATABASE AccountingDB;
END
GO
