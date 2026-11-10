import { ivrService } from './ivr.service.js';
import { WhatsAppService } from './whatsapp.service.js';
import { SosService } from './sos.service.js';
import { maskPhone } from '../utils/logMask.js';

/**
 * Pages the on-call person (ONCALL_PHONE) when the system gives up or cannot send at all, so no
 * failure ends in a log file nobody reads (L5, L7, L11, REL2).
 *
 * A page is a voice call with a fixed message and a WhatsApp. They go out together because a page
 * is often about one of them being down (an expired WhatsApp token, an empty call balance).
 * An alert page forwards the SOS itself on WhatsApp: the person's name and the map link, so the
 * on-call person can act at once. A system page (no alert) names the problem.
 *
 * The same key is paged at most once per PAGE_REPEAT_MS. An alert page is skipped when the alert
 * is resolved or any guardian pressed 1, because a person already has it.
 * A page never throws: its failure is logged and the caller carries on.
 *
 * The WhatsApp uses the SOS template (devi_safety), the only one approved today, so a system page
 * reads "DEVI system: <problem> has triggered an emergency alert". An ops template is a later step.
 */

export const PAGE_REPEAT_MS = 15 * 60 * 1000;
const MAX_KEYS = 1000;

const defaults = {
  call: (phone) => ivrService.triggerPageCall({ phone }),
  whatsapp: (phone, name, location) => WhatsAppService.sendEmergencyAlert(phone, name, location),
  getAlertStatus: (alertId) => SosService.getSavedAlertStatus(alertId),
  anyAck: (alertId) => SosService.hasAnyGuardianAck(alertId),
  oncallPhone: () => process.env.ONCALL_PHONE || '',
};

export const createPager = (deps = {}) => {
  const { call, whatsapp, getAlertStatus, anyAck, oncallPhone, now = Date.now } = { ...defaults, ...deps };
  const lastPaged = new Map(); // key -> time of its last page
  let notConfiguredLogged = false;

  const recentlyPaged = (key) => {
    const at = lastPaged.get(key);
    return at != null && now() - at < PAGE_REPEAT_MS;
  };

  const remember = (key) => {
    lastPaged.delete(key);
    lastPaged.set(key, now());
    for (const old of lastPaged.keys()) {
      if (lastPaged.size <= MAX_KEYS) break;
      lastPaged.delete(old);
    }
  };

  return {
    /**
     * key: what is wrong, for repeats (e.g. 'alert:<id>', 'whatsapp:TOKEN_EXPIRED')
     * reason: short text for the WhatsApp and the log
     * alert: { alertId, victimName, location } for an alert page
     * Returns 'paged' | 'repeat' | 'handled' | 'not-configured' | 'failed'
     */
    async page({ key, reason, alert = null }) {
      try {
        if (recentlyPaged(key)) return 'repeat';

        const phone = oncallPhone().trim();
        if (!phone) {
          if (!notConfiguredLogged) console.error(`🚨 [PAGE NOT SENT] ONCALL_PHONE is not set, so nobody is told: ${reason}`);
          notConfiguredLogged = true;
          return 'not-configured';
        }

        if (alert?.alertId) {
          if ((await getAlertStatus(alert.alertId)) === 'RESOLVED') return 'handled';
          if (await anyAck(alert.alertId)) return 'handled';
        }
        // Before the sends, so a second failure arriving meanwhile does not page twice
        remember(key);

        const name = alert ? `${alert.victimName || 'A DEVI user'} (DEVI page: ${reason})` : `DEVI system: ${reason}`;
        const [called, messaged] = await Promise.all([
          call(phone).catch((e) => ({ success: false, error: e.message })),
          whatsapp(phone, name, alert?.location || {}).catch((e) => ({ success: false, reason: e.message })),
        ]);

        if (!called?.success && !messaged?.success) {
          // Neither reached the on-call person: try again on the next failure, not 15 minutes later
          lastPaged.delete(key);
          console.error(`🚨 [PAGE FAILED] ${key} to ${maskPhone(phone)}: call (${called?.error}) and WhatsApp (${messaged?.reason}) both failed. ${reason}`);
          return 'failed';
        }
        console.warn(`📟 [PAGED] ${key} to ${maskPhone(phone)} (call ${called?.success ? 'placed' : 'failed'}, WhatsApp ${messaged?.success ? 'sent' : 'failed'}): ${reason}`);
        return 'paged';
      } catch (e) {
        console.error(`🚨 [PAGE FAILED] ${key}:`, e);
        return 'failed';
      }
    },
  };
};

export const pager = createPager();
export default pager;
