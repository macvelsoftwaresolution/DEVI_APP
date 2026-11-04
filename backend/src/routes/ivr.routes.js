import { Router } from 'express';
import { maskPhone } from '../utils/logMask.js';
import { publicBaseUrl } from '../services/ivr.service.js';

const router = Router();

// Name and address go inside the XML we return: a "&" or "<" in them would break the call
const escapeXml = (value) =>
  String(value ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

/**
 * Plivo Answer Webhook
 * Called by Plivo when the recipient answers the phone call.
 * Responds with PlivoXML instructions:
 * 1. Speaks the emergency message clearly
 * 2. Asks the guardian to press '1' to acknowledge
 */
router.all('/plivo/answer', (req, res) => {
  const victimName = escapeXml(req.query.victim || 'a user');
  const locationText = req.query.loc ? `near ${escapeXml(req.query.loc)}` : '';
  const sosId = req.query.sosId || '';

  const gatherAction = escapeXml(`${publicBaseUrl()}/api/ivr/plivo/gather?sosId=${encodeURIComponent(sosId)}`);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Speak voice="WOMAN" language="en-IN">Emergency SOS alert! ${victimName} has triggered an emergency alert in DEVI Safety ${locationText}. Please check your WhatsApp and help immediately.</Speak>
    <GetDigits action="${gatherAction}" method="POST" numDigits="1" timeout="10" retries="1">
        <Speak voice="WOMAN" language="en-IN">Press 1 on your dial pad to acknowledge and confirm you received this alert.</Speak>
    </GetDigits>
    <Speak voice="WOMAN" language="en-IN">No response received. Alert remains active. Thank you.</Speak>
</Response>`;

  res.set('Content-Type', 'text/xml');
  res.send(xml);
});

/**
 * Plivo Gather Webhook
 * Called when the guardian presses a key on their phone keypad (DTMF).
 */
router.all('/plivo/gather', (req, res) => {
  const digits = req.body?.Digits || req.query?.Digits;
  const sosId = req.query.sosId || req.body?.sosId || '';
  const fromNumber = req.body?.From || req.query?.From || '';

  console.log(`📞 [Plivo IVR] DTMF key received: "${digits}" for SOS: ${sosId} from: ${maskPhone(fromNumber)}`);

  let responseXml = '';
  if (digits === '1') {
    console.log(`✅ [Plivo IVR] SOS ${sosId} acknowledged by guardian (${maskPhone(fromNumber)})`);
    responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Speak voice="WOMAN" language="en-IN">Thank you! Your acknowledgement has been recorded in the DEVI emergency safety system. Connecting assistance now.</Speak>
</Response>`;
  } else {
    responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Speak voice="WOMAN" language="en-IN">Input received. Thank you. Stay safe.</Speak>
</Response>`;
  }

  res.set('Content-Type', 'text/xml');
  res.send(responseXml);
});

/**
 * Plivo Call Status Webhook (Hangup / Completed / Failed)
 */
router.all('/plivo/status', (req, res) => {
  const callStatus = req.body?.CallStatus || req.query?.CallStatus;
  const callDuration = req.body?.CallDuration || req.query?.CallDuration || '0';
  const to = req.body?.To || req.query?.To;

  console.log(`📋 [Plivo IVR Status] Call to ${maskPhone(to)} ended. Status: ${callStatus}, Duration: ${callDuration}s`);
  res.status(200).send('OK');
});

/**
 * Twilio Answer Webhook
 */
router.all('/twilio/answer', (req, res) => {
  const victimName = escapeXml(req.query.victim || 'A user');
  const locationText = req.query.loc ? ` near ${escapeXml(req.query.loc)}` : '';
  const sosId = req.query.sosId || '';
  const gatherAction = escapeXml(`${publicBaseUrl()}/api/ivr/twilio/gather?sosId=${encodeURIComponent(sosId)}`);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Aditi" language="en-IN">Emergency SOS alert! ${victimName} has triggered an emergency alert in DEVI Safety${locationText}. Please check your WhatsApp and help immediately.</Say>
    <Gather numDigits="1" timeout="10" action="${gatherAction}" method="POST">
        <Say voice="Polly.Aditi" language="en-IN">Press 1 on your phone dial pad to confirm you received this alert.</Say>
    </Gather>
    <Say voice="Polly.Aditi" language="en-IN">No input received. Stay safe.</Say>
</Response>`;

  res.set('Content-Type', 'text/xml');
  res.send(xml);
});

/**
 * Twilio Gather Webhook (DTMF Press 1)
 */
router.all('/twilio/gather', (req, res) => {
  const digits = req.body?.Digits || req.query?.Digits;
  const sosId = req.query?.sosId || req.body?.sosId || '';
  console.log(`📞 [Twilio IVR] Guardian pressed digit: "${digits}" for SOS: ${sosId}`);

  let xml = '';
  if (digits === '1') {
    xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Aditi" language="en-IN">Thank you! Your acknowledgement has been recorded in the DEVI emergency safety system.</Say>
</Response>`;
  } else {
    xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Aditi" language="en-IN">Input recorded. Stay safe.</Say>
</Response>`;
  }

  res.set('Content-Type', 'text/xml');
  res.send(xml);
});

export default router;
