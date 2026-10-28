import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import express from 'express';
import { validateBulkSubmission, createBulkSelfExamService, sanitizeBulkDatabaseError, BULK_MAX_BYTES } from '../backend/src/services/selfExamBulkService.js';
import { installBulkSelfExamRoutes, bulkJsonParser, bulkSubmissionPath } from '../backend/src/routes/selfExamBulk.js';
const principal={sub:'aaaaaaaaaaaaaaaaaaaaaaaa',identifier:'synthetic-student',role:'STUDENT'};
const sessionId=randomUUID();
function request(count=100) {return {submissionId:randomUUID(),answers:Array.from({length:count},()=>({questionId:randomUUID(),selectedOptionId:randomUUID()}))};}
test('bulk accepts complete 100/300/500 snapshots and explicit blanks',()=>{
 for(const count of [100,300,500]) {const body=request(count);body.answers[0].selectedOptionId=null;assert.equal(validateBulkSubmission(principal,sessionId,body).p_answers.length,count);}
});
test('bulk rejects duplicate normalized question IDs and invalid identifiers',()=>{
 const body=request(2);body.answers[1].questionId=body.answers[0].questionId.toUpperCase();assert.throws(()=>validateBulkSubmission(principal,sessionId,body),{code:'BULK_DUPLICATE_QUESTION'});
 for(const field of ['questionId','selectedOptionId']){const bad=request(1);bad.answers[0][field]='invalid';assert.throws(()=>validateBulkSubmission(principal,sessionId,bad),{code:'BULK_INVALID_ANSWER'});}
});
test('bulk rejects client score/time/count fields and implicit missing blanks',()=>{
 for(const extra of ['score','submittedAt','questionCount']) assert.throws(()=>validateBulkSubmission(principal,sessionId,{...request(1),[extra]:1}),{code:'BULK_INVALID_REQUEST'});
 const body=request(1);delete body.answers[0].selectedOptionId;assert.throws(()=>validateBulkSubmission(principal,sessionId,body),{code:'BULK_INVALID_ANSWER'});
});
test('bulk enforces item and byte limits before the RPC',()=>{
 assert.throws(()=>validateBulkSubmission(principal,sessionId,request(501)),{code:'BULK_INVALID_REQUEST'});
 assert.throws(()=>validateBulkSubmission(principal,sessionId,{...request(1),padding:'x'.repeat(BULK_MAX_BYTES)}),{code:'BULK_PAYLOAD_TOO_LARGE'});
 assert.throws(()=>validateBulkSubmission(principal,sessionId,{submissionId:randomUUID(),answers:[]}),{code:'BULK_INVALID_REQUEST'});
});
test('bulk requires immutable authenticated subject',()=>{
 assert.throws(()=>validateBulkSubmission({identifier:'synthetic-student'},sessionId,request(1)),{code:'BULK_UNAUTHORIZED'});
});
test('one RPC, explicit flag, safe timing metadata and canonical result shape',async()=>{
 const calls=[],logs=[];const body=request(300);
 const service=createBulkSelfExamService({enabled:()=>true,client:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{canonical:{result:{score:300}},submissionId:body.submissionId,replayed:false,timing:{transactionMs:2}}};}}),log:{info:(message,meta)=>logs.push({message,meta})}});
 const result=await service.submit(principal,sessionId,body,'opaque-correlation');
 assert.equal(calls.length,1);assert.equal(calls[0].args.p_owner_account_id,principal.sub);assert.equal(calls[0].args.p_accept_new,true);assert.equal(result.result.score,300);
 const log=JSON.stringify(logs);assert(!log.includes(principal.sub));assert(!log.includes(principal.identifier));assert(!log.includes(body.answers[0].selectedOptionId));assert.equal(logs[0].meta.databaseRequests,1);
});
test('feature-off still invokes replay-capable RPC with new commits disabled',async()=>{
 let args;const service=createBulkSelfExamService({enabled:()=>false,client:()=>({rpc:async(_name,value)=>{args=value;return {data:{canonical:{result:{}},submissionId:value.p_submission_id,replayed:true}};}}),log:{info(){}}});
 await service.submit(principal,sessionId,request(1),'id');assert.equal(args.p_accept_new,false);
});
test('status uses one owned RPC without accepting client state',async()=>{
 let calls=0;const service=createBulkSelfExamService({client:()=>({rpc:async(name,args)=>{calls++;assert.equal(name,'self_exam_bulk_status_v1');assert.equal(args.p_owner_account_id,principal.sub);return {data:{state:'committed',canonical:{result:{score:100}}}};}}),log:{info(){}}});
 const result=await service.status(principal,sessionId,randomUUID(),'id');assert.equal(calls,1);assert.equal(result.result.result.score,100);
});
test('legacy winner is reconciled through its authenticated result without another submit',async()=>{
 let reads=0;
 const service=createBulkSelfExamService({client:()=>({rpc:async()=>({data:{state:'finalized_legacy'}})}),log:{info(){}},legacyResult:async(actor,id)=>{reads++;assert.equal(actor,principal);assert.equal(id,sessionId);return {result:{score:50}};}});
 const response=await service.status(principal,sessionId,randomUUID(),'id');assert.equal(response.state,'finalized_other');assert.equal(response.result.result.score,50);assert.equal(reads,1);
});
test('existing API rate limiter allows 120 requests then rejects 121st in isolated memory mode',()=>{
 const code=`import assert from 'node:assert/strict';import {createRateLimiter} from './backend/src/middleware/rateLimiter.js';const limiter=createRateLimiter('bulk-test',{windowMs:60000,max:120},()=> 'synthetic');let allowed=0,blocked=0;for(let i=0;i<121;i++){const response={setHeader(){},set(){},status(code){assert.equal(code,429);return this},json(){blocked++}};await limiter({headers:{},ip:'127.0.0.1'},response,()=>{allowed++});}assert.equal(allowed,120);assert.equal(blocked,1);`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:20_000,windowsHide:true,env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,CHEATLOCK_SKIP_DOTENV:'true',REDIS_URL:'',NODE_ENV:'test'}});
 assert.equal(child.status,0,child.stderr);
});
test('known errors predictable; provider details never exposed',()=>{
 for(const [message,status] of [['BULK_SESSION_EXPIRED',410],['BULK_SESSION_UNAVAILABLE',404],['BULK_PAYLOAD_CONFLICT',409],['BULK_OPTION_UNAVAILABLE',400]])assert.equal(sanitizeBulkDatabaseError({message}).status,status);
 const unsafe=sanitizeBulkDatabaseError({code:'XX000',message:'private table secret details'});assert.equal(unsafe.status,503);assert.equal(unsafe.retryable,true);assert(!unsafe.message.includes('secret'));
});
test('database transport loss is retryable without answer/key disclosure',async()=>{
 const service=createBulkSelfExamService({client:()=>({rpc(){throw Error('private provider message');}})});
 await assert.rejects(service.submit(principal,sessionId,request(1),'id'),error=>error.code==='BULK_TEMPORARY_FAILURE'&&error.retryable&&!error.message.includes('private'));
});
test('shared versioned routes enforce auth/role, bounded parsing and response codes',async()=>{
 const app=express();app.use(bulkSubmissionPath,bulkJsonParser);app.use(express.json());const router=express.Router();let calls=0;
 const auth=(req,res,next)=>{if(req.get('authorization')!=='Bearer synthetic-test')return res.status(401).json({code:'AUTH_REQUIRED'});req.user=principal;next();};
 const role=expected=>(req,res,next)=>{assert.equal(expected,'STUDENT');next();};
 installBulkSelfExamRoutes(router,auth,role,{submit:async(_p,_s,body)=>{calls++;validateBulkSubmission(principal,sessionId,body);return {result:{score:100}};},status:async()=>({state:'pending',result:null})});
 app.use('/self-exam',router);const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const url=`http://127.0.0.1:${server.address().port}/self-exam/v1/sessions/${sessionId}/submit-bulk`;
 try {
  assert.equal((await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request(100))})).status,401);
  const headers={'content-type':'application/json',authorization:'Bearer synthetic-test'};
  const success=await fetch(url,{method:'POST',headers,body:JSON.stringify(request(100))});assert.equal(success.status,200);assert.equal(success.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(url,{method:'POST',headers,body:'{"padding":"'+'x'.repeat(BULK_MAX_BYTES)+'"}'})).status,413);
  assert.equal((await fetch(url,{method:'POST',headers,body:'{broken'})).status,400);assert.equal(calls,1);
 } finally {await new Promise(resolve=>server.close(resolve));}
});
test('both entries install shared routes/parser, preserve legacy endpoints and rate limiter',()=>{
 for(const prefix of ['backend/','']) {
  const routes=readFileSync(new URL(`../${prefix}src/routes/selfExam.js`,import.meta.url),'utf8');
  const server=readFileSync(new URL(`../${prefix}src/server.js`,import.meta.url),'utf8');
  assert.match(routes,/installBulkSelfExamRoutes\(selfExamRouter, requireAuth, requireRole\)/);
  for(const path of ['sessions/:sessionId/answers','sessions/:sessionId/submit'])assert(routes.includes(path));
  assert(server.indexOf('app.use(bulkSubmissionPath, bulkJsonParser)')<server.indexOf('app.use(express.json'));
  assert(server.includes('app.use(rateLimiter)'));
 }
 const auth=readFileSync(new URL('../src/middleware/auth.js',import.meta.url),'utf8');assert(!auth.includes('header.slice(0, 40)'));assert(!auth.includes('token verified; user:'));
});
