import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY;

export function encrypt(text) {
    if (!ENCRYPTION_KEY) {
        throw new Error('EMAIL_ENCRYPTION_KEY environment variable not set');
    }
    if (!text) {
        return '';
    }
    return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

export function decrypt(ciphertext) {
    if (!ENCRYPTION_KEY) {
        throw new Error('EMAIL_ENCRYPTION_KEY environment variable not set');
    }
    if (!ciphertext) {
        return '';
    }
    const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
}
