import { Router } from 'express';
import { maskPhone } from '../utils/logMask.js';
import { publicBaseUrl, readAckToken } from '../services/ivr.service.js';
import { SosService } from '../services/sos.service.js';
import { sosNotify } from '../services/sosNotify.service.js';

const router = Router();

const ACK_SAVED = 'Thank you. Your acknowledgement has been recorded. Please check your WhatsApp and help immediately.';
const ACK_NOT_SAVED = 'Thank you. Please check your WhatsApp and help immediately.';
const NO_RESPONSE = 'No response received. Alert remains active. Please check your WhatsApp.';

// Name and address go inside the XML we return: a "&" or "<" in them would break the call
const escapeXml = (value) =>
  String(value ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

const gatherUrl = (provider, req) =>
  escapeXml(`${publicBaseUrl()}/api/ivr/${provider}/gather?sosId=${encodeURIComponent(req.query.sosId || '')}&ack=${encodeURIComponent(req.query.ack || '')}`);

// Saved only with the call's ack token (ivr.service.js). False means nothing was saved,
// so the call must not say "recorded".
const saveAck = async (req, provider) => {
  const sosId = req.query.sosId;
  const phone = readAckToken(req.query.ack, sosId);
  if (!phone) {
    console.warn(`⚠️ [IVR ${provider}] Press 1 for SOS ${sosId} ignored: invalid ack token`);
    return false;
  }
  const saved = await SosService.recordGuardianAck({ alertId: sosId, phone, provider });
  if (saved) console.log(`✅ [IVR ${provider}] SOS ${sosId} acknowledged by guardian (${maskPhone(phone)})`);
  return saved;
};

// Page call to the on-call person (pager.service.js). Fixed text with no alert details, so this
// public route gives nothing away. The details are in the WhatsApp page and the server logs.
const PAGE_MESSAGE = 'DEVI system alert. An SOS could not reach anyone, or a message or call service has failed. Open the DEVI dashboard and the server logs now.';

router.all('/plivo/page', (req, res) => {
  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Speak voice="WOMAN" language="en-IN" loop="2">${PAGE_MESSAGE}</Speak>
</Response>`);
});

router.all('/twilio/page', (req, res) => {
  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Aditi" language="en-IN" loop="2">${PAGE_MESSAGE}</Say>
</Response>`);
});

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
  const gatherAction = gatherUrl('plivo', req);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Speak voice="WOMAN" language="en-IN">Emergency SOS alert! ${victimName} has triggered an emergency alert in DEVI Safety ${locationText}. Please check your WhatsApp and help immediately.</Speak>
    <GetDigits action="${gatherAction}" method="POST" numDigits="1" timeout="10" retries="1">
        <Speak voice="WOMAN" language="en-IN">Press 1 on your dial pad to acknowledge and confirm you received this alert.</Speak>
    </GetDigits>
    <Speak voice="WOMAN" language="en-IN">${NO_RESPONSE}</Speak>
</Response>`;

  res.set('Content-Type', 'text/xml');
  res.send(xml);
});

/**
 * Plivo Gather Webhook
 * Called when the guardian presses a key on their phone keypad (DTMF).
 */
router.all('/plivo/gather', async (req, res) => {
  const digits = req.body?.Digits || req.query?.Digits;
  const sosId = req.query.sosId || '';

  console.log(`📞 [Plivo IVR] DTMF key received: "${digits}" for SOS: ${sosId}`);

  let responseXml = '';
  if (digits === '1') {
    const saved = await saveAck(req, 'plivo');
    responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Speak voice="WOMAN" language="en-IN">${saved ? ACK_SAVED : ACK_NOT_SAVED}</Speak>
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

// Answered once it counts any talk time or has an answer time, whatever the final status says
export const callEndFromPlivo = (p = {}) => ({
  callId: p.CallUUID || p.RequestUUID,
  status: String(p.CallStatus || '').toLowerCase(),
  answered: !!p.AnswerTime || Number(p.Duration) > 0,
  to: p.To,
  duration: p.Duration || '0',
  cause: p.HangupCauseName || p.HangupCause || '',
});

export const callEndFromTwilio = (p = {}) => ({
  callId: p.CallSid,
  status: String(p.CallStatus || '').toLowerCase(),
  answered: String(p.CallStatus || '').toLowerCase() === 'completed',
  to: p.To,
  duration: p.CallDuration || '0',
  cause: p.ErrorCode || '',
});

const handleCallEnd = async (end, provider, res) => {
  // The provider only needs an answer; a failure here must not make it resend the event
  res.status(200).send('OK');
  console.log(`📋 [${provider} IVR Status] Call to ${maskPhone(end.to)} ended. Status: ${end.status}, Duration: ${end.duration}s${end.cause ? `, Cause: ${end.cause}` : ''}`);
  try {
    await sosNotify.callEnded(end);
  } catch (e) {
    console.error(`🚨 [${provider} IVR Status] Could not act on the end of call ${end.callId}:`, e);
  }
};

/**
 * Plivo Call Status Webhook (Hangup / Completed / Failed)
 */
router.all('/plivo/status', (req, res) =>
  handleCallEnd(callEndFromPlivo({ ...req.query, ...req.body }), 'Plivo', res));

/**
 * Twilio Call Status Webhook
 */
router.all('/twilio/status', (req, res) =>
  handleCallEnd(callEndFromTwilio({ ...req.query, ...req.body }), 'Twilio', res));

/**
 * Twilio Answer Webhook
 */
router.all('/twilio/answer', (req, res) => {
  const victimName = escapeXml(req.query.victim || 'A user');
  const locationText = req.query.loc ? ` near ${escapeXml(req.query.loc)}` : '';
  const gatherAction = gatherUrl('twilio', req);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Aditi" language="en-IN">Emergency SOS alert! ${victimName} has triggered an emergency alert in DEVI Safety${locationText}. Please check your WhatsApp and help immediately.</Say>
    <Gather numDigits="1" timeout="10" action="${gatherAction}" method="POST">
        <Say voice="Polly.Aditi" language="en-IN">Press 1 on your phone dial pad to confirm you received this alert.</Say>
    </Gather>
    <Say voice="Polly.Aditi" language="en-IN">${NO_RESPONSE}</Say>
</Response>`;

  res.set('Content-Type', 'text/xml');
  res.send(xml);
});

/**
 * Twilio Gather Webhook (DTMF Press 1)
 */
router.all('/twilio/gather', async (req, res) => {
  const digits = req.body?.Digits || req.query?.Digits;
  const sosId = req.query?.sosId || '';
  console.log(`📞 [Twilio IVR] Guardian pressed digit: "${digits}" for SOS: ${sosId}`);

  let xml = '';
  if (digits === '1') {
    const saved = await saveAck(req, 'twilio');
    xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Aditi" language="en-IN">${saved ? ACK_SAVED : ACK_NOT_SAVED}</Say>
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
