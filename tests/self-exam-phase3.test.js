import assert from 'node:assert/strict';
import test, {beforeEach,after} from 'node:test';
process.env.CHEATLOCK_SKIP_DOTENV='true';
process.env.SUPABASE_URL='https://phase3-offline.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-phase3-key';
process.env.JWT_SECRET='synthetic-phase3-jwt-key';
const {getSupabaseAdminClient,throwSupabaseError}=await import('../backend/src/services/supabaseClient.js');
const bank=await import('../backend/src/services/questionBankService.js');
const {selfExamRouter}=await import('../backend/src/routes/selfExam.js');
const {User}=await import('../backend/src/models/User.js');
const express=(await import('express')).default;
const jwt=(await import('jsonwebtoken')).default;
const client=getSupabaseAdminClient(),originalFrom=client.from,originalFind=User.findById;
const A='11111111-1111-4111-8111-111111111111';
let calls,respond;
beforeEach(()=>{
 calls=[];respond=()=>{throw Error('Unexpected query; no real transport allowed');};
 client.from=table=>{const op={table,steps:[]};const query=new Proxy({}, {get(_,key){if(key==='then')return (resolve,reject)=>Promise.resolve().then(()=>{calls.push(op);return respond(op);}).then(resolve,reject);return (...args)=>{op.steps.push([key,...args]);return query;};}});return query;};
 User.findById=()=>({select:()=>({lean:async()=>({identifier:'student-a',role:'STUDENT',status:'ACTIVE',tokenVersion:0})})});
});
after(()=>{client.from=originalFrom;User.findById=originalFind;});
function mapped(error){try{throwSupabaseError(error);}catch(e){return e;}throw Error('Expected failure');}
async function request(path,{role='STUDENT',auth=true}={}){
 User.findById=()=>({select:()=>({lean:async()=>({identifier:'student-a',role,status:'ACTIVE',tokenVersion:0})})});
 const app=express();app.use('/self-exam',selfExamRouter);app.use((err,req,res,next)=>res.status(err.status||500).json({code:err.code||'SERVER_ERROR',message:err.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{const token=jwt.sign({sub:'0123456789abcdef01234567',tokenVersion:0},process.env.JWT_SECRET);
 const res=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{headers:auth?{authorization:`Bearer ${token}`}:{}});return {status:res.status,body:await res.json()};
 }finally{await new Promise(resolve=>server.close(resolve));}
}
test('missing and partial Supabase config remain distinct from schema errors without values',()=>{
 delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 assert.throws(()=>getSupabaseAdminClient(),e=>e.code==='SUPABASE_NOT_CONFIGURED'&&e.status===503&&!/migration/i.test(e.message));
 process.env.SUPABASE_URL='https://phase3-offline.invalid';
 assert.throws(()=>getSupabaseAdminClient(),e=>/Incomplete Supabase configuration/.test(e.message)&&!e.message.includes('phase3-offline.invalid'));
 process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-phase3-key';
});
test('schema/cache errors never prescribe destructive migration or claim absence is proven',()=>{
 for(const code of ['PGRST205','PGRST204','42P01','42703']){
  const e=mapped({code,message:'Could not find the table public.exam_nodes in the schema cache. private_password=secret'});
  assert.equal(e.code,code);if(code==='PGRST205')assert.equal(e.status,503);
  assert.doesNotMatch(e.message,/migration has not|Apply backend|private_password|secret/i);
  assert.match(e.message,/schema|access|administrator/i);
 }
});
test('unexpected or permission failures are sanitized and never invoke legacy fallback',async()=>{
 for(const code of ['42501','08006','XX000','3F000','PGRST106','42883']){
  calls=[];respond=op=>({error:{code,message:'Could not find the table exam_categories; password=private-token',details:'sensitive',hint:'secret'}});
  await assert.rejects(bank.getClasses(),e=>e.code===code&&!/private-token|sensitive|secret|migration/i.test(e.message));
  assert.deepEqual(calls.map(x=>x.table),['exam_categories']);
 }
});
test('known missing hierarchy falls back to legacy class response',async()=>{
 respond=op=>op.table==='exam_categories'?{error:{code:'PGRST205',message:"Could not find the table 'public.exam_categories' in the schema cache"}}:{data:[{id:A,name:'Class 9',slug:'class-9',is_active:true,display_order:0}]};
 const response=await request('/self-exam/classes');assert.equal(response.status,200);assert.equal(response.body.classes[0].id,A);assert.equal(response.body.classes[0].kind,'category');
 assert.deepEqual(calls.map(x=>x.table),['exam_categories','question_bank_classes']);
});
test('legacy fallback supports missing node_id columns but not unrelated missing objects',async()=>{
 respond=op=>{if(op.table==='exam_nodes')return {error:{code:'42703',message:'column exam_nodes.node_id does not exist'}};return {data:[{id:A,name:'Chapter',subject_id:A,slug:'chapter',is_active:true}]};};
 const rows=await bank.getChaptersBySubject(A);assert.equal(rows[0].id,A);assert.equal(calls.at(-1).table,'question_bank_chapters');
 calls=[];respond=()=>({error:{code:'PGRST205',message:"Could not find the table 'public.unrelated' in the schema cache"}});
 await assert.rejects(bank.getClasses(),e=>e.code==='PGRST205');assert.deepEqual(calls.map(x=>x.table),['exam_categories']);
});
test('category/node responses retain shape and active filters',async()=>{
 respond=op=>({data:op.table==='exam_categories'?[{id:A,name:'Academic',slug:'academic',is_active:true}]:[{id:A,category_id:A,parent_id:null,name:'Class 9',type:'class',is_active:true}]});
 const categories=await request('/self-exam/categories');assert.equal(categories.status,200);assert.equal(categories.body.categories[0].name,'Academic');
 const nodes=await request('/self-exam/nodes?categoryId='+A);assert.equal(nodes.status,200);assert.equal(nodes.body.nodes[0].id,A);
 assert.ok(calls.every(x=>x.steps.some(([method,column,value])=>method==='eq'&&column==='is_active'&&value===true)));
});
test('missing/unauthorized category and node requests never reach Supabase',async()=>{
 for(const path of ['/self-exam/categories','/self-exam/nodes']){
  assert.equal((await request(path,{auth:false})).status,401);
  assert.equal((await request(path,{role:'TEACHER'})).status,403);
 }
 assert.equal(calls.length,0);
});
test('unavailable schema HTTP errors preserve code/message envelope without internal details',async()=>{
 respond=()=>({error:{code:'PGRST205',message:"Could not find the table 'public.exam_categories' in the schema cache; private-token",details:'private-user-answer'}});
 const r=await request('/self-exam/categories');assert.equal(r.status,503);assert.equal(r.body.code,'PGRST205');assert.deepEqual(Object.keys(r.body).sort(),['code','message']);
 assert.doesNotMatch(JSON.stringify(r.body),/private-token|private-user-answer|202609020001|migration has not/);
});
test('uncoded ambiguous messages do not imply migration or enable legacy fallback',async()=>{
 respond=()=>({error:{message:'Could not find the table lookup implementation: exam_categories'}});
 await assert.rejects(bank.getClasses(),e=>e.code==='SUPABASE_REQUEST_FAILED'&&e.status===500&&!/migration/i.test(e.message));
 assert.equal(calls.length,1);
});
test('unrelated missing audit table does not retry an administrative write against legacy schema',async()=>{
 respond=op=>{
  if(op.table==='exam_categories')return {data:{id:A,is_active:true}};
  if(op.table==='exam_nodes')return {data:{id:A,category_id:A,name:'Topic',type:'topic'}};
  if(op.table==='question_bank_admin_audit_logs')return {error:{code:'PGRST205',message:"Could not find the table 'public.question_bank_admin_audit_logs' in the schema cache"}};
  throw Error('Legacy mutation must not be attempted');
 };
 await assert.rejects(bank.createExamNode({categoryId:A,name:'Topic',type:'topic'},'admin'),e=>e.code==='PGRST205');
 assert.deepEqual(calls.map(x=>x.table),['exam_categories','exam_nodes','question_bank_admin_audit_logs']);
});
test('inspection package contains seven guarded read-only scripts (static review, no SQL execution)',async()=>{
 const fs=await import('node:fs');const dir=new URL('../docs/self-exam-phase3/sql/',import.meta.url);
 const names=fs.readdirSync(dir).filter(f=>/^[0-9]{2}-.*\.sql$/.test(f));assert.equal(names.length,7);
 for(const file of names){
  const sql=fs.readFileSync(new URL(file,dir),'utf8');
  const code=sql.replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''").trim();
  assert.match(code,/^BEGIN TRANSACTION READ ONLY;/);
  assert.doesNotMatch(code,/\b(CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|CALL|DO|COPY|GRANT|REVOKE|NOTIFY|REFRESH|SET)\b/i,file);
  assert.ok(code.split(';').map(s=>s.trim()).filter(Boolean).every(s=>/^(BEGIN TRANSACTION READ ONLY|WITH\b|SELECT\b|COMMIT\b)/i.test(s)),file);
 }
});
