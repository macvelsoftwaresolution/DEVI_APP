// Emergency evidence (video/audio) is stored PRIVATE on Cloudinary and only served through
// GET /api/sos/evidence/:alertId?k=<view key>, so clients never see the Cloudinary cloud name
// and nobody can open a video without the alert's view key or an admin login.
//
// What is stored in sos_history.evidence_url:
//   new uploads:  "cld:<type>/<resource_type>/<public_id>.<format>"   e.g. cld:authenticated/video/devi_emergency_evidence/devi_sos_12_1730.mp4
//   older rows:   a full https://res.cloudinary.com/... URL (public); still served through the proxy
import { signSosViewToken } from '../middlewares/auth.middleware.js';

const REF_PREFIX = 'cld:';

export const apiBaseUrl = () =>
  (process.env.API_BASE_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'https://devi-api.macvelsoftware.com'
      : `http://localhost:${process.env.PORT || 5005}`)).replace(/\/+$/, '');

// Builds the stored reference from a Cloudinary upload result
export const toEvidenceRef = (upload) => {
  const format = upload.format ? `.${upload.format}` : '';
  return `${REF_PREFIX}${upload.type}/${upload.resource_type}/${upload.public_id}${format}`;
};

// Returns { type, resourceType, publicId, format } or null when the value is not a Cloudinary asset
export const parseEvidenceRef = (stored) => {
  if (!stored || typeof stored !== 'string') return null;

  const split = (path) => {
    const m = path.match(/^(.*?)(?:\.([a-z0-9]+))?$/i);
    return { publicId: m[1], format: m[2] || null };
  };

  if (stored.startsWith(REF_PREFIX)) {
    const [type, resourceType, ...rest] = stored.slice(REF_PREFIX.length).split('/');
    if (!type || !resourceType || rest.length === 0) return null;
    return { type, resourceType, ...split(rest.join('/')) };
  }

  // Legacy public URL: https://res.cloudinary.com/<cloud>/<resource_type>/<type>/[transformations/][v123/]<public_id>.<ext>
  const legacy = stored.match(/^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/(upload|authenticated|private)\/(?:v\d+\/)?(.+)$/);
  if (legacy) {
    return { type: legacy[2], resourceType: legacy[1], ...split(legacy[3]) };
  }
  return null;
};

// Public link handed to guardians, the dashboard and the app (null when there is no evidence)
export const evidenceLink = (alertId, stored) => {
  if (!alertId || !stored) return null;
  return `${apiBaseUrl()}/api/sos/evidence/${encodeURIComponent(alertId)}?k=${signSosViewToken(alertId)}`;
};

// Replaces the stored reference in an outgoing object with the protected link
export const withEvidenceLink = (obj, alertId = obj?.id) => {
  if (!obj || !('evidenceUrl' in obj)) return obj;
  return { ...obj, evidenceUrl: evidenceLink(alertId, obj.evidenceUrl) };
};
