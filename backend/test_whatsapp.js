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

const fakeTrackingUrl = 'https://school.macvelsoftware.com/track/test-alert-123';
const testCoords = { latitude: 13.0827, longitude: 80.2707, location: 'Chennai Central, Tamil Nadu' };

console.log('\nSending test emergency alert message with Google Maps Hyperlink...');
WhatsAppService.sendEmergencyAlert(testRecipient, fakeTrackingUrl, 'Harsha (DEVI User)', testCoords)
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
