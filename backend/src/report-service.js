import { validateReportFields } from './report-validation.js';

function fail(status, code, extra = {}) {
  throw Object.assign(new Error(code), { status, code, extra });
}

export async function createReport({
  client, userId, jobId, body, ownedJob, one, query, checkVersion, touchJob, jobJson, now,
}) {
  const row = await ownedJob(jobId, userId, client, true);
  const report = validateReportFields(body);
  if (row.status !== 'in_progress') fail(409, 'job_not_in_progress');
  if (await one('SELECT 1 FROM reports WHERE job_id=$1', [row.id], client)) {
    fail(409, 'report_already_exists');
  }
  for (const id of report.photoIds) {
    if (!await one('SELECT 1 FROM photos WHERE id=$1 AND job_id=$2', [id, row.id], client)) {
      fail(422, 'unknown_photo', { photoId: id });
    }
  }
  await checkVersion(row, body, client);

  const completedAt = now();
  await query(`INSERT INTO reports(job_id,note,recipient_full_name,lat,lng,location_accuracy,device_code,signature_svg,photo_ids,created_at,completed_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$10)`,
  [row.id,report.note,report.recipientFullName,report.lat,report.lng,report.locationAccuracy,
    report.deviceCode,report.signatureSvg,JSON.stringify(report.photoIds),completedAt], client);
  const updatedJob = await touchJob(row.id, client, 'done');
  return { status: 201, body: { job: await jobJson(updatedJob, client) } };
}
