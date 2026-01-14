#!/bin/bash
# Wait for SQL Server and create the database

echo "Waiting for SQL Server to be ready..."
for i in {1..30}; do
    /opt/mssql-tools18/bin/sqlcmd -S database -U sa -P "StrongPassword123!" -C -Q "SELECT 1" &>/dev/null && break
    sleep 2
done

echo "Creating AccountingDB if not exists..."
/opt/mssql-tools18/bin/sqlcmd -S database -U sa -P "StrongPassword123!" -C -Q "IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'AccountingDB') CREATE DATABASE AccountingDB"

echo "Database initialization complete"
