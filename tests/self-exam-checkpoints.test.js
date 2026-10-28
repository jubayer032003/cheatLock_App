import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createBulkSelfExamService,sanitizeBulkDatabaseError} from '../backend/src/services/selfExamBulkService.js';
import {sweepExpiredSelfExams} from '../backend/scripts/self-exam-expiry-worker.js';
import express from 'express';
import {createServer} from 'node:http';
import {installBulkSelfExamRoutes,bulkJsonParser} from '../backend/src/routes/selfExamBulk.js';
const principal={sub:'aaaaaaaaaaaaaaaaaaaaaaaa',role:'STUDENT'};
const session=randomUUID();
const body=()=>({mutationId:randomUUID(),expectedRevision:0,answers:[{questionId:randomUUID(),selectedOptionId:null}]});
test('checkpoint enforces exact fields, safe revisions, UUIDs and immutable subject',async()=>{
 const service=createBulkSelfExamService({client:()=>{throw Error('must not access database');}});
 for(const bad of [{...body(),expectedRevision:-1},{...body(),expectedRevision:1.5},{...body(),timestamp:1},{...body(),expectedRevision:9007199254740992}])await assert.rejects(service.checkpoint(principal,session,bad,'id'),{code:'BULK_INVALID_REQUEST'});
 await assert.rejects(service.checkpoint({},session,body(),'id'),{code:'BULK_UNAUTHORIZED'});
 const b=body();b.answers[0].selectedOptionId='bad';await assert.rejects(service.checkpoint(principal,session,b,'id'),{code:'BULK_INVALID_ANSWER'});
});
test('checkpoint invokes one RPC with verified subject and explicit expected revision',async()=>{
 let calls=0;const b=body();const service=createBulkSelfExamService({log:{info(){}},client:()=>({rpc:async(name,args)=>{calls++;assert.equal(name,'self_exam_checkpoint_v1');assert.equal(args.p_owner_account_id,principal.sub);assert.equal(args.p_expected_revision,0);assert.equal(args.p_mutation_id,b.mutationId);return {data:{revision:1}};}})});
 assert.equal((await service.checkpoint(principal,session,b,'id')).revision,1);assert.equal(calls,1);
});
test('checkpoint state uses authenticated owner and safe errors',async()=>{
 const service=createBulkSelfExamService({log:{info(){}},client:()=>({rpc:async(name,args)=>{assert.equal(name,'self_exam_checkpoint_state_v1');assert.equal(args.p_owner_account_id,principal.sub);assert(!Object.hasOwn(args,'p_submission_id'));return {data:{revision:1}};}})});
 assert.equal((await service.checkpointState(principal,session,'id')).revision,1);
 assert.equal(sanitizeBulkDatabaseError({message:'CHECKPOINT_CONFLICT'}).status,409);
});
test('worker performs bounded sweep; transport/error/invalid response fail visibly',async()=>{
 let calls=0;const client={rpc:async(name,args)=>{calls++;assert.equal(name,'self_exam_expiry_sweep_v1');assert.equal(args.p_limit,25);return {data:{finalized:2,failed:0}};}};
 assert.deepEqual(await sweepExpiredSelfExams(client),{finalized:2,failed:0});assert.equal(calls,1);
 for(const response of [{error:{message:'private'}},{data:{finalized:'x',failed:0}},{}])await assert.rejects(sweepExpiredSelfExams({rpc:async()=>response}),/Expiry sweep unavailable/);
});
test('checkpoint HTTP keeps conflict status, authentication and no-store headers',async()=>{
 const app=express();app.use(bulkJsonParser);
 installBulkSelfExamRoutes(app,(req,res,next)=>{if(!req.get('Authorization'))return res.status(401).end();req.user=principal;next();},()=> (_req,_res,next)=>next(),{
  checkpoint:async()=>{throw sanitizeBulkDatabaseError({message:'CHECKPOINT_CONFLICT'});},checkpointState:async()=>({revision:0}),
 });
 const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url=`http://127.0.0.1:${server.address().port}/v1/sessions/${session}/checkpoint`;
  assert.equal((await fetch(url)).status,401);
  const response=await fetch(url,{method:'POST',headers:{Authorization:'synthetic','Content-Type':'application/json'},body:JSON.stringify(body())});
  assert.equal(response.status,409);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).code,'CHECKPOINT_CONFLICT');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
