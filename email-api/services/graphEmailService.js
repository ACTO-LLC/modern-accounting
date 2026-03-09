import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';

/**
 * Send an email using Microsoft Graph API.
 * Sends as a shared mailbox (no license needed) using application permissions (Mail.Send).
 */
export async function sendGraphEmail(options) {
    const credential = new ClientSecretCredential(
        options.tenantId,
        options.clientId,
        options.clientSecret
    );

    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
        scopes: ['https://graph.microsoft.com/.default'],
    });

    const graphClient = Client.initWithMiddleware({ authProvider });

    const message = {
        subject: options.subject,
        body: {
            contentType: 'Text',
            content: options.text,
        },
        from: {
            emailAddress: {
                address: options.from.email,
                name: options.from.name,
            },
        },
        toRecipients: [
            {
                emailAddress: {
                    address: options.to,
                },
            },
        ],
        attachments: (options.attachments || []).map(att => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: att.filename,
            contentType: att.contentType || 'application/octet-stream',
            contentBytes: Buffer.isBuffer(att.content)
                ? att.content.toString('base64')
                : att.content,
        })),
    };

    if (options.replyTo) {
        message.replyTo = [
            {
                emailAddress: {
                    address: options.replyTo,
                },
            },
        ];
    }

    // CC recipients
    if (options.cc) {
        const ccList = typeof options.cc === 'string' ? options.cc.split(',').map(e => e.trim()).filter(Boolean) : [options.cc];
        message.ccRecipients = ccList.map(email => ({ emailAddress: { address: email } }));
    }

    // BCC recipients
    if (options.bcc) {
        const bccList = typeof options.bcc === 'string' ? options.bcc.split(',').map(e => e.trim()).filter(Boolean) : [options.bcc];
        message.bccRecipients = bccList.map(email => ({ emailAddress: { address: email } }));
    }

    // Send as the shared mailbox user
    await graphClient
        .api(`/users/${options.from.email}/sendMail`)
        .post({ message, saveToSentItems: true });

    return { messageId: `graph-${Date.now()}`, response: 'Sent via Microsoft Graph' };
}

/**
 * Test Microsoft Graph API connection by sending a test email from the shared mailbox.
 * Uses the Mail.Send permission (no User.Read.All needed).
 */
export async function testGraphConnection(config) {
    try {
        const credential = new ClientSecretCredential(
            config.tenantId,
            config.clientId,
            config.clientSecret
        );

        const authProvider = new TokenCredentialAuthenticationProvider(credential, {
            scopes: ['https://graph.microsoft.com/.default'],
        });

        const graphClient = Client.initWithMiddleware({ authProvider });

        // Send a test email from the shared mailbox to itself
        const message = {
            subject: 'Modern Accounting - Email Configuration Test',
            body: {
                contentType: 'Text',
                content: 'This is a test email to verify your email settings are configured correctly. You can safely delete this message.',
            },
            toRecipients: [
                { emailAddress: { address: config.fromEmail } },
            ],
        };

        await graphClient
            .api(`/users/${config.fromEmail}/sendMail`)
            .post({ message, saveToSentItems: false });

        return {
            success: true,
            message: `Test email sent successfully from ${config.fromEmail}`,
        };
    } catch (error) {
        console.error('Graph connection test failed:', error);
        return {
            success: false,
            error: error.message || 'Failed to connect to Microsoft Graph',
        };
    }
}
