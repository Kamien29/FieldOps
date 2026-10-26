// Each photo is uploaded as Base64 JSON. Vercel Functions cap request bodies at 4.5 MB;
// 2.5 MiB binary becomes ~3.34 MiB in Base64, leaving safe request overhead.
export const MAX_PHOTO_BYTES = Math.floor(2.5 * 1024 * 1024);
export const MAX_PHOTOS_PER_JOB = 10;
export const MAX_PHOTO_BYTES_PER_JOB = 40 * 1024 * 1024;

const PHOTO_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SIGNATURE_SVG_RE = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d{1,5}" height="\d{1,5}" viewBox="0 0 \d{1,5} \d{1,5}"><path d="(?:(?:M|L|l)-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?)+(?:(?:M|L|l)-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?)*" stroke="#000" stroke-width="2\.5" fill="none" stroke-linecap="round" stroke-linejoin="round"\/><\/svg>$/;

function reject(code, status = 400) {
  throw Object.assign(new Error(code), { status, code });
}

function requiredText(value, maxLength, code) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) reject(code);
  return value.trim();
}

function optionalNumber(value, min, max, code) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) reject(code);
  return value;
}

export function validateReportFields(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject('invalid_report');
  const note = requiredText(body.note, 10000, 'invalid_note');
  const recipientFullName = requiredText(body.recipientFullName, 200, 'invalid_recipientFullName');
  if (recipientFullName.split(/\s+/).length < 2) reject('invalid_recipientFullName');
  const signaturePath = typeof body.signatureSvg === 'string' &&
    body.signatureSvg.match(/<path d="([^"]+)"/)?.[1];
  if (typeof body.signatureSvg !== 'string' || body.signatureSvg.length > 200000 ||
      !SIGNATURE_SVG_RE.test(body.signatureSvg) || (signaturePath.match(/[MLl]/g) ?? []).length < 2) {
    reject('invalid_signature');
  }

  const lat = optionalNumber(body.lat, -90, 90, 'invalid_lat');
  const lng = optionalNumber(body.lng, -180, 180, 'invalid_lng');
  const locationAccuracy = optionalNumber(body.locationAccuracy, 0, 100000, 'invalid_locationAccuracy');
  if ((lat === null) !== (lng === null) || (lat === null && locationAccuracy !== null)) {
    reject('invalid_location');
  }

  const deviceCode = body.deviceCode === null || body.deviceCode === undefined
    ? null
    : requiredText(body.deviceCode, 200, 'invalid_deviceCode');
  const photoIds = body.photoIds ?? [];
  if (!Array.isArray(photoIds) || photoIds.length > MAX_PHOTOS_PER_JOB ||
      photoIds.some((id) => typeof id !== 'string') || new Set(photoIds).size !== photoIds.length) {
    reject('invalid_photoIds');
  }
  return { note, recipientFullName, signatureSvg: body.signatureSvg, lat, lng, locationAccuracy, deviceCode, photoIds };
}

function photoTypeMatches(data, mime) {
  if (mime === 'image/jpeg') return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mime === 'image/png') {
    return data.length >= 8 &&
      data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return mime === 'image/webp' && data.length >= 12 &&
    data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
}

export function decodePhotoUpload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject('invalid_data');
  if (typeof body.id !== 'string' || !PHOTO_ID_RE.test(body.id)) reject('invalid_photo_id');
  if (typeof body.mime !== 'string' || !ALLOWED_MIMES.has(body.mime)) reject('invalid_mime');
  if (typeof body.dataBase64 !== 'string' || !body.dataBase64 || body.dataBase64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(body.dataBase64)) {
    reject('invalid_data');
  }
  const padding = body.dataBase64.endsWith('==') ? 2 : body.dataBase64.endsWith('=') ? 1 : 0;
  const contentLength = body.dataBase64.length - padding;
  if (body.dataBase64.slice(0, contentLength).includes('=') ||
      (padding && contentLength % 4 !== 4 - padding)) reject('invalid_data');
  if (body.dataBase64.length / 4 * 3 - padding > MAX_PHOTO_BYTES) reject('payload_too_large', 413);
  const data = Buffer.from(body.dataBase64, 'base64');
  if (!data.length) reject('invalid_data');
  if (data.length > MAX_PHOTO_BYTES) reject('payload_too_large', 413);
  if (!photoTypeMatches(data, body.mime)) reject('invalid_file_type');
  return { id: body.id, mime: body.mime, data };
}
