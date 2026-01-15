/**
 * Notification Utility
 *
 * Sends notifications via email (SMTP) or Slack webhooks.
 * Used by deployment scripts to notify teams of deployments, rollbacks, etc.
 *
 * Usage:
 *   node notify.js email <to> <subject> <body>
 *   node notify.js slack <webhook_url> <message>
 *
 * Environment Variables (Email):
 *   SMTP_HOST   - SMTP server hostname (default: localhost)
 *   SMTP_PORT   - SMTP server port (default: 587)
 *   SMTP_USER   - SMTP username (optional)
 *   SMTP_PASS   - SMTP password (optional)
 *   SMTP_FROM   - From address (default: noreply@modern-accounting.local)
 *   SMTP_SECURE - Use TLS (default: false)
 *
 * Examples:
 *   node notify.js email admin@example.com "Deployment Complete" "<h1>Success!</h1>"
 *   node notify.js slack https://hooks.slack.com/xxx "Staging deployed: v1.2.3"
 */

const nodemailer = require('nodemailer');

/**
 * Send an email notification
 */
async function sendEmail(to, subject, body) {
    if (!to || !subject) {
        throw new Error('Email requires: to, subject');
    }

    const secure = process.env.SMTP_SECURE === 'true';
    const port = parseInt(process.env.SMTP_PORT || (secure ? '465' : '587'));

    const transportConfig = {
        host: process.env.SMTP_HOST || 'localhost',
        port: port,
        secure: secure
    };

    // Add authentication if credentials are provided
    if (process.env.SMTP_USER) {
        transportConfig.auth = {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        };
    }

    const transporter = nodemailer.createTransport(transportConfig);

    const mailOptions = {
        from: process.env.SMTP_FROM || 'noreply@modern-accounting.local',
        to: to,
        subject: subject,
        html: body || ''
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${to}`);
        console.log(`Message ID: ${info.messageId}`);
        return info;
    } catch (err) {
        console.error(`Failed to send email: ${err.message}`);
        throw err;
    }
}

/**
 * Send a Slack notification via webhook
 */
async function sendSlack(webhookUrl, message) {
    if (!webhookUrl || !message) {
        throw new Error('Slack requires: webhookUrl, message');
    }

    // Validate webhook URL
    if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
        console.warn('Warning: URL does not appear to be a Slack webhook');
    }

    const payload = {
        text: message,
        unfurl_links: false,
        unfurl_media: false
    };

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Slack API error: ${response.status} - ${errorText}`);
        }

        console.log('Slack notification sent');
        return { success: true };
    } catch (err) {
        console.error(`Failed to send Slack notification: ${err.message}`);
        throw err;
    }
}

/**
 * Send a deployment notification (helper function)
 */
async function sendDeploymentNotification(environment, version, status, details = {}) {
    const emoji = status === 'success' ? ':white_check_mark:' : ':x:';
    const statusText = status === 'success' ? 'succeeded' : 'failed';

    const message = [
        `${emoji} *Deployment ${statusText}*`,
        `Environment: ${environment}`,
        `Version: ${version}`,
        details.message || ''
    ].filter(Boolean).join('\n');

    // Send to Slack if webhook is configured
    if (process.env.SLACK_WEBHOOK_URL) {
        await sendSlack(process.env.SLACK_WEBHOOK_URL, message);
    }

    // Send email if recipients are configured
    if (process.env.DEPLOY_NOTIFY_EMAIL) {
        const subject = `[${environment.toUpperCase()}] Deployment ${statusText}: ${version}`;
        const body = `
            <h2>Deployment ${statusText}</h2>
            <p><strong>Environment:</strong> ${environment}</p>
            <p><strong>Version:</strong> ${version}</p>
            <p><strong>Status:</strong> ${status}</p>
            ${details.message ? `<p>${details.message}</p>` : ''}
        `;
        await sendEmail(process.env.DEPLOY_NOTIFY_EMAIL, subject, body);
    }
}

// Export for programmatic use
module.exports = {
    sendEmail,
    sendSlack,
    sendDeploymentNotification
};

// CLI interface
if (require.main === module) {
    const [, , type, ...args] = process.argv;

    if (!type) {
        console.log('Notification Utility');
        console.log('');
        console.log('Usage:');
        console.log('  node notify.js email <to> <subject> [body]');
        console.log('  node notify.js slack <webhook_url> <message>');
        console.log('');
        console.log('Examples:');
        console.log('  node notify.js email admin@example.com "Deploy Complete" "<h1>Done!</h1>"');
        console.log('  node notify.js slack https://hooks.slack.com/xxx "Staging deployed"');
        process.exit(1);
    }

    (async () => {
        try {
            switch (type.toLowerCase()) {
                case 'email':
                    if (args.length < 2) {
                        console.error('Email requires: to, subject');
                        console.error('Usage: node notify.js email <to> <subject> [body]');
                        process.exit(1);
                    }
                    await sendEmail(args[0], args[1], args[2]);
                    break;

                case 'slack':
                    if (args.length < 2) {
                        console.error('Slack requires: webhook_url, message');
                        console.error('Usage: node notify.js slack <webhook_url> <message>');
                        process.exit(1);
                    }
                    await sendSlack(args[0], args[1]);
                    break;

                default:
                    console.error(`Unknown notification type: ${type}`);
                    console.error('Supported types: email, slack');
                    process.exit(1);
            }
            process.exit(0);
        } catch (err) {
            console.error('Notification failed:', err.message);
            process.exit(1);
        }
    })();
}
