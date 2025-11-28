const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { parse } = require('csv-parse');
const fs = require('fs');
const path = require('path');
const { OpenAIClient, AzureKeyCredential } = require('@azure/openai');
const axios = require('axios');
const sql = require('mssql');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

const client = new OpenAIClient(
    process.env.AZURE_OPENAI_ENDPOINT,
    new AzureKeyCredential(process.env.AZURE_OPENAI_API_KEY)
);

const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4';
const DAB_API_URL = process.env.DAB_API_URL || 'http://localhost:5000/api';

// Load QuickBooks training data
let trainingData = [];
try {
    const qbDataPath = path.join(__dirname, '../data/QBSE_Transactions.csv');
    const qbCsv = fs.readFileSync(qbDataPath, 'utf-8');
    parse(qbCsv, { columns: true }, (err, records) => {
        if (!err) {
            trainingData = records.filter(r => r.Category && r.Category !== 'Unreviewed');
            console.log(`Loaded ${trainingData.length} training transactions from QuickBooks`);
        }
    });
} catch (e) {
    console.log('QuickBooks training data not found, continuing without it');
}

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
                rawLine: row.join(',')
            };
        default:
            throw new Error('Unknown CSV format');
    }
}

// AI Categorization with Training Data
async function categorizeTransaction(transaction, accounts, sourceAccount) {
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
        const accounts = accountsResponse.data.value || [];

        const sourceAccount = accounts.find(a => a.Id === sourceAccountId);
        if (!sourceAccount) {
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

        const transactionsToProcess = [];
        for (let i = startRow; i < Math.min(records.length, startRow + 10); i++) {
            if (records[i].length === 0 || !records[i][0]) continue;
            transactionsToProcess.push(records[i]);
        }

        const transactions = await Promise.all(transactionsToProcess.map(async (record) => {
            const parsed = parseTransaction(record, format);

            const categorization = await categorizeTransaction(
                parsed,
                accounts,
                { type: sourceType, name: sourceName }
            );

            const suggestedAccount = accounts.find(a => a.Name === categorization.accountName);

            return {
                SourceType: sourceType,
                SourceName: sourceName,
                SourceAccountId: sourceAccountId,
                TransactionDate: parsed.transactionDate,
                PostDate: parsed.postDate || null,
                Amount: parsed.amount,
                Description: parsed.description,
                Merchant: parsed.description.substring(0, 200),
                OriginalCategory: parsed.originalCategory || null,
                TransactionType: parsed.transactionType || null,
                CardNumber: parsed.cardNumber || null,
                RawCSVLine: parsed.rawLine,
                SuggestedAccountId: suggestedAccount?.Id || null,
                SuggestedCategory: categorization.category,
                SuggestedMemo: categorization.memo,
                ConfidenceScore: categorization.confidence,
                Status: 'Pending'
            };
        }));

        // Save to Database
        await sql.connect(process.env.DB_CONNECTION_STRING);
        const transaction = new sql.Transaction();
        await transaction.begin();

        try {
            for (const txn of transactions) {
                const request = new sql.Request(transaction);
                request.input('Id', sql.UniqueIdentifier, crypto.randomUUID());
                request.input('SourceType', sql.NVarChar, txn.SourceType);
                request.input('BankName', sql.NVarChar, txn.SourceName);
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

                await request.query(`
                    INSERT INTO BankTransactions (
                        Id, SourceType, BankName, SourceAccountId, TransactionDate, PostDate, 
                        Amount, Description, Merchant, OriginalCategory, TransactionType, CardNumber, 
                        RawCSVLine, SuggestedAccountId, SuggestedCategory, SuggestedMemo, ConfidenceScore, 
                        Status, CreatedDate
                    ) VALUES (
                        @Id, @SourceType, @BankName, @SourceAccountId, @TransactionDate, @PostDate, 
                        @Amount, @Description, @Merchant, @OriginalCategory, @TransactionType, @CardNumber, 
                        @RawCSVLine, @SuggestedAccountId, @SuggestedCategory, @SuggestedMemo, @ConfidenceScore, 
                        @Status, @CreatedDate
                    )
                `);
            }
            await transaction.commit();
        } catch (err) {
            await transaction.rollback();
            throw err;
        } finally {
            await sql.close();
        }

        res.json({
            success: true,
            count: transactions.length,
            format,
            trainingDataCount: trainingData.length,
            transactions
        });

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

                if (txn.Amount < 0) {
                    // Expense
                    debitAccountId = txn.ApprovedAccountId || txn.SuggestedAccountId;
                    creditAccountId = txn.SourceAccountId;
                } else {
                    // Income/Payment
                    debitAccountId = txn.SourceAccountId;
                    creditAccountId = txn.ApprovedAccountId || txn.SuggestedAccountId;
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
