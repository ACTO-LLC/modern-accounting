import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY;

// Validate encryption key on module load
function validateEncryptionKey() {
    if (!ENCRYPTION_KEY) {
        throw new Error('EMAIL_ENCRYPTION_KEY environment variable not set');
    }
    
    // Check minimum key length (32 characters recommended for AES)
    if (ENCRYPTION_KEY.length < 32) {
        console.warn('WARNING: EMAIL_ENCRYPTION_KEY is shorter than recommended (32+ characters). This may compromise encryption security.');
    }
    
    // Warn about common weak keys
    const weakKeys = [
        'your-32-character-secret-key-here',
        'change-me',
        'password',
        'secret',
        '12345678901234567890123456789012'
    ];
    
    if (weakKeys.some(weak => ENCRYPTION_KEY.toLowerCase().includes(weak.toLowerCase()))) {
        console.warn('WARNING: EMAIL_ENCRYPTION_KEY appears to be a default or weak value. Please use a strong, random key in production.');
    }
}

// Validate on module load
validateEncryptionKey();

export function encrypt(text) {
    if (!text) {
        return '';
    }
    return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

export function decrypt(ciphertext) {
    if (!ciphertext) {
        return '';
    }
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
        
        // If decryption fails, CryptoJS returns an empty string
        if (!decrypted && ciphertext) {
            throw new Error('Decryption failed - invalid ciphertext or encryption key');
        }
        
        return decrypted;
    } catch (error) {
        throw new Error(`Decryption error: ${error.message}`);
    }
}
