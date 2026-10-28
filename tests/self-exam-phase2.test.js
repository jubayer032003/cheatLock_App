import test from 'node:test';
import assert from 'node:assert/strict';
import { captureSnapshot, activeSnapshot, gradeSnapshots } from '../backend/src/services/selfExamSnapshot.js';
import { createAtomicSelfExamAdapter, immutableAccountId } from '../backend/src/services/selfExamAtomicAdapter.js';
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222', C='33333333-3333-4333-8333-333333333333';
const principal={sub:'0123456789abcdef01234567',identifier:'old@example.invalid'};
const fixture=()=>({schemaVersion:1,sessionId:A,questionId:B,displayOrder:1,marks:2.25,questionType:'mcq',questionText:'Before',difficulty:'easy',options:[{id:B,text:'yes',displayOrder:0},{id:C,text:'no',displayOrder:1}],correctOptionId:B,explanation:'secret',capturedAt:'2026-10-21T00:00:00.000Z'});
test('snapshots detach/freeze content and grading key from later bank edits',()=>{
 const input=fixture(),snapshot=captureSnapshot(input);input.questionText='After';input.options[0].text='Changed';input.correctOptionId=C;
 assert.equal(snapshot.questionText,'Before');assert.equal(snapshot.options[0].text,'yes');assert.throws(()=>{snapshot.options[0].text='edit';});
 assert.equal(gradeSnapshots(A,[snapshot],[{questionId:B,selectedOptionId:B}]).score,2.25);
});
test('active snapshot uses a whitelist, never keys/explanations or unknown metadata',()=>{
 const input=fixture();input.answerKey='secret';input.options[0].isCorrect=true;
 const output=activeSnapshot(input);assert.doesNotMatch(JSON.stringify(output),/secret|answerKey|isCorrect|correctOption|capturedAt/);
 assert.equal(output.options[0].id,B);
});
test('malformed and missing snapshots fail without legacy fallback',()=>{
 for(const patch of [{schemaVersion:2},{correctOptionId:A},{marks:-1},{marks:1.111},{questionType:'short_answer'},{capturedAt:'invalid'},{capturedAt:'2026-02-30T00:00:00.000Z'},{options:[]},{options:[{id:B,text:'one',displayOrder:0},{id:B,text:'two',displayOrder:1}]}])assert.throws(()=>captureSnapshot({...fixture(),...patch}));
 assert.throws(()=>captureSnapshot(null));assert.throws(()=>gradeSnapshots(A,[],[]));
});
test('snapshot grades correct/wrong/unanswered using captured cents and stable rounding',()=>{
 const first=fixture(),second={...fixture(),questionId:C,displayOrder:2,marks:1.25};
 const r=gradeSnapshots(A,[first,second],[{questionId:B,selectedOptionId:B}]);
 assert.deepEqual([r.score,r.totalMarks,r.percentage,r.correctCount,r.incorrectCount,r.unansweredCount],[2.25,3.5,64,1,0,1]);
 assert.equal(gradeSnapshots(A,[first],[{questionId:B,selectedOptionId:C}]).score,0);
 assert.equal(gradeSnapshots(A,[first],[{questionId:B,selectedOptionId:null}]).unansweredCount,1);
});
test('grading rejects mixed sessions, duplicate questions/answers and foreign options',()=>{
 const s=fixture();assert.throws(()=>gradeSnapshots(A,[{...s,marks:999999.99},{...s,questionId:C,displayOrder:2}],[]));for(const snapshots of [[s,s],[{...s,sessionId:C}]])assert.throws(()=>gradeSnapshots(A,snapshots,[]));
 for(const answers of [[{questionId:C,selectedOptionId:B}],[{questionId:B,selectedOptionId:A}],[{questionId:B},{questionId:B}]])assert.throws(()=>gradeSnapshots(A,[s],answers));
});
test('immutable account scope ignores renamed identifier and distinguishes account recreation',()=>{
 assert.equal(immutableAccountId(principal),immutableAccountId({...principal,identifier:'new@example.invalid'}));
 assert.notEqual(immutableAccountId(principal),immutableAccountId({...principal,sub:'1123456789abcdef01234567'}));
 assert.throws(()=>immutableAccountId({identifier:principal.identifier}));
});
test('atomic adapter defaults disabled and rejects incomplete or truthy readiness attestations',()=>{
 for(const options of [{},{enabled:'true'},{enabled:true},{enabled:true,schemaVerified:true}]){
  const adapter=createAtomicSelfExamAdapter({rpc(){throw Error('must not call');}},options);
  assert.throws(()=>adapter.start(principal,A),e=>e.code==='SELF_EXAM_ATOMIC_DISABLED');
 }
});
test('enabled test-only adapter uses one owner-scoped RPC and never falls back on missing functions',async()=>{
 const calls=[];const client={async rpc(name,args){calls.push({name,args});return {data:{sessionId:A}};}};
 const adapter=createAtomicSelfExamAdapter(client,{enabled:true,schemaVerified:true,transactionsVerified:true,ownershipVerified:true});
 await adapter.start(principal,A);assert.equal(calls.length,1);assert.equal(calls[0].name,'self_exam_start_v1');assert.equal(calls[0].args.p_owner_account_id,principal.sub);
 client.rpc=async()=>({error:{code:'PGRST202',message:'missing RPC'}});
 await assert.rejects(adapter.submit(principal,A),e=>e.code==='SELF_EXAM_ATOMIC_UNAVAILABLE');
});
test('answer protocol rejects missing revisions/mutation IDs and propagates conflicts',async()=>{
 let calls=0;const client={async rpc(){calls++;return {error:{code:'P0001',message:'ANSWER_REVISION_CONFLICT'}};}};
 const adapter=createAtomicSelfExamAdapter(client,{enabled:true,schemaVerified:true,transactionsVerified:true,ownershipVerified:true});
 assert.throws(()=>adapter.save(principal,A,{questionId:B,selectedOptionId:C}),/revision/i);
 await assert.rejects(adapter.save(principal,A,{questionId:B,selectedOptionId:C,expectedRevision:0,mutationId:A}),e=>e.status===409);
 assert.equal(calls,1);
});
test('Android self-exam uses server deadline and server-confirmed answers without shared numeric drafts',async()=>{
 const {readFileSync}=await import('node:fs');
 const screen=readFileSync(new URL('../app/src/main/java/com/jubayer/cheatlock/ui/ExamScreen.kt',import.meta.url),'utf8');
 assert.match(screen,/ServerExamDeadline\.from/);assert.match(screen,/serverDeadline\.remainingSeconds/);
 assert.match(screen,/confirmedSelfExamAnswer/);assert.match(screen,/if \(!isSelfExam\) examStorage\.saveAnswer/);
 const repository=readFileSync(new URL('../app/src/main/java/com/jubayer/cheatlock/data/MongoBackendRepository.kt',import.meta.url),'utf8');
 assert.match(repository,/timingAnchorElapsedRealtime = requestStarted/);
});
test('Android recovery pointer is account-sub scoped without identifier fallback',async()=>{
 const {readFileSync}=await import('node:fs');
 const storage=readFileSync(new URL('../app/src/main/java/com/jubayer/cheatlock/data/SelfExamStorage.kt',import.meta.url),'utf8');
 assert.match(storage,/accountPointerKey/);assert.match(storage,/optString\("sub"\)/);assert.doesNotMatch(storage,/putString\(KEY_ACTIVE_SESSION_ID/);
});
test('snapshot ownership denies legacy and another account even with the same identifier',async()=>{
 const {assertSnapshotOwner}=await import('../backend/src/services/selfExamAtomicAdapter.js');
 const session={integrity_mode:'snapshot_v1',owner_account_id:principal.sub};
 assert.equal(assertSnapshotOwner(session,{...principal,identifier:'renamed'}),principal.sub);
 assert.throws(()=>assertSnapshotOwner(session,{...principal,sub:'1123456789abcdef01234567'}),e=>e.status===404);
 assert.throws(()=>assertSnapshotOwner({student_id:principal.identifier},principal),e=>e.code==='SELF_EXAM_LEGACY_REVIEW_REQUIRED');
});
test('concurrent adapter starts/submits preserve fixture acknowledgements (model only, not PostgreSQL)',async()=>{
 const persisted={sessionId:A,deadline:'2026-10-21T01:00:00Z',questions:[B]};let finalized;
 const client={async rpc(name,args){assert.equal(args.p_owner_account_id,principal.sub);await Promise.resolve();if(name==='self_exam_start_v1')return {data:persisted};finalized??={score:2};return {data:finalized};}};
 const adapter=createAtomicSelfExamAdapter(client,{enabled:true,schemaVerified:true,transactionsVerified:true,ownershipVerified:true});
 const starts=await Promise.all(Array.from({length:10},()=>adapter.start(principal,A)));
 assert.ok(starts.every(s=>s===persisted));
 const results=await Promise.all(Array.from({length:10},()=>adapter.submit(principal,A)));
 assert.ok(results.every(s=>s===finalized));
});
test('concurrent answer revisions expose conflicts without client retry or legacy writes (model only)',async()=>{
 let revision=0;const mutations=new Map();let calls=0;
 const client={async rpc(name,args){calls++;assert.equal(name,'self_exam_save_answer_v1');await Promise.resolve();const old=mutations.get(args.p_mutation_id);if(old)return {data:old};if(args.p_expected_revision!==revision)return {error:{message:'ANSWER_REVISION_CONFLICT'}};revision++;const ack={revision};mutations.set(args.p_mutation_id,ack);return {data:ack};}};
 const adapter=createAtomicSelfExamAdapter(client,{enabled:true,schemaVerified:true,transactionsVerified:true,ownershipVerified:true});
 const first={questionId:B,selectedOptionId:C,expectedRevision:0,mutationId:A};
 const writes=await Promise.allSettled([adapter.save(principal,A,first),adapter.save(principal,A,{...first,mutationId:B})]);
 assert.equal(writes.filter(r=>r.status==='fulfilled').length,1);assert.equal(writes.filter(r=>r.status==='rejected').length,1);
 assert.equal((await adapter.save(principal,A,first)).revision,1);assert.equal(revision,1);assert.equal(calls,3);
});
test('disabled components have no live route/service imports',async()=>{
 const {readFileSync}=await import('node:fs');
 for(const path of ['../backend/src/routes/selfExam.js','../backend/src/services/selfExamService.js'])assert.doesNotMatch(readFileSync(new URL(path,import.meta.url),'utf8'),/selfExamAtomicAdapter|selfExamSnapshot/);
 const screen=readFileSync(new URL('../app/src/main/java/com/jubayer/cheatlock/ui/ExamScreen.kt',import.meta.url),'utf8');assert.doesNotMatch(screen,/SelfExamAnswerQueue/);
 assert.match(screen,/selectedOptionId = selectedOptionIds\[index\]/);
});
test('RPC transport exceptions are sanitized and do not trigger fallback',async()=>{
 const adapter=createAtomicSelfExamAdapter({async rpc(){throw Error('private transport details');}},{enabled:true,schemaVerified:true,transactionsVerified:true,ownershipVerified:true});
 await assert.rejects(adapter.start(principal,A),e=>e.code==='SELF_EXAM_ATOMIC_UNAVAILABLE'&&!e.message.includes('private'));
});
