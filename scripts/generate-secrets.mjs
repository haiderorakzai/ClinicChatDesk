import { randomBytes } from 'node:crypto';
console.log('SESSION_SECRET=' + randomBytes(48).toString('base64url'));
console.log('APP_ENCRYPTION_KEY=' + randomBytes(32).toString('base64url'));
console.log('WHATSAPP_VERIFY_TOKEN=' + randomBytes(24).toString('base64url'));
