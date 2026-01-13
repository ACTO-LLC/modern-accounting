const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { parse } = require('csv-parse');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { OpenAIClient, AzureKeyCredential } = require('@azure/openai');
const axios = require('axios');
const sql = require('mssql');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// Azure OpenAI client - optional, only initialized if env vars are set
let client = null;
const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4';

if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) {
    client = new OpenAIClient(
        process.env.AZURE_OPENAI_ENDPOINT,
        new AzureKeyCredential(process.env.AZURE_OPENAI_API_KEY)
    );
    console.log('Azure OpenAI client initialized');
} else {
    console.log('Azure OpenAI not configured - AI categorization disabled, auto-detection still works');
}
const DAB_API_URL = process.env.DAB_API_URL || 'http://localhost:5000/api';

// Load QuickBooks training data
let trainingData = [];
try {
    const qbDataPath = path.join(__dirname, '../data/QBSE_Transactions.csv');
    const qbCsv = fs.readFileSync(qbDataPath, 'utf-8');
    parse(qbCsv, { columns: true }, (err, records) => {
        if (!err) {
            // Filter out empty rows or invalid data
            trainingData = records.filter(r => r.Category && r.Category !== 'Unreviewed' && r.Description);
            console.log(`Loaded ${trainingData.length} training transactions from QuickBooks`);
        }
    });
} catch (e) {
    console.log('QuickBooks training data not found, continuing without it');
}

// Reset Database Endpoint
app.post('/api/reset-db', async (req, res) => {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);

        // Delete in correct order to avoid FK constraints
        await sql.query`DELETE FROM JournalEntryLines`;
        await sql.query`DELETE FROM JournalEntries`;
        await sql.query`DELETE FROM BankTransactions`;
        await sql.query`DELETE FROM InvoiceLines`;
        await sql.query`DELETE FROM Invoices`;

        res.json({ success: true, message: 'Database reset successfully' });
    } catch (error) {
        console.error('Reset error:', error);
        res.status(500).json({ error: 'Failed to reset database' });
    } finally {
        await sql.close();
    }
});

// Detect CSV format
function detectFormat(firstLine, hasHeader) {
    if (!hasHeader && firstLine.length === 5) return 'wells-fargo';
    if (hasHeader) {
        const headers = firstLine.join(',').toLowerCase();
        if (headers.includes('debit') && headers.includes('credit') && headers.includes('card no')) {
            return 'capital-one';
        }
        if (headers.includes('type') && headers.includes('memo')) {
            return 'chase';
        }
        if (headers.includes('date') && headers.includes('bank') && headers.includes('account') && headers.includes('income streams')) {
            return 'qbse';
        }
    }
    return 'unknown';
}

// Parse CSV based on format
function parseTransaction(row, format) {
    switch (format) {
        case 'wells-fargo':
            return {
                transactionDate: row[0],
                amount: parseFloat(row[1]),
                description: row[4],
                rawLine: row.join(',')
            };
        case 'chase':
            return {
                transactionDate: row[0],
                postDate: row[1],
                description: row[2],
                originalCategory: row[3],
                transactionType: row[4],
                amount: parseFloat(row[5]),
                rawLine: row.join(',')
            };
        case 'capital-one':
            const debit = row[5] ? parseFloat(row[5]) : 0;
            const credit = row[6] ? parseFloat(row[6]) : 0;
            return {
                transactionDate: row[0],
                postDate: row[1],
                cardNumber: row[2],
                description: row[3],
                originalCategory: row[4],
                amount: credit > 0 ? credit : -debit,
                // For Capital One, we extract bank/account for auto-detection
                bank: 'Capital One',
                account: `Card ${row[2]}`,
                rawLine: row.join(',')
            };
        case 'qbse':
            // Date,Bank,Account,Description,Amount,Type,Category,Receipt,Notes,Income streams,Ungrouped
            // Type is 'Business' or 'Personal'
            return {
                transactionDate: row[0],
                bank: row[1],
                account: row[2],
                amount: parseFloat(row[4]),
                description: row[3],
                isPersonal: row[5] === 'Personal',
                category: row[6],
                notes: row[8],
                rawLine: row.join(',')
            };
        default:
            throw new Error('Unknown CSV format');
    }
}

// Find or create source account based on bank/account info
async function findOrCreateSourceAccount(bank, account, accounts, sqlTransaction) {
    const accountName = `${bank} - ${account}`;

    // First, check if account already exists
    let existingAccount = accounts.find(a => a.Name === accountName);
    if (existingAccount) {
        return existingAccount;
    }

    // Create new account - Credit Card if "Card" in name, otherwise Bank
    const accountType = account.toLowerCase().includes('card') ||
                        bank.toLowerCase().includes('credit') ? 'Credit Card' : 'Bank';

    // Generate a unique code for the account
    const accountCode = `AUTO-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`.toUpperCase();

    const newAccountId = crypto.randomUUID();
    const request = new sql.Request(sqlTransaction);
    request.input('Id', sql.UniqueIdentifier, newAccountId);
    request.input('Code', sql.NVarChar, accountCode);
    request.input('Name', sql.NVarChar, accountName);
    request.input('Type', sql.NVarChar, accountType);
    request.input('AccountNumber', sql.NVarChar, null);
    request.input('Description', sql.NVarChar, `Auto-created from CSV import`);
    request.input('IsActive', sql.Bit, 1);

    await request.query(`
        INSERT INTO Accounts (Id, Code, Name, Type, AccountNumber, Description, IsActive)
        VALUES (@Id, @Code, @Name, @Type, @AccountNumber, @Description, @IsActive)
    `);

    console.log(`Created new account: ${accountName} (${accountType}) [${accountCode}]`);

    return {
        Id: newAccountId,
        Name: accountName,
        Type: accountType
    };
}

// Find or create category account based on category name
async function findOrCreateCategoryAccount(categoryName, isExpense, accounts, sqlTransaction) {
    if (!categoryName || categoryName === 'Unreviewed') {
        return null;
    }

    // Check if account already exists
    let existingAccount = accounts.find(a => a.Name === categoryName);
    if (existingAccount) {
        return existingAccount;
    }

    // Create new account - Expense or Income based on transaction type
    const accountType = isExpense ? 'Expense' : 'Income';

    // Generate a unique code for the account
    const accountCode = `AUTO-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`.toUpperCase();

    const newAccountId = crypto.randomUUID();
    const request = new sql.Request(sqlTransaction);
    request.input('Id', sql.UniqueIdentifier, newAccountId);
    request.input('Code', sql.NVarChar, accountCode);
    request.input('Name', sql.NVarChar, categoryName);
    request.input('Type', sql.NVarChar, accountType);
    request.input('AccountNumber', sql.NVarChar, null);
    request.input('Description', sql.NVarChar, `Auto-created from CSV category`);
    request.input('IsActive', sql.Bit, 1);

    await request.query(`
        INSERT INTO Accounts (Id, Code, Name, Type, AccountNumber, Description, IsActive)
        VALUES (@Id, @Code, @Name, @Type, @AccountNumber, @Description, @IsActive)
    `);

    console.log(`Created new category account: ${categoryName} (${accountType}) [${accountCode}]`);

    return {
        Id: newAccountId,
        Name: categoryName,
        Type: accountType
    };
}

// AI Categorization with Training Data
async function categorizeTransaction(transaction, accounts, sourceAccount) {
    // If Azure OpenAI is not configured, return default response
    if (!client) {
        return {
            accountName: null,
            category: 'Uncategorized',
            memo: transaction.description.substring(0, 100),
            confidence: 0
        };
    }

    try {
        const similarTransactions = trainingData
            .filter(h => {
                const desc1 = h.Description.toLowerCase();
                const desc2 = transaction.description.toLowerCase();
                return desc1.includes(desc2.substring(0, 15)) || desc2.includes(desc1.substring(0, 15));
            })
            .slice(0, 5);

        const examplesText = similarTransactions.length > 0
            ? `\n\nSimilar past transactions from QuickBooks:\n${similarTransactions.map(h =>
                `- "${h.Description}" → ${h.Category}`
            ).join('\n')}`
            : '';

        const prompt = `Analyze this transaction and suggest the appropriate accounting category:

Transaction: ${transaction.description}
Amount: $${Math.abs(transaction.amount)} ${transaction.amount < 0 ? '(expense)' : '(income)'}
Date: ${transaction.transactionDate}
Source: ${sourceAccount.type} (${sourceAccount.name})
${transaction.originalCategory ? `Bank Category: ${transaction.originalCategory}` : ''}${examplesText}

Available accounts:
${accounts.map(a => `- ${a.Name} (${a.Type})`).join('\n')}

Based on the description and similar past transactions, suggest:
1. Best matching account from the list above
2. Brief memo for journal entry
3. Confidence score (0-100)

Respond ONLY with valid JSON:
{
  "accountName": "exact account name from list",
  "category": "category name",
  "memo": "brief description",
  "confidence": 85
}`;

        const response = await client.getChatCompletions(deploymentName, [
            { role: 'system', content: 'You are an accounting AI assistant. Always respond with valid JSON only.' },
            { role: 'user', content: prompt }
        ]);

        const content = response.choices[0].message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        throw new Error('Invalid AI response');
    } catch (error) {
        console.error('AI categorization error:', error);
        return {
            accountName: null,
            category: 'Uncategorized',
            memo: transaction.description.substring(0, 100),
            confidence: 0
        };
    }
}

// Import CSV endpoint
const invoicesRouter = require('./routes/invoices');
app.use('/api/invoices', invoicesRouter);

const importInvoicesRouter = require('./routes/import-invoices');
app.use('/api/import-invoices', importInvoicesRouter);

app.post('/api/import-csv', upload.single('file'), async (req, res) => {
    try {
        const { sourceAccountId, sourceType, sourceName } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const accountsResponse = await axios.get(`${DAB_API_URL}/accounts`);
        let accounts = accountsResponse.data.value || [];

        // If sourceAccountId provided, validate it exists
        const manualSourceAccount = sourceAccountId ? accounts.find(a => a.Id === sourceAccountId) : null;
        if (sourceAccountId && !manualSourceAccount) {
            return res.status(400).json({ error: 'Source account not found' });
        }

        const csvData = req.file.buffer.toString('utf-8');
        const records = await new Promise((resolve, reject) => {
            parse(csvData, { relax_column_count: true }, (err, output) => {
                if (err) reject(err);
                else resolve(output);
            });
        });

        if (records.length === 0) {
            return res.status(400).json({ error: 'Empty CSV file' });
        }

        const hasHeader = records[0].some(cell => isNaN(parseFloat(cell)));
        const format = detectFormat(records[0], hasHeader);

        if (format === 'unknown') {
            return res.status(400).json({ error: 'Unsupported CSV format' });
        }

        const startRow = hasHeader ? 1 : 0;

        // Get all records to process (all rows, not just first 10)
        const transactionsToProcess = [];
        for (let i = startRow; i < records.length; i++) {
            if (records[i].length === 0 || !records[i][0]) continue;
            transactionsToProcess.push(records[i]);
        }

        await sql.connect(process.env.DB_CONNECTION_STRING);
        const dbTransaction = new sql.Transaction();
        await dbTransaction.begin();

        try {
            // Cache for source accounts to avoid repeated lookups
            const sourceAccountCache = {};
            // Cache for category accounts
            const categoryAccountCache = {};

            const transactions = [];

            for (const record of transactionsToProcess) {
                const parsed = parseTransaction(record, format);

                // Determine source account
                let effectiveSourceAccount;
                let effectiveSourceType;
                let effectiveSourceName;

                if (manualSourceAccount) {
                    // User manually selected a source account
                    effectiveSourceAccount = manualSourceAccount;
                    effectiveSourceType = sourceType;
                    effectiveSourceName = sourceName;
                } else if (parsed.bank && parsed.account) {
                    // Auto-detect from CSV (QBSE or Capital One with bank/account fields)
                    const cacheKey = `${parsed.bank}|${parsed.account}`;
                    if (!sourceAccountCache[cacheKey]) {
                        sourceAccountCache[cacheKey] = await findOrCreateSourceAccount(
                            parsed.bank,
                            parsed.account,
                            accounts,
                            dbTransaction
                        );
                        // Add to accounts array so subsequent lookups find it
                        accounts.push(sourceAccountCache[cacheKey]);
                    }
                    effectiveSourceAccount = sourceAccountCache[cacheKey];
                    effectiveSourceType = effectiveSourceAccount.Type === 'Credit Card' ? 'CreditCard' : 'Bank';
                    effectiveSourceName = effectiveSourceAccount.Name;
                } else {
                    // No source account - error
                    throw new Error('Source account required but not provided and cannot be auto-detected');
                }

                // For QBSE format with category, auto-create/lookup category account and auto-approve
                const isQbseWithCategory = format === 'qbse' && parsed.category && parsed.category !== 'Unreviewed';
                const isCapitalOneWithCategory = format === 'capital-one' && parsed.originalCategory;

                let categoryAccount = null;
                let status = 'Pending';
                let approvedAccountId = null;
                let approvedCategory = null;
                let approvedMemo = null;

                if (isQbseWithCategory) {
                    // QBSE with category - bypass AI, auto-approve
                    const isExpense = parsed.amount < 0;
                    if (!categoryAccountCache[parsed.category]) {
                        categoryAccountCache[parsed.category] = await findOrCreateCategoryAccount(
                            parsed.category,
                            isExpense,
                            accounts,
                            dbTransaction
                        );
                        if (categoryAccountCache[parsed.category]) {
                            accounts.push(categoryAccountCache[parsed.category]);
                        }
                    }
                    categoryAccount = categoryAccountCache[parsed.category];
                    if (categoryAccount) {
                        status = 'Approved';
                        approvedAccountId = categoryAccount.Id;
                        approvedCategory = parsed.category;
                        approvedMemo = parsed.notes || parsed.description;
                    }
                } else if (isCapitalOneWithCategory) {
                    // Capital One with category - try to match existing or create
                    const isExpense = parsed.amount < 0;
                    if (!categoryAccountCache[parsed.originalCategory]) {
                        categoryAccountCache[parsed.originalCategory] = await findOrCreateCategoryAccount(
                            parsed.originalCategory,
                            isExpense,
                            accounts,
                            dbTransaction
                        );
                        if (categoryAccountCache[parsed.originalCategory]) {
                            accounts.push(categoryAccountCache[parsed.originalCategory]);
                        }
                    }
                    categoryAccount = categoryAccountCache[parsed.originalCategory];
                    if (categoryAccount) {
                        status = 'Approved';
                        approvedAccountId = categoryAccount.Id;
                        approvedCategory = parsed.originalCategory;
                        approvedMemo = parsed.description;
                    }
                }

                // Build transaction object
                const txn = {
                    SourceType: effectiveSourceType,
                    SourceName: effectiveSourceName,
                    SourceAccountId: effectiveSourceAccount.Id,
                    TransactionDate: parsed.transactionDate,
                    PostDate: parsed.postDate || null,
                    Amount: parsed.amount,
                    Description: parsed.description,
                    Merchant: parsed.description.substring(0, 200),
                    OriginalCategory: parsed.originalCategory || parsed.category || null,
                    TransactionType: parsed.transactionType || null,
                    CardNumber: parsed.cardNumber || null,
                    RawCSVLine: parsed.rawLine,
                    SuggestedAccountId: categoryAccount?.Id || null,
                    SuggestedCategory: parsed.originalCategory || parsed.category || null,
                    SuggestedMemo: parsed.notes || parsed.description,
                    ConfidenceScore: categoryAccount ? 100 : 0,
                    Status: status,
                    IsPersonal: parsed.isPersonal ? 1 : 0,
                    ApprovedAccountId: approvedAccountId,
                    ApprovedCategory: approvedCategory,
                    ApprovedMemo: approvedMemo
                };

                // Insert into database
                const request = new sql.Request(dbTransaction);
                request.input('Id', sql.UniqueIdentifier, crypto.randomUUID());
                request.input('SourceType', sql.NVarChar, txn.SourceType);
                request.input('SourceName', sql.NVarChar, txn.SourceName);
                request.input('SourceAccountId', sql.UniqueIdentifier, txn.SourceAccountId);
                request.input('TransactionDate', sql.DateTime2, txn.TransactionDate);
                request.input('PostDate', sql.DateTime2, txn.PostDate);
                request.input('Amount', sql.Decimal(19, 4), txn.Amount);
                request.input('Description', sql.NVarChar, txn.Description);
                request.input('Merchant', sql.NVarChar, txn.Merchant);
                request.input('OriginalCategory', sql.NVarChar, txn.OriginalCategory);
                request.input('TransactionType', sql.NVarChar, txn.TransactionType);
                request.input('CardNumber', sql.NVarChar, txn.CardNumber);
                request.input('RawCSVLine', sql.NVarChar, txn.RawCSVLine);
                request.input('SuggestedAccountId', sql.UniqueIdentifier, txn.SuggestedAccountId);
                request.input('SuggestedCategory', sql.NVarChar, txn.SuggestedCategory);
                request.input('SuggestedMemo', sql.NVarChar, txn.SuggestedMemo);
                request.input('ConfidenceScore', sql.Decimal(5, 2), txn.ConfidenceScore);
                request.input('Status', sql.NVarChar, txn.Status);
                request.input('CreatedDate', sql.DateTime2, new Date());
                request.input('IsPersonal', sql.Bit, txn.IsPersonal);
                request.input('ApprovedAccountId', sql.UniqueIdentifier, txn.ApprovedAccountId);
                request.input('ApprovedCategory', sql.NVarChar, txn.ApprovedCategory);
                request.input('ApprovedMemo', sql.NVarChar, txn.ApprovedMemo);

                await request.query(`
                    INSERT INTO BankTransactions (
                        Id, SourceType, SourceName, SourceAccountId, TransactionDate, PostDate,
                        Amount, Description, Merchant, OriginalCategory, TransactionType, CardNumber,
                        RawCSVLine, SuggestedAccountId, SuggestedCategory, SuggestedMemo, ConfidenceScore,
                        Status, CreatedDate, IsPersonal, ApprovedAccountId, ApprovedCategory, ApprovedMemo
                    ) VALUES (
                        @Id, @SourceType, @SourceName, @SourceAccountId, @TransactionDate, @PostDate,
                        @Amount, @Description, @Merchant, @OriginalCategory, @TransactionType, @CardNumber,
                        @RawCSVLine, @SuggestedAccountId, @SuggestedCategory, @SuggestedMemo, @ConfidenceScore,
                        @Status, @CreatedDate, @IsPersonal, @ApprovedAccountId, @ApprovedCategory, @ApprovedMemo
                    )
                `);

                transactions.push(txn);
            }

            await dbTransaction.commit();

            // Count auto-created accounts
            const sourceAccountsCreated = Object.keys(sourceAccountCache).length;
            const categoryAccountsCreated = Object.keys(categoryAccountCache).length;

            res.json({
                success: true,
                count: transactions.length,
                format,
                trainingDataCount: trainingData.length,
                sourceAccountsCreated,
                categoryAccountsCreated,
                transactions
            });

        } catch (err) {
            await dbTransaction.rollback();
            throw err;
        } finally {
            await sql.close();
        }

    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({
            error: 'Import failed',
            details: error.message
        });
    }
});

// Post transactions to journal
app.post('/api/post-transactions', async (req, res) => {
    try {
        const { transactionIds } = req.body;
        if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
            return res.status(400).json({ error: 'No transaction IDs provided' });
        }

        await sql.connect(process.env.DB_CONNECTION_STRING);
        const transaction = new sql.Transaction();
        await transaction.begin();

        try {
            let postedCount = 0;

            for (const id of transactionIds) {
                // Get transaction details
                const result = await new sql.Request(transaction)
                    .input('Id', sql.UniqueIdentifier, id)
                    .query(`
                        SELECT * FROM BankTransactions 
                        WHERE Id = @Id AND Status = 'Approved' AND JournalEntryId IS NULL
                    `);

                if (result.recordset.length === 0) continue;
                const txn = result.recordset[0];

                // Determine Debit/Credit Accounts
                // Logic:
                // Expense (Amount < 0): Debit Category, Credit Source
                // Income (Amount > 0): Debit Source, Credit Category

                let debitAccountId, creditAccountId, amount;
                const absAmount = Math.abs(txn.Amount);

                if (txn.IsPersonal) {
                    // Personal Transaction Logic
                    // Expense: Debit Owner's Draw, Credit Source
                    // Income: Debit Source, Credit Owner's Contribution

                    // We need to find the Equity accounts
                    const equityAccounts = await new sql.Request(transaction).query`SELECT * FROM Accounts WHERE Type = 'Equity'`;
                    const ownersDraw = equityAccounts.recordset.find(a => a.Name === "Owner's Draw");
                    const ownersContrib = equityAccounts.recordset.find(a => a.Name === "Owner's Contribution");

                    if (!ownersDraw || !ownersContrib) {
                        throw new Error("Owner's Equity accounts not found");
                    }

                    if (txn.Amount < 0) {
                        // Personal Expense
                        debitAccountId = ownersDraw.Id;
                        creditAccountId = txn.SourceAccountId;
                    } else {
                        // Personal Income/Deposit
                        debitAccountId = txn.SourceAccountId;
                        creditAccountId = ownersContrib.Id;
                    }

                } else {
                    // Business Transaction Logic
                    if (txn.Amount < 0) {
                        // Expense
                        debitAccountId = txn.ApprovedAccountId || txn.SuggestedAccountId;
                        creditAccountId = txn.SourceAccountId;
                    } else {
                        // Income/Payment
                        debitAccountId = txn.SourceAccountId;
                        creditAccountId = txn.ApprovedAccountId || txn.SuggestedAccountId;
                    }
                }

                if (!debitAccountId || !creditAccountId) {
                    throw new Error(`Missing account information for transaction ${id}`);
                }

                // Create Journal Entry Header
                const jeId = crypto.randomUUID();
                await new sql.Request(transaction)
                    .input('Id', sql.UniqueIdentifier, jeId)
                    .input('TransactionDate', sql.DateTime2, txn.TransactionDate)
                    .input('Description', sql.NVarChar, txn.Description)
                    .input('Reference', sql.NVarChar, `Bank Txn ${id}`)
                    .input('Status', sql.NVarChar, 'Posted')
                    .input('CreatedBy', sql.NVarChar, 'System Import')
                    .query(`
                        INSERT INTO JournalEntries (Id, TransactionDate, Description, Reference, Status, CreatedBy, PostedAt, PostedBy)
                        VALUES (@Id, @TransactionDate, @Description, @Reference, @Status, @CreatedBy, SYSDATETIME(), @CreatedBy)
                    `);

                // Create Debit Line
                await new sql.Request(transaction)
                    .input('JournalEntryId', sql.UniqueIdentifier, jeId)
                    .input('AccountId', sql.UniqueIdentifier, debitAccountId)
                    .input('Description', sql.NVarChar, txn.ApprovedMemo || txn.SuggestedMemo || txn.Description)
                    .input('Debit', sql.Decimal(19, 4), absAmount)
                    .query(`
                        INSERT INTO JournalEntryLines (JournalEntryId, AccountId, Description, Debit, Credit)
                        VALUES (@JournalEntryId, @AccountId, @Description, @Debit, 0)
                    `);

                // Create Credit Line
                await new sql.Request(transaction)
                    .input('JournalEntryId', sql.UniqueIdentifier, jeId)
                    .input('AccountId', sql.UniqueIdentifier, creditAccountId)
                    .input('Description', sql.NVarChar, txn.ApprovedMemo || txn.SuggestedMemo || txn.Description)
                    .input('Credit', sql.Decimal(19, 4), absAmount)
                    .query(`
                        INSERT INTO JournalEntryLines (JournalEntryId, AccountId, Description, Debit, Credit)
                        VALUES (@JournalEntryId, @AccountId, @Description, 0, @Credit)
                    `);

                // Update Bank Transaction
                await new sql.Request(transaction)
                    .input('Id', sql.UniqueIdentifier, id)
                    .input('JournalEntryId', sql.UniqueIdentifier, jeId)
                    .query(`
                        UPDATE BankTransactions 
                        SET Status = 'Posted', JournalEntryId = @JournalEntryId
                        WHERE Id = @Id
                    `);

                postedCount++;
            }

            await transaction.commit();
            res.json({ success: true, count: postedCount });

        } catch (err) {
            await transaction.rollback();
            throw err;
        } finally {
            await sql.close();
        }

    } catch (error) {
        console.error('Posting error:', error);
        res.status(500).json({ error: 'Failed to post transactions', details: error.message });
    }
});

const PORT = process.env.CSV_IMPORT_PORT || 7072;
app.listen(PORT, () => {
    console.log(`CSV Import API running on http://localhost:${PORT}`);
    console.log(`Training data: ${trainingData.length} transactions`);
});
