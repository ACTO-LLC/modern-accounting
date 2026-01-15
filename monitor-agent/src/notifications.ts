/**
 * Notifications module for Monitor Agent
 *
 * Handles email and Slack notifications for enhancement status updates.
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from './config.js';

// Nodemailer transporter
let transporter: Transporter | null = null;

/**
 * Get configured email transporter
 */
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth:
        config.smtp.user && config.smtp.password
          ? {
              user: config.smtp.user,
              pass: config.smtp.password,
            }
          : undefined,
    });
  }
  return transporter;
}

/**
 * Enhancement notification data
 */
export interface EnhancementNotification {
  id: number;
  title: string;
  status: string;
  prUrl?: string;
  error?: string;
}

/**
 * Deployment notification data
 */
export interface DeploymentNotification {
  enhancementId: number;
  description: string;
  requestorName: string;
  status: 'deployed' | 'failed';
  prNumber?: number;
  error?: string;
}

/**
 * Send an email notification
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  html?: string
): Promise<boolean> {
  if (!config.features.enableEmailNotifications) {
    console.log('[EMAIL DISABLED] Would send to:', to, 'Subject:', subject);
    return true;
  }

  try {
    const transport = getTransporter();

    await transport.sendMail({
      from: config.smtp.from,
      to,
      subject,
      text: body,
      html: html || body,
    });

    console.log(`Email sent to ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

/**
 * Send a Slack notification
 */
export async function sendSlack(
  webhookUrl: string,
  message: string,
  attachments?: SlackAttachment[]
): Promise<boolean> {
  if (!config.features.enableSlackNotifications) {
    console.log('[SLACK DISABLED] Would send:', message);
    return true;
  }

  try {
    const payload = {
      text: message,
      attachments,
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status}`);
    }

    console.log('Slack notification sent');
    return true;
  } catch (error) {
    console.error('Failed to send Slack notification:', error);
    return false;
  }
}

/**
 * Slack attachment structure
 */
export interface SlackAttachment {
  color?: string;
  title?: string;
  text?: string;
  fields?: Array<{
    title: string;
    value: string;
    short?: boolean;
  }>;
}

/**
 * Notify about enhancement started
 */
export async function notifyEnhancementStarted(
  enhancement: EnhancementNotification,
  recipients: string[]
): Promise<void> {
  const subject = `[Monitor Agent] Enhancement #${enhancement.id} Started: ${enhancement.title}`;

  const body = `
Enhancement Processing Started
==============================

ID: ${enhancement.id}
Title: ${enhancement.title}
Status: ${enhancement.status}

The Monitor Agent has started processing this enhancement request.
You will receive updates as the implementation progresses.

---
This is an automated message from the Monitor Agent.
`.trim();

  const html = `
<h2>Enhancement Processing Started</h2>
<table style="border-collapse: collapse;">
  <tr><td style="padding: 8px; font-weight: bold;">ID:</td><td style="padding: 8px;">${enhancement.id}</td></tr>
  <tr><td style="padding: 8px; font-weight: bold;">Title:</td><td style="padding: 8px;">${enhancement.title}</td></tr>
  <tr><td style="padding: 8px; font-weight: bold;">Status:</td><td style="padding: 8px;">${enhancement.status}</td></tr>
</table>
<p>The Monitor Agent has started processing this enhancement request.</p>
<p>You will receive updates as the implementation progresses.</p>
<hr>
<p style="color: #666; font-size: 12px;">This is an automated message from the Monitor Agent.</p>
`.trim();

  // Send emails
  for (const recipient of recipients) {
    await sendEmail(recipient, subject, body, html);
  }

  // Send Slack if configured
  if (config.slack.webhookUrl) {
    await sendSlack(config.slack.webhookUrl, `Enhancement #${enhancement.id} started: ${enhancement.title}`, [
      {
        color: '#2196F3',
        title: `Enhancement #${enhancement.id}`,
        text: enhancement.title,
        fields: [{ title: 'Status', value: enhancement.status, short: true }],
      },
    ]);
  }
}

/**
 * Notify about PR created
 */
export async function notifyPRCreated(
  enhancement: EnhancementNotification,
  recipients: string[]
): Promise<void> {
  const subject = `[Monitor Agent] PR Created for Enhancement #${enhancement.id}: ${enhancement.title}`;

  const body = `
Pull Request Created
====================

ID: ${enhancement.id}
Title: ${enhancement.title}
Status: ${enhancement.status}
PR URL: ${enhancement.prUrl || 'N/A'}

A pull request has been created for this enhancement.
Please review the changes and provide feedback.

---
This is an automated message from the Monitor Agent.
`.trim();

  const html = `
<h2>Pull Request Created</h2>
<table style="border-collapse: collapse;">
  <tr><td style="padding: 8px; font-weight: bold;">ID:</td><td style="padding: 8px;">${enhancement.id}</td></tr>
  <tr><td style="padding: 8px; font-weight: bold;">Title:</td><td style="padding: 8px;">${enhancement.title}</td></tr>
  <tr><td style="padding: 8px; font-weight: bold;">Status:</td><td style="padding: 8px;">${enhancement.status}</td></tr>
  <tr><td style="padding: 8px; font-weight: bold;">PR URL:</td><td style="padding: 8px;"><a href="${enhancement.prUrl}">${enhancement.prUrl}</a></td></tr>
</table>
<p>A pull request has been created for this enhancement.</p>
<p>Please review the changes and provide feedback.</p>
<hr>
<p style="color: #666; font-size: 12px;">This is an automated message from the Monitor Agent.</p>
`.trim();

  for (const recipient of recipients) {
    await sendEmail(recipient, subject, body, html);
  }

  if (config.slack.webhookUrl) {
    await sendSlack(config.slack.webhookUrl, `PR created for Enhancement #${enhancement.id}`, [
      {
        color: '#4CAF50',
        title: `Enhancement #${enhancement.id}`,
        text: enhancement.title,
        fields: [
          { title: 'Status', value: enhancement.status, short: true },
          { title: 'PR', value: enhancement.prUrl || 'N/A', short: true },
        ],
      },
    ]);
  }
}

/**
 * Notify about enhancement completed
 */
export async function notifyEnhancementCompleted(
  enhancement: EnhancementNotification,
  recipients: string[]
): Promise<void> {
  const subject = `[Monitor Agent] Enhancement #${enhancement.id} Completed: ${enhancement.title}`;

  const body = `
Enhancement Completed
=====================

ID: ${enhancement.id}
Title: ${enhancement.title}
Status: ${enhancement.status}
PR URL: ${enhancement.prUrl || 'N/A'}

This enhancement has been successfully completed and merged.

---
This is an automated message from the Monitor Agent.
`.trim();

  const html = `
<h2>Enhancement Completed</h2>
<table style="border-collapse: collapse;">
  <tr><td style="padding: 8px; font-weight: bold;">ID:</td><td style="padding: 8px;">${enhancement.id}</td></tr>
  <tr><td style="padding: 8px; font-weight: bold;">Title:</td><td style="padding: 8px;">${enhancement.title}</td></tr>
  <tr><td style="padding: 8px; font-weight: bold;">Status:</td><td style="padding: 8px; color: #4CAF50;">${enhancement.status}</td></tr>
  <tr><td style="padding: 8px; font-weight: bold;">PR URL:</td><td style="padding: 8px;"><a href="${enhancement.prUrl}">${enhancement.prUrl}</a></td></tr>
</table>
<p>This enhancement has been successfully completed and merged.</p>
<hr>
<p style="color: #666; font-size: 12px;">This is an automated message from the Monitor Agent.</p>
`.trim();

  for (const recipient of recipients) {
    await sendEmail(recipient, subject, body, html);
  }

  if (config.slack.webhookUrl) {
    await sendSlack(config.slack.webhookUrl, `Enhancement #${enhancement.id} completed!`, [
      {
        color: '#4CAF50',
        title: `Enhancement #${enhancement.id} - Completed`,
        text: enhancement.title,
        fields: [
          { title: 'Status', value: enhancement.status, short: true },
          { title: 'PR', value: enhancement.prUrl || 'N/A', short: true },
        ],
      },
    ]);
  }
}

/**
 * Notify about enhancement failed
 */
export async function notifyEnhancementFailed(
  enhancement: EnhancementNotification,
  recipients: string[]
): Promise<void> {
  const subject = `[Monitor Agent] Enhancement #${enhancement.id} Failed: ${enhancement.title}`;

  const body = `
Enhancement Failed
==================

ID: ${enhancement.id}
Title: ${enhancement.title}
Status: ${enhancement.status}
Error: ${enhancement.error || 'Unknown error'}

The enhancement processing has failed. Please review the error and take appropriate action.

---
This is an automated message from the Monitor Agent.
`.trim();

  const html = `
<h2>Enhancement Failed</h2>
<table style="border-collapse: collapse;">
  <tr><td style="padding: 8px; font-weight: bold;">ID:</td><td style="padding: 8px;">${enhancement.id}</td></tr>
  <tr><td style="padding: 8px; font-weight: bold;">Title:</td><td style="padding: 8px;">${enhancement.title}</td></tr>
  <tr><td style="padding: 8px; font-weight: bold;">Status:</td><td style="padding: 8px; color: #F44336;">${enhancement.status}</td></tr>
  <tr><td style="padding: 8px; font-weight: bold;">Error:</td><td style="padding: 8px; color: #F44336;">${enhancement.error || 'Unknown error'}</td></tr>
</table>
<p>The enhancement processing has failed. Please review the error and take appropriate action.</p>
<hr>
<p style="color: #666; font-size: 12px;">This is an automated message from the Monitor Agent.</p>
`.trim();

  for (const recipient of recipients) {
    await sendEmail(recipient, subject, body, html);
  }

  if (config.slack.webhookUrl) {
    await sendSlack(config.slack.webhookUrl, `Enhancement #${enhancement.id} failed!`, [
      {
        color: '#F44336',
        title: `Enhancement #${enhancement.id} - Failed`,
        text: enhancement.title,
        fields: [
          { title: 'Status', value: enhancement.status, short: true },
          { title: 'Error', value: enhancement.error || 'Unknown', short: false },
        ],
      },
    ]);
  }
}

/**
 * Send a generic notification
 */
export async function notify(
  recipients: string[],
  subject: string,
  body: string,
  slackMessage?: string
): Promise<void> {
  for (const recipient of recipients) {
    await sendEmail(recipient, subject, body);
  }

  if (config.slack.webhookUrl && slackMessage) {
    await sendSlack(config.slack.webhookUrl, slackMessage);
  }
}

/**
 * Send deployment notification (success or failure)
 */
export async function sendDeploymentNotification(
  notification: DeploymentNotification
): Promise<void> {
  const { enhancementId, description, requestorName, status, prNumber, error } =
    notification;

  const isSuccess = status === 'deployed';
  const statusColor = isSuccess ? '#4CAF50' : '#F44336';
  const statusEmoji = isSuccess ? 'check_circle' : 'x';
  const statusText = isSuccess ? 'Deployed' : 'Failed';

  const subject = `[Monitor Agent] Deployment ${statusText}: Enhancement #${enhancementId}`;

  const body = `
Deployment ${statusText}
${'='.repeat(statusText.length + 11)}

Enhancement ID: ${enhancementId}
Description: ${description}
Requestor: ${requestorName || 'Unknown'}
Status: ${statusText}
${prNumber ? `PR Number: #${prNumber}` : ''}
${error ? `Error: ${error}` : ''}

${isSuccess ? 'The enhancement has been successfully deployed to production.' : 'The deployment failed. Please review the error and take appropriate action.'}

---
This is an automated message from the Monitor Agent.
`.trim();

  const html = `
<h2>Deployment ${statusText}</h2>
<table style="border-collapse: collapse;">
  <tr><td style="padding: 8px; font-weight: bold;">Enhancement ID:</td><td style="padding: 8px;">${enhancementId}</td></tr>
  <tr><td style="padding: 8px; font-weight: bold;">Description:</td><td style="padding: 8px;">${description}</td></tr>
  <tr><td style="padding: 8px; font-weight: bold;">Requestor:</td><td style="padding: 8px;">${requestorName || 'Unknown'}</td></tr>
  <tr><td style="padding: 8px; font-weight: bold;">Status:</td><td style="padding: 8px; color: ${statusColor};">${statusText}</td></tr>
  ${prNumber ? `<tr><td style="padding: 8px; font-weight: bold;">PR Number:</td><td style="padding: 8px;">#${prNumber}</td></tr>` : ''}
  ${error ? `<tr><td style="padding: 8px; font-weight: bold;">Error:</td><td style="padding: 8px; color: #F44336;">${error}</td></tr>` : ''}
</table>
<p>${isSuccess ? 'The enhancement has been successfully deployed to production.' : 'The deployment failed. Please review the error and take appropriate action.'}</p>
<hr>
<p style="color: #666; font-size: 12px;">This is an automated message from the Monitor Agent.</p>
`.trim();

  // Send to requestor if available
  if (requestorName && requestorName.includes('@')) {
    await sendEmail(requestorName, subject, body, html);
  }

  // Send Slack notification if configured
  if (config.slack.webhookUrl) {
    const slackMessage = isSuccess
      ? `:${statusEmoji}: Enhancement #${enhancementId} deployed successfully`
      : `:${statusEmoji}: Enhancement #${enhancementId} deployment failed`;

    await sendSlack(config.slack.webhookUrl, slackMessage, [
      {
        color: statusColor,
        title: `Enhancement #${enhancementId} - ${statusText}`,
        text: description,
        fields: [
          { title: 'Status', value: statusText, short: true },
          { title: 'Requestor', value: requestorName || 'Unknown', short: true },
          ...(prNumber ? [{ title: 'PR', value: `#${prNumber}`, short: true }] : []),
          ...(error ? [{ title: 'Error', value: error, short: false }] : []),
        ],
      },
    ]);
  }

  console.log(`Deployment notification sent for enhancement #${enhancementId}: ${statusText}`);
}

export default {
  sendEmail,
  sendSlack,
  notifyEnhancementStarted,
  notifyPRCreated,
  notifyEnhancementCompleted,
  notifyEnhancementFailed,
  notify,
  sendDeploymentNotification,
};
