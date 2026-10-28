// Disabled capability adapter; no production imports/configuration switch.
// Readiness attestations are for future integration/tests, never DB detection.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(code,message,status=409){const e=new Error(message);e.code=code;e.status=status;throw e;}
export function immutableAccountId(principal){
 if(!/^[a-f0-9]{24}$/.test(principal?.sub||''))fail('SELF_EXAM_OWNER_INVALID','An immutable authenticated account subject is required.',403);
 return principal.sub;
}
export function assertSnapshotOwner(session,principal){
 const id=immutableAccountId(principal);
 if(session?.integrity_mode!=='snapshot_v1'||!session.owner_account_id)fail('SELF_EXAM_LEGACY_REVIEW_REQUIRED','Historical ownership requires review.');
 if(session.owner_account_id!==id)fail('SELF_EXAM_OWNER_MISMATCH','Self exam session unavailable.',404);
 return id;
}
export function createAtomicSelfExamAdapter(client,readiness={}){
 const enabled=readiness.enabled===true&&readiness.schemaVerified===true&&readiness.transactionsVerified===true&&readiness.ownershipVerified===true;
 function args(principal,sessionId){
  if(!enabled)fail('SELF_EXAM_ATOMIC_DISABLED','Atomic self exam capability is disabled.',503);
  if(!UUID.test(sessionId))fail('SELF_EXAM_SESSION_INVALID','Invalid self exam session.',400);
  return {p_owner_account_id:immutableAccountId(principal),p_session_id:sessionId};
 }
 async function invoke(name,payload){
  let response;
  try { response = await client.rpc(name,payload); }
  catch { fail('SELF_EXAM_ATOMIC_UNAVAILABLE','Atomic self exam operation unavailable.',503); }
  const {data,error}=response || {};
  if(error){
   if(error.message==='ANSWER_REVISION_CONFLICT')fail('ANSWER_REVISION_CONFLICT','Refresh the confirmed answer revision before retrying.');
   // No provider details or mutable-grade fallback escapes this boundary.
   fail('SELF_EXAM_ATOMIC_UNAVAILABLE','Atomic self exam operation unavailable.',503);
  }
  if(data==null)fail('SELF_EXAM_ATOMIC_UNAVAILABLE','Atomic operation returned no acknowledgement.',503);
  return data;
 }
 return Object.freeze({
  start(principal,id){return invoke('self_exam_start_v1',args(principal,id));},
  submit(principal,id){return invoke('self_exam_submit_v1',args(principal,id));},
  save(principal,id,body={}){
   const payload=args(principal,id);
   if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)fail('ANSWER_REVISION_INVALID','Expected answer revision is required.',400);
   if(!UUID.test(body.mutationId)||!UUID.test(body.questionId)||(body.selectedOptionId!=null&&!UUID.test(body.selectedOptionId)))fail('ANSWER_MUTATION_INVALID','Valid mutation, question and option identifiers are required.',400);
   return invoke('self_exam_save_answer_v1',{...payload,p_question_id:body.questionId,p_selected_option_id:body.selectedOptionId??null,p_expected_revision:body.expectedRevision,p_mutation_id:body.mutationId});
  },
 });
}
