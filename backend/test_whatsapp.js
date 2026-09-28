import dotenv from 'dotenv';
dotenv.config();

import { WhatsAppService } from './src/services/whatsapp.service.js';

const testRecipient = process.argv[2] || '916381592501';

console.log('--- DEVI WhatsApp Cloud API Quick Test ---');
console.log(`Phone Number ID : ${process.env.WHATSAPP_PHONE_NUMBER_ID ? 'Configured ✅' : 'NOT SET ❌'}`);
console.log(`Access Token    : ${process.env.WHATSAPP_ACCESS_TOKEN ? 'Configured ✅' : 'NOT SET ❌'}`);
console.log(`Target Recipient: ${testRecipient}`);

if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
  console.log('\n⚠️ Please set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in backend/.env');
  process.exit(1);
}

const fakeTrackingUrl = 'https://devi-safety.org/track/test-alert-123';

console.log('\nSending test emergency alert message...');
WhatsAppService.sendEmergencyAlert(testRecipient, fakeTrackingUrl, 'Test User (DEVI)')
  .then(res => {
    console.log('\nResult:', JSON.stringify(res, null, 2));
    if (res.success) {
      console.log('\n🎉 SUCCESS! WhatsApp message sent successfully. Check your WhatsApp!');
    } else {
      console.log('\n⚠️ Message delivery failed. See error details above.');
    }
  })
  .catch(err => {
    console.error('Fatal error:', err);
  });
