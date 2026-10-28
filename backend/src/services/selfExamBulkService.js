import { performance } from 'node:perf_hooks';
import { getSupabaseAdminClient } from './supabaseClient.js';
import { logger } from './logger.js';

export const BULK_MAX_ITEMS = 500;
export const BULK_MAX_BYTES = 128 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const bulkSelfExamEnabled = () => process.env.SELF_EXAM_BULK_V1_ENABLED === 'true';
export function bulkError(code, message, status = 400, retryable = false) {
  return Object.assign(new Error(message), { code, status, retryable });
}
function uuid(value) { return typeof value === 'string' && UUID.test(value); }
function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export function validateBulkIdentity(principal, sessionId, submissionId) {
  if (!/^[a-f0-9]{24}$/.test(principal?.sub || '')) throw bulkError('BULK_UNAUTHORIZED', 'Sign in again to submit this exam.', 401);
  if (!uuid(sessionId) || !uuid(submissionId)) throw bulkError('BULK_INVALID_REQUEST', 'Valid session and submission identifiers are required.');
  return { p_owner_account_id: principal.sub, p_session_id: sessionId.toLowerCase(), p_submission_id: submissionId.toLowerCase() };
}
export function validateBulkSubmission(principal, sessionId, body) {
  if (Buffer.byteLength(JSON.stringify(body) || '', 'utf8') > BULK_MAX_BYTES) throw bulkError('BULK_PAYLOAD_TOO_LARGE', 'Submission exceeds the size limit.', 413);
  if (!exactKeys(body, ['submissionId', 'answers']) || !Array.isArray(body.answers) || body.answers.length < 1 || body.answers.length > BULK_MAX_ITEMS) {
    throw bulkError('BULK_INVALID_REQUEST', 'A complete answer snapshot of 1–500 questions is required.');
  }
  const identity = validateBulkIdentity(principal, sessionId, body.submissionId);
  const ids = new Set();
  const answers = body.answers.map(item => {
    if (!exactKeys(item, ['questionId', 'selectedOptionId']) || !uuid(item.questionId) || (item.selectedOptionId !== null && !uuid(item.selectedOptionId))) {
      throw bulkError('BULK_INVALID_ANSWER', 'Each answer needs a valid question and an option or explicit blank.');
    }
    const questionId = item.questionId.toLowerCase();
    if (ids.has(questionId)) throw bulkError('BULK_DUPLICATE_QUESTION', 'A question may appear only once.');
    ids.add(questionId);
    return { questionId, selectedOptionId: item.selectedOptionId?.toLowerCase() ?? null };
  }).sort((a, b) => a.questionId.localeCompare(b.questionId));
  return { ...identity, p_answers: answers };
}
const PUBLIC_ERRORS = {
  CHECKPOINT_CONFLICT: [409, 'A newer answer revision exists. Reload this exam before saving.'],
  CHECKPOINT_REQUIRED: [409, 'This exam requires revision-safe answer saving.'],
  CHECKPOINT_NOT_DUE: [409, 'The exam has not expired.'],
  BULK_SESSION_UNAVAILABLE: [404, 'Self exam session unavailable.'],
  BULK_SESSION_CLOSED: [409, 'This exam is no longer accepting answers.'],
  BULK_SESSION_EXPIRED: [410, 'The exam deadline has passed. New answers cannot be saved.'],
  BULK_ALREADY_SUBMITTED: [409, 'This exam was finalized by another submission. Reconcile its result.'],
  BULK_PAYLOAD_CONFLICT: [409, 'This submission identifier belongs to a different saved snapshot.'],
  BULK_DUPLICATE_QUESTION: [400, 'A question may appear only once.'],
  BULK_QUESTION_UNAVAILABLE: [400, 'A question does not belong to this exam.'],
  BULK_OPTION_UNAVAILABLE: [400, 'An option does not belong to its question.'],
  BULK_SNAPSHOT_INCOMPLETE: [400, 'Submit the complete question snapshot, including blanks.'],
  BULK_INVALID_REQUEST: [400, 'Invalid submission request.'],
  BULK_INVALID_ANSWER: [400, 'Invalid answer snapshot.'],
  BULK_QUESTION_INVALID: [409, 'The exam question bank needs administrator review.'],
  BULK_DISABLED: [503, 'Bulk submission is not enabled. Your saved snapshot has been retained.', true],
};
export function sanitizeBulkDatabaseError(error) {
  const known = PUBLIC_ERRORS[error?.message];
  if (known) return bulkError(error.message, known[1], known[0], known[2] || false);
  if (error?.code === '23505') return bulkError('BULK_PAYLOAD_CONFLICT', 'This submission identifier has already been used.', 409);
  if (['PGRST202', '42883', '42703', '42P01'].includes(error?.code)) return bulkError('BULK_SCHEMA_UNAVAILABLE', 'Bulk submission needs an administrator configuration check.', 503, true);
  return bulkError('BULK_TEMPORARY_FAILURE', 'Submission could not be confirmed. Retry the saved submission.', 503, true);
}
export function createBulkSelfExamService({ client = getSupabaseAdminClient, enabled = bulkSelfExamEnabled, log = logger,
  legacyResult = async (principal, sessionId) => (await import('./selfExamService.js')).getSelfExamResult(principal, sessionId) } = {}) {
  async function invoke(name, args, correlationId, itemCount, validationMs) {
    const started = performance.now();
    let response;
    try {
      const request = client().rpc(name, args);
      response = await (typeof request.abortSignal === 'function' ? request.abortSignal(AbortSignal.timeout(20_000)) : request);
    } catch { throw bulkError('BULK_TEMPORARY_FAILURE', 'Submission could not be confirmed. Retry the saved submission.', 503, true); }
    if (response?.error) throw sanitizeBulkDatabaseError(response.error);
    if (!response?.data) throw sanitizeBulkDatabaseError(null);
    const timing = {};
    for (const key of ['lockMs','validationAndSaveMs','scoringMs','resultMs','transactionMs']) {
      if (Number.isFinite(response.data.timing?.[key])) timing[key] = response.data.timing[key];
    }
    log.info('Self exam bulk operation completed.', {
      correlationId, operation: name, itemCount, validationMs: Math.round(validationMs * 100) / 100,
      databaseRoundTripMs: Math.round((performance.now() - started) * 100) / 100, databaseRequests: 1,
      replayed: response.data.replayed === true, ...timing,
    });
    return response.data;
  }
  return {
    async submit(principal, sessionId, body, correlationId) {
      const start = performance.now();
      const args = validateBulkSubmission(principal, sessionId, body);
      const data = await invoke('self_exam_submit_bulk_v1', { ...args, p_accept_new: enabled() }, correlationId, args.p_answers.length, performance.now() - start);
      if (!data.canonical) throw sanitizeBulkDatabaseError(null);
      return { ...data.canonical, submission: { version: 1, id: data.submissionId, replayed: data.replayed === true } };
    },
    async checkpoint(principal, sessionId, body, correlationId) {
      if (!exactKeys(body, ['mutationId','expectedRevision','answers']) || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || body.expectedRevision > 9007199254740988) throw bulkError('BULK_INVALID_REQUEST','Invalid checkpoint revision.');
      const args = validateBulkSubmission(principal,sessionId,{submissionId:body.mutationId,answers:body.answers});
      return invoke('self_exam_checkpoint_v1',{p_owner_account_id:args.p_owner_account_id,p_session_id:args.p_session_id,p_mutation_id:args.p_submission_id,p_expected_revision:body.expectedRevision,p_answers:args.p_answers},correlationId,args.p_answers.length,0);
    },
    async checkpointState(principal, sessionId, correlationId) {
      const args=validateBulkIdentity(principal,sessionId,'00000000-0000-4000-8000-000000000000');
      delete args.p_submission_id;
      return invoke('self_exam_checkpoint_state_v1',args,correlationId,0,0);
    },
    async status(principal, sessionId, submissionId, correlationId) {
      const start = performance.now();
      const args = validateBulkIdentity(principal, sessionId, submissionId);
      const data = await invoke('self_exam_bulk_status_v1', args, correlationId, 0, performance.now() - start);
      if (data.state === 'finalized_legacy') return { state: 'finalized_other', result: await legacyResult(principal, sessionId) };
      if (!['pending','committed','finalized_other'].includes(data.state)) throw sanitizeBulkDatabaseError(null);
      return { state: data.state, result: data.canonical ?? null };
    },
  };
}
