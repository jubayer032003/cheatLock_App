// Prepared snapshot v1 implementation. Intentionally not imported by live routes.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function check(condition){if(!condition){const e=new Error('Self exam snapshot integrity validation failed.');e.code='SELF_EXAM_SNAPSHOT_INVALID';e.status=409;throw e;}}
function text(value){check(typeof value==='string'&&value.trim().length>0);return value;}
function freeze(value){Object.values(value).forEach(v=>{if(v&&typeof v==='object')freeze(v);});return Object.freeze(value);}
export function captureSnapshot(input){
 check(input&&input.schemaVersion===1&&UUID.test(input.sessionId)&&UUID.test(input.questionId));
 check(input.questionType==='mcq'&&['easy','medium','hard'].includes(input.difficulty));
 check(Number.isSafeInteger(input.displayOrder)&&input.displayOrder>0);
 const cents=Math.round(input.marks*100);
 check(typeof input.marks==='number'&&Number.isSafeInteger(cents)&&cents>0&&cents<=99999999&&Math.abs(input.marks*100-cents)<1e-7);
 check(typeof input.capturedAt==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(input.capturedAt)&&Number.isFinite(Date.parse(input.capturedAt))&&new Date(input.capturedAt).toISOString()===input.capturedAt);
 check(Array.isArray(input.options)&&input.options.length>=2&&input.options.length<=20);
 const ids=new Set(),orders=new Set();
 const options=input.options.map(o=>{
  check(o&&UUID.test(o.id)&&!ids.has(o.id)&&Number.isSafeInteger(o.displayOrder)&&o.displayOrder>=0&&!orders.has(o.displayOrder));ids.add(o.id);orders.add(o.displayOrder);
  return {id:o.id,text:text(o.text),displayOrder:o.displayOrder};
 }).sort((a,b)=>a.displayOrder-b.displayOrder);
 check(ids.has(input.correctOptionId));
 check(input.explanation==null||typeof input.explanation==='string');
 return freeze({schemaVersion:1,sessionId:input.sessionId,questionId:input.questionId,questionType:'mcq',questionText:text(input.questionText),difficulty:input.difficulty,displayOrder:input.displayOrder,marks:cents/100,options,correctOptionId:input.correctOptionId,explanation:input.explanation||'',capturedAt:input.capturedAt});
}
export function activeSnapshot(input){
 const s=captureSnapshot(input);
 // Explicit whitelist: grading key/metadata never enter active DTOs.
 return {id:s.questionId,questionType:s.questionType,questionText:s.questionText,difficulty:s.difficulty,marks:s.marks,displayOrder:s.displayOrder,options:s.options.map(o=>({...o}))};
}
export function gradeSnapshots(sessionId,inputs,answers){
 check(UUID.test(sessionId)&&Array.isArray(inputs)&&inputs.length>0&&Array.isArray(answers));
 const snapshots=inputs.map(captureSnapshot),byId=new Map(),orders=new Set(),byAnswer=new Map();
 for(const s of snapshots){check(s.sessionId===sessionId&&!byId.has(s.questionId)&&!orders.has(s.displayOrder));byId.set(s.questionId,s);orders.add(s.displayOrder);}
 for(const a of answers){check(a&&byId.has(a.questionId)&&!byAnswer.has(a.questionId));const s=byId.get(a.questionId);check(a.selectedOptionId==null||s.options.some(o=>o.id===a.selectedOptionId));byAnswer.set(a.questionId,a);}
 let scoreCents=0,totalCents=0,correctCount=0,incorrectCount=0;
 const grades=snapshots.map(s=>{const selected=byAnswer.get(s.questionId)?.selectedOptionId;const correct=Boolean(selected&&selected===s.correctOptionId);const cents=correct?Math.round(s.marks*100):0;scoreCents+=cents;totalCents+=Math.round(s.marks*100);if(correct)correctCount++;else if(selected)incorrectCount++;return {questionId:s.questionId,isCorrect:correct,marksAwarded:cents/100};});
 check(Number.isSafeInteger(scoreCents)&&Number.isSafeInteger(totalCents)&&totalCents<=99999999);
 return freeze({score:scoreCents/100,totalMarks:totalCents/100,percentage:Math.round(scoreCents/totalCents*100),correctCount,incorrectCount,unansweredCount:snapshots.length-correctCount-incorrectCount,grades});
}
