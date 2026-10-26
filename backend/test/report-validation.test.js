import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodePhotoUpload, MAX_PHOTO_BYTES, MAX_PHOTOS_PER_JOB, validateReportFields,
} from '../src/report-validation.js';

const signatureSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180" viewBox="0 0 600 180"><path d="M1.0 2.0L3.0 4.0" stroke="#000" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const validReport = {
  note: 'Wymieniono filtr',
  recipientFullName: 'Demo Recipient',
  signatureSvg,
};

test('requires work description, recipient full name, and a drawn signature', () => {
  assert.throws(() => validateReportFields({ ...validReport, note: '   ' }), { code: 'invalid_note' });
  assert.throws(() => validateReportFields({ ...validReport, recipientFullName: 'Recipient' }), { code: 'invalid_recipientFullName' });
  assert.throws(() => validateReportFields({ ...validReport, signatureSvg: '' }), { code: 'invalid_signature' });
  assert.throws(() => validateReportFields({
    ...validReport,
    signatureSvg: signatureSvg.replace('M1.0 2.0L3.0 4.0', 'M1.0 2.0'),
  }), { code: 'invalid_signature' });
  assert.throws(() => validateReportFields({ ...validReport, signatureSvg: '<svg><script/></svg>' }), { code: 'invalid_signature' });
});

test('accepts optional location but requires valid coordinate pairs', () => {
  assert.deepEqual(validateReportFields(validReport).lat, null);
  assert.throws(() => validateReportFields({ ...validReport, lat: 50 }), { code: 'invalid_location' });
  assert.throws(() => validateReportFields({ ...validReport, lat: 91, lng: 20 }), { code: 'invalid_lat' });
  assert.throws(() => validateReportFields({ ...validReport, locationAccuracy: 4 }), { code: 'invalid_location' });
  assert.equal(validateReportFields({ ...validReport, lat: 50, lng: 20, locationAccuracy: 4 }).locationAccuracy, 4);
});

test('limits photo references to unique IDs within the configured count', () => {
  assert.throws(() => validateReportFields({ ...validReport, photoIds: ['photo-id-01', 'photo-id-01'] }), { code: 'invalid_photoIds' });
  assert.throws(() => validateReportFields({
    ...validReport,
    photoIds: Array.from({ length: MAX_PHOTOS_PER_JOB + 1 }, (_, i) => `photo-id-${String(i).padStart(2, '0')}`),
  }), { code: 'invalid_photoIds' });
});

test('checks photo bytes against the declared image type and per-file limit', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  assert.equal(decodePhotoUpload({ id: 'photo-id-01', mime: 'image/png', dataBase64: png }).mime, 'image/png');
  assert.throws(() => decodePhotoUpload({ id: 'photo-id-02', mime: 'image/jpeg', dataBase64: png }), { code: 'invalid_file_type' });
  assert.throws(() => decodePhotoUpload({
    id: 'photo-id-03',
    mime: 'image/png',
    dataBase64: Buffer.alloc(MAX_PHOTO_BYTES + 1).toString('base64'),
  }), { code: 'payload_too_large', status: 413 });
});
