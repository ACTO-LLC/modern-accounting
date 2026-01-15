import nodemailer from 'nodemailer';

export async function testConnection(config) {
    try {
        const transportConfig = {
            host: config.host,
            port: config.port,
            secure: config.secure, // true for 465, false for other ports
            auth: config.auth
        };

        // For port 587, use STARTTLS (secure=false but require TLS upgrade)
        if (!config.secure && config.port === 587) {
            transportConfig.requireTLS = true;
        }

        const transporter = nodemailer.createTransport(transportConfig);

        await transporter.verify();
        return { success: true, message: 'Connection verified successfully' };
    } catch (error) {
        console.error('SMTP connection test failed:', error);
        return { success: false, error: error.message };
    }
}

export async function sendEmail(options) {
    const transportConfig = {
        host: options.host,
        port: options.port,
        secure: options.secure,
        auth: options.auth
    };

    // For port 587, use STARTTLS (secure=false but require TLS upgrade)
    if (!options.secure && options.port === 587) {
        transportConfig.requireTLS = true;
    }

    const transporter = nodemailer.createTransport(transportConfig);

    const mailOptions = {
        from: `"${options.from.name}" <${options.from.email}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        attachments: options.attachments || []
    };

    if (options.replyTo) {
        mailOptions.replyTo = options.replyTo;
    }

    const result = await transporter.sendMail(mailOptions);
    return result;
}
