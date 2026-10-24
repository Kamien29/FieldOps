import test from 'node:test';
import assert from 'node:assert/strict';
import { createReport } from '../src/report-service.js';

const signatureSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180" viewBox="0 0 600 180"><path d="M1.0 2.0L3.0 4.0" stroke="#000" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const body = {
  note: 'Wymieniono filtr',
  recipientFullName: 'Demo Recipient',
  signatureSvg,
  photoIds: [],
  baseVersion: 4,
};

function createHarness({ status = 'in_progress', existingReport = false, failOnTouch = false } = {}) {
  const state = {
    job: { id: 'J-test', assigned_to: 'user-1', status, version: 4 },
    report: existingReport ? { job_id: 'J-test' } : null,
  };
  const transaction = async (operation) => {
    const snapshot = structuredClone(state);
    try {
      return await operation({ state });
    } catch (error) {
      Object.assign(state, snapshot);
      throw error;
    }
  };
  const ownedJob = async (jobId, userId, client) => {
    const job = client.state.job;
    if (job.id !== jobId || job.assigned_to !== userId) {
      throw Object.assign(new Error('job_not_found'), { status: 404, code: 'job_not_found' });
    }
    return job;
  };
  const one = async (sql, params, client) => {
    if (sql.includes('FROM reports WHERE job_id')) return client.state.report;
    if (sql.includes('FROM photos WHERE id')) return null;
    throw new Error(`Unexpected query: ${sql}`);
  };
  const query = async (sql, params, client) => {
    if (sql.startsWith('INSERT INTO reports')) {
      client.state.report = {
        job_id: params[0],
        note: params[1],
        recipient_full_name: params[2],
        completed_at: params[9],
      };
      return;
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  const checkVersion = async (job, input) => {
    if (input.baseVersion !== job.version) {
      throw Object.assign(new Error('conflict'), { status: 409, code: 'conflict' });
    }
  };
  const touchJob = async (jobId, client, nextStatus) => {
    if (failOnTouch) throw new Error('simulated status update failure');
    client.state.job.status = nextStatus;
    client.state.job.version += 1;
    return client.state.job;
  };
  const jobJson = async (job) => ({
    id: job.id,
    status: job.status,
    version: job.version,
    report: state.report,
  });
  const submit = (input = body, userId = 'user-1') => transaction((client) => createReport({
    client, userId, jobId: 'J-test', body: input, ownedJob, one, query, checkVersion,
    touchJob, jobJson, now: () => '2026-10-22T12:00:00.000Z',
  }));
  return { state, submit };
}

test('stores one report and completes the in-progress job', async () => {
  const { state, submit } = createHarness();
  const response = await submit();

  assert.equal(response.status, 201);
  assert.equal(state.report.note, body.note);
  assert.equal(state.report.recipient_full_name, body.recipientFullName);
  assert.equal(state.job.status, 'done');
  assert.equal(state.job.version, 5);
  assert.equal(response.body.job.status, 'done');
});

test('rejects missing descriptions, foreign jobs, and duplicate reports', async () => {
  const missingDescription = createHarness();
  await assert.rejects(missingDescription.submit({ ...body, note: '' }), { code: 'invalid_note' });
  assert.equal(missingDescription.state.job.status, 'in_progress');

  const foreign = createHarness();
  await assert.rejects(foreign.submit(body, 'user-2'), { status: 404, code: 'job_not_found' });
  assert.equal(foreign.state.report, null);

  const duplicate = createHarness({ existingReport: true });
  await assert.rejects(duplicate.submit(), { status: 409, code: 'report_already_exists' });
});

test('does not save a report or complete the job when completion fails', async () => {
  const { state, submit } = createHarness({ failOnTouch: true });
  await assert.rejects(submit(), /simulated status update failure/);
  assert.equal(state.report, null);
  assert.equal(state.job.status, 'in_progress');
  assert.equal(state.job.version, 4);
});

test('rejects reports for jobs outside in-progress state', async () => {
  const { state, submit } = createHarness({ status: 'new' });
  await assert.rejects(submit(), { status: 409, code: 'job_not_in_progress' });
  assert.equal(state.report, null);
  assert.equal(state.job.status, 'new');
});
