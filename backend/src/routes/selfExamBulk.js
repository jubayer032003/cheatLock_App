import express from 'express';
import { randomUUID } from 'node:crypto';
import { logger } from '../services/logger.js';
import { createBulkSelfExamService, bulkError, BULK_MAX_BYTES } from '../services/selfExamBulkService.js';

// Install BEFORE the servers' general JSON parser. Keep all historical aliases bounded.
export const bulkSubmissionPath = /^\/(?:self-exam|self-exams|seft-exam)\/v1\/sessions\/[^/]+\/(?:submit-bulk|checkpoint)\/?$/;
export function bulkJsonParser(req, res, next) {
  express.json({ limit: BULK_MAX_BYTES, strict: true })(req, res, error => {
    if (!error) return next();
    res.status(error.type === 'entity.too.large' ? 413 : 400).json({
      code: error.type === 'entity.too.large' ? 'BULK_PAYLOAD_TOO_LARGE' : 'BULK_INVALID_REQUEST',
      message: error.type === 'entity.too.large' ? 'Submission exceeds the size limit.' : 'Invalid JSON submission.', retryable: false,
    });
  });
}
export function installBulkSelfExamRoutes(router, requireAuth, requireRole, service = createBulkSelfExamService()) {
  const authorized = [requireAuth, requireRole('STUDENT')];
  const handle = operation => async (req, res) => {
    const suppliedId = req.get('x-submission-correlation-id');
    const correlationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedId || '') ? suppliedId : randomUUID();
    res.set('x-submission-correlation-id', correlationId);
    res.set('Cache-Control', 'no-store');
    try {
      if (req.method === 'POST' && !req.is('application/json')) throw bulkError('BULK_INVALID_REQUEST', 'Use an application/json submission.');
      res.json(await operation(req, correlationId));
    } catch (error) {
      const safe = (error?.code?.startsWith('BULK_') || error?.code?.startsWith('CHECKPOINT_')) ? error : bulkError('BULK_TEMPORARY_FAILURE', 'Submission could not be confirmed. Retry the saved submission.', 503, true);
      logger.warn('Self exam bulk operation not confirmed.', { correlationId, code: safe.code, statusCode: safe.status || 503, retryable: safe.retryable === true });
      res.status(safe.status || 503).json({ code: safe.code, message: safe.message, retryable: safe.retryable === true, correlationId });
    }
  };
  router.post('/v1/sessions/:sessionId/checkpoint', ...authorized, handle((req,id) => service.checkpoint(req.user,req.params.sessionId,req.body,id)));
  router.get('/v1/sessions/:sessionId/checkpoint', ...authorized, handle((req,id) => service.checkpointState(req.user,req.params.sessionId,id)));
  router.post('/v1/sessions/:sessionId/submit-bulk', ...authorized, handle((req, id) => service.submit(req.user, req.params.sessionId, req.body, id)));
  router.get('/v1/sessions/:sessionId/submissions/:submissionId', ...authorized, handle((req, id) => service.status(req.user, req.params.sessionId, req.params.submissionId, id)));
}
