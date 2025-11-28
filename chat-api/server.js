import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { OpenAIClient, AzureKeyCredential } from '@azure/openai';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAIClient(
    process.env.AZURE_OPENAI_ENDPOINT,
    new AzureKeyCredential(process.env.AZURE_OPENAI_API_KEY)
);

const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4';
const DAB_API_URL = process.env.DAB_API_URL || 'http://localhost:5000/api';

const tools = [
    {
        type: 'function',
        function: {
            name: 'get_invoices',
            description: 'Retrieve invoices',
            parameters: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Max invoices to return' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'copy_invoice',
            description: 'Copy an existing invoice by invoice number',
            parameters: {
                type: 'object',
                properties: {
                    invoice_number: { type: 'string', description: 'Invoice number to copy' }
                },
                required: ['invoice_number']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_all',
            description: 'Search across all entities (customers, invoices, journal entries)',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search term' }
                },
                required: ['query']
            }
        }
    }
];

async function executeGetInvoices(params) {
    return { success: false, error: 'Invoices not currently available' };
    /*
    try {
        let url = `${DAB_API_URL}/invoices`;
        if (params.limit) url += `?$top=${params.limit}`;
        const response = await axios.get(url);
        const invoices = response.data.value || [];
        return {
            success: true,
            count: invoices.length,
            invoices: invoices.map(inv => ({
                id: inv.Id,
                number: inv.InvoiceNumber,
                amount: `$${inv.TotalAmount}`,
                status: inv.Status,
                link: `http://localhost:5173/invoices/${inv.Id}/edit`
            }))
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
    */
}

async function executeCopyInvoice(params) {
    return { success: false, error: 'Invoices not currently available' };
    /*
    try {
        const response = await axios.get(
            `${DAB_API_URL}/invoices?$filter=InvoiceNumber eq '${params.invoice_number}'`
        );
        if (!response.data.value || response.data.value.length === 0) {
            return { success: false, error: `Invoice ${params.invoice_number} not found` };
        }
        const source = response.data.value[0];
        const newInvoice = {
            InvoiceNumber: `${source.InvoiceNumber}-COPY-${Date.now()}`,
            CustomerId: source.CustomerId,
            TotalAmount: source.TotalAmount,
            IssueDate: new Date().toISOString().split('T')[0],
            DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            Status: 'Draft'
        };
        const createResponse = await axios.post(`${DAB_API_URL}/invoices`, newInvoice);
        const newId = createResponse.data.Id || createResponse.data.value?.[0]?.Id;
        return {
            success: true,
            message: `Created ${newInvoice.InvoiceNumber}`,
            invoice: {
                id: newId,
                number: newInvoice.InvoiceNumber,
                amount: `$${newInvoice.TotalAmount}`,
                link: `http://localhost:5173/invoices/${newId}/edit`
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
    */
}

async function executeSearchAll(params) {
    try {
        const query = params.query;
        const results = { customers: [], invoices: [], journalEntries: [] };

        // try {
        //     const custResponse = await axios.get(
        //         `${DAB_API_URL}/customers?$filter=contains(Name, '${query}')`
        //     );
        //     results.customers = (custResponse.data.value || []).map(c => ({
        //         id: c.Id,
        //         name: c.Name,
        //         email: c.Email,
        //         link: `http://localhost:5173/customers`
        //     }));
        // } catch (e) { }

        // try {
        //     const invResponse = await axios.get(
        //         `${DAB_API_URL}/invoices?$filter=contains(InvoiceNumber, '${query}')`
        //     );
        //     results.invoices = (invResponse.data.value || []).map(inv => ({
        //         id: inv.Id,
        //         number: inv.InvoiceNumber,
        //         amount: `$${inv.TotalAmount}`,
        //         status: inv.Status,
        //         link: `http://localhost:5173/invoices/${inv.Id}/edit`
        //     }));
        // } catch (e) { }

        try {
            const jeResponse = await axios.get(
                `${DAB_API_URL}/journalentries?$filter=contains(Reference, '${query}') or contains(Description, '${query}')`
            );
            results.journalEntries = (jeResponse.data.value || []).map(je => ({
                id: je.Id,
                reference: je.Reference,
                description: je.Description,
                date: je.TransactionDate,
                link: `http://localhost:5173/journal-entries`
            }));
        } catch (e) { }

        const totalResults = results.customers.length + results.invoices.length + results.journalEntries.length;

        return {
            success: true,
            query,
            totalResults,
            results
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

app.post('/api/chat', async (req, res) => {
    try {
        const { message, history = [] } = req.body;
        const messages = [
            {
                role: 'system',
                content: 'You are a helpful accounting assistant. Use get_invoices to retrieve invoices. Use copy_invoice to duplicate invoices. Use search_all to search across customers, invoices, and journal entries. When showing data, include clickable links formatted as: [text](link). Be conversational and helpful.'
            },
            ...history.map(msg => ({ role: msg.role, content: msg.content })),
            { role: 'user', content: message }
        ];

        let response = await client.getChatCompletions(deploymentName, messages, { tools, toolChoice: 'auto' });
        let responseMessage = response.choices[0].message;

        if (responseMessage.toolCalls && responseMessage.toolCalls.length > 0) {
            const toolCall = responseMessage.toolCalls[0];
            let functionArgs = {};
            try {
                functionArgs = JSON.parse(toolCall.function.arguments);
            } catch (e) {
                console.error('Parse error:', e);
            }

            let functionResult;
            if (toolCall.function.name === 'get_invoices') {
                functionResult = await executeGetInvoices(functionArgs);
            } else if (toolCall.function.name === 'copy_invoice') {
                functionResult = await executeCopyInvoice(functionArgs);
            } else if (toolCall.function.name === 'search_all') {
                functionResult = await executeSearchAll(functionArgs);
            } else {
                functionResult = { success: false, error: 'Unknown function' };
            }

            messages.push(responseMessage);
            messages.push({ role: 'tool', toolCallId: toolCall.id, content: JSON.stringify(functionResult) });
            response = await client.getChatCompletions(deploymentName, messages, { tools, toolChoice: 'auto' });
            responseMessage = response.choices[0].message;
        }

        res.json({ response: responseMessage.content });
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Failed to process chat request', details: error.message });
    }
});

const PORT = process.env.PORT || 7071;
app.listen(PORT, () => {
    console.log(`Chat API running on http://localhost:${PORT}`);
    console.log(`Deployment: ${deploymentName}`);
});
