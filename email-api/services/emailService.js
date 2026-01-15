import nodemailer from 'nodemailer';

export async function testConnection(config) {
    try {
        const transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: config.auth
        });

        await transporter.verify();
        return { success: true, message: 'Connection verified successfully' };
    } catch (error) {
        console.error('SMTP connection test failed:', error);
        return { success: false, error: error.message };
    }
}

export async function sendEmail(options) {
    const transporter = nodemailer.createTransport({
        host: options.host,
        port: options.port,
        secure: options.secure,
        auth: options.auth
    });

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
