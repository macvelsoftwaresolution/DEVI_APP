// Loaded before every test file (npm test: node --import ./test/setup.js --test).
//
// Tests must never reach a real database, a real WhatsApp number or a real phone, whatever the
// local .env points to. These are set before src/config/env.js runs, and dotenv never overrides
// a variable that is already set, so the .env values for them are ignored in tests.
// Each test that needs a database or a provider gives its own fake.

const NO_REAL_SERVICES = {
  // Nothing listens here: a query that slips past a fake fails at once instead of reaching Supabase
  SUPABASE_URL: 'http://127.0.0.1:9',
  SUPABASE_KEY: 'test-only-not-a-supabase-key',
  WHATSAPP_PHONE_NUMBER_ID: '',
  WHATSAPP_ACCESS_TOKEN: '',
  PLIVO_AUTH_ID: '',
  PLIVO_AUTH_TOKEN: '',
  TWILIO_ACCOUNT_SID: '',
  TWILIO_AUTH_TOKEN: '',
  ONCALL_PHONE: '',
  ADMIN_WHATSAPP: '',
  GOOGLE_MAPS_API_KEY: '',
  CLOUDINARY_CLOUD_NAME: '',
  CLOUDINARY_API_KEY: '',
  CLOUDINARY_API_SECRET: '',
};

for (const [key, value] of Object.entries(NO_REAL_SERVICES)) process.env[key] = value;
