// Run as an independently supervised always-on worker, or invoke --once from a reliable scheduler.
// Never run against production without separate operator approval.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { getSupabaseAdminClient } from '../src/services/supabaseClient.js';

export async function sweepExpiredSelfExams(client = getSupabaseAdminClient()) {
  const request = client.rpc('self_exam_expiry_sweep_v1', { p_limit: 25 });
  const { data, error } = await (typeof request.abortSignal === 'function' ? request.abortSignal(AbortSignal.timeout(30_000)) : request);
  if (error || !data || !Number.isInteger(data.finalized) || !Number.isInteger(data.failed)) throw Error('Expiry sweep unavailable');
  return data;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.SELF_EXAM_EXPIRY_WORKER_ENABLED !== 'true') throw Error('Explicit expiry-worker enablement is required');
  let stopping = false;
  process.on('SIGTERM', () => { stopping = true; });
  process.on('SIGINT', () => { stopping = true; });
  do {
    try {
      const result = await sweepExpiredSelfExams();
      console.log(JSON.stringify({event:'self_exam_expiry_sweep',...result,time:new Date().toISOString()}));
      if (result.failed > 0 && process.argv.includes('--once')) process.exitCode = 1;
    } catch {
      console.error(JSON.stringify({event:'self_exam_expiry_sweep_failed',time:new Date().toISOString()}));
      if (process.argv.includes('--once')) process.exitCode = 1;
    }
    if (process.argv.includes('--once') || stopping) break;
    await new Promise(resolve => setTimeout(resolve, 5000));
  } while (!stopping);
}
