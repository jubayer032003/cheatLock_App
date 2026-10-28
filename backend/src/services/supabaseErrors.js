// Internal classification only. Raw database messages/details never leave this module.
const schemaCodes = new Set(['PGRST205', 'PGRST204', '42P01', '42703']);
const hierarchyFailures = new WeakSet();

export function createSupabaseRequestError(error, fallbackMessage = 'Question Bank request failed.') {
  if (['BULK_SESSION_CLOSED','BULK_SESSION_EXPIRED','BULK_OWNER_IMMUTABLE','BULK_INVALID_ANSWER'].includes(error.message)) {
    const expired = error.message === 'BULK_SESSION_EXPIRED';
    return Object.assign(new Error(expired ? 'The exam deadline has passed.' : 'This exam no longer accepts this change.'), {
      status: expired ? 410 : 409, code: error.message,
    });
  }
  const missingSchema = schemaCodes.has(error.code);
  const publicMessage = missingSchema
    ? 'Question Bank schema is unavailable through the configured API. Ask an administrator to verify the project, schema and access.'
    : error.code === '42501'
      ? 'Question Bank access is unavailable. Ask an administrator to verify backend access.'
      : fallbackMessage;
  const requestError = new Error(publicMessage);
  // Keep established provider codes/status behavior and the HTTP code/message envelope.
  requestError.status = error.code === 'PGRST205' ? 503 : Number(error.status) || 500;
  requestError.code = error.code || 'SUPABASE_REQUEST_FAILED';
  // Narrow legacy fallback to a known missing-object code and hierarchy dependency.
  // Neither permission errors nor matching free text can select another schema.
  if (missingSchema && /\b(?:exam_categories|exam_nodes|node_id)\b/i.test(String(error.message || ''))) {
    hierarchyFailures.add(requestError);
  }
  return requestError;
}

export function isMissingExamHierarchyError(error) {
  return Boolean(error && hierarchyFailures.has(error));
}
