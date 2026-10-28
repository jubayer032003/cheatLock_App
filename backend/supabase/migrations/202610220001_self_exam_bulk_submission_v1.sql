-- Additive migration. Operator approval REQUIRED before production application.
-- Supports either historical class/subject schema or node hierarchy schema.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.question_bank_self_exam_sessions
  ADD COLUMN bulk_owner_account_id text,
  ADD COLUMN bulk_submission_id uuid,
  ADD COLUMN bulk_payload_hash text,
  ADD COLUMN bulk_final_result jsonb;
ALTER TABLE public.question_bank_self_exam_sessions
  ADD CONSTRAINT self_exam_bulk_owner_format CHECK (bulk_owner_account_id IS NULL OR bulk_owner_account_id ~ '^[a-f0-9]{24}$'),
  ADD CONSTRAINT self_exam_bulk_receipt_complete CHECK (
    (bulk_submission_id IS NULL AND bulk_payload_hash IS NULL AND bulk_final_result IS NULL) OR
    (bulk_submission_id IS NOT NULL AND bulk_payload_hash IS NOT NULL AND bulk_final_result IS NOT NULL AND bulk_owner_account_id IS NOT NULL AND status='submitted'));
ALTER TABLE public.question_bank_self_exam_sessions
  DROP CONSTRAINT question_bank_self_exam_sessions_question_count_check;
ALTER TABLE public.question_bank_self_exam_sessions
  ADD CONSTRAINT question_bank_self_exam_sessions_question_count_check CHECK (question_count BETWEEN 1 AND 500);
CREATE UNIQUE INDEX self_exam_bulk_identity ON public.question_bank_self_exam_sessions(bulk_owner_account_id,bulk_submission_id) WHERE bulk_submission_id IS NOT NULL;

-- Every writer (including old REST endpoints) takes the same parent lock.
-- Transition tables validate a set once, rather than querying its parent once per row.
CREATE FUNCTION public.self_exam_answer_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM s.id FROM public.question_bank_self_exam_sessions s WHERE s.id IN(SELECT session_id FROM old_answers) ORDER BY s.id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM old_answers a JOIN public.question_bank_self_exam_sessions s ON s.id=a.session_id
      WHERE s.status NOT IN('in_progress','expired')) THEN RAISE EXCEPTION 'BULK_SESSION_CLOSED'; END IF;
    IF EXISTS(SELECT 1 FROM old_answers a JOIN public.question_bank_self_exam_sessions s ON s.id=a.session_id
      WHERE s.status<>'in_progress' OR s.expires_at IS NULL OR clock_timestamp()>=s.expires_at) THEN RAISE EXCEPTION 'BULK_SESSION_EXPIRED'; END IF;
    RETURN NULL; -- missing parent is an authorized parent-delete cascade
  END IF;
  PERFORM s.id FROM public.question_bank_self_exam_sessions s WHERE s.id IN(SELECT session_id FROM new_answers) ORDER BY s.id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM new_answers a LEFT JOIN public.question_bank_self_exam_sessions s ON s.id=a.session_id
    WHERE s.id IS NULL OR s.status NOT IN('in_progress','expired')) THEN RAISE EXCEPTION 'BULK_SESSION_CLOSED'; END IF;
  IF TG_OP='INSERT' THEN
    IF EXISTS(SELECT 1 FROM new_answers a JOIN public.question_bank_self_exam_sessions s ON s.id=a.session_id
      WHERE s.status<>'in_progress' OR s.expires_at IS NULL OR clock_timestamp()>=s.expires_at) THEN RAISE EXCEPTION 'BULK_SESSION_EXPIRED'; END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM new_answers n LEFT JOIN old_answers o ON o.id=n.id
      WHERE o.id IS NULL OR n.session_id<>o.session_id OR n.question_id<>o.question_id) THEN RAISE EXCEPTION 'BULK_INVALID_ANSWER'; END IF;
    IF EXISTS(SELECT 1 FROM new_answers n JOIN old_answers o ON o.id=n.id JOIN public.question_bank_self_exam_sessions s ON s.id=n.session_id
      WHERE (n.selected_option_id IS DISTINCT FROM o.selected_option_id OR n.answer_text IS DISTINCT FROM o.answer_text OR n.answered_at IS DISTINCT FROM o.answered_at)
      AND (s.status<>'in_progress' OR s.expires_at IS NULL OR clock_timestamp()>=s.expires_at)) THEN RAISE EXCEPTION 'BULK_SESSION_EXPIRED'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM new_answers a LEFT JOIN public.question_bank_self_exam_session_questions m ON m.session_id=a.session_id AND m.question_id=a.question_id
    WHERE m.id IS NULL) THEN RAISE EXCEPTION 'BULK_QUESTION_UNAVAILABLE'; END IF;
  IF EXISTS(SELECT 1 FROM new_answers a LEFT JOIN public.question_bank_question_options o ON o.id=a.selected_option_id AND o.question_id=a.question_id
    WHERE a.selected_option_id IS NOT NULL AND o.id IS NULL) THEN RAISE EXCEPTION 'BULK_OPTION_UNAVAILABLE'; END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER self_exam_answer_insert_guard_v1 AFTER INSERT ON public.question_bank_self_exam_answers
REFERENCING NEW TABLE AS new_answers FOR EACH STATEMENT EXECUTE FUNCTION public.self_exam_answer_guard_v1();
CREATE TRIGGER self_exam_answer_update_guard_v1 AFTER UPDATE ON public.question_bank_self_exam_answers
REFERENCING NEW TABLE AS new_answers OLD TABLE AS old_answers FOR EACH STATEMENT EXECUTE FUNCTION public.self_exam_answer_guard_v1();
CREATE TRIGGER self_exam_answer_delete_guard_v1 AFTER DELETE ON public.question_bank_self_exam_answers
REFERENCING OLD TABLE AS old_answers FOR EACH STATEMENT EXECUTE FUNCTION public.self_exam_answer_guard_v1();

CREATE FUNCTION public.self_exam_final_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.status='submitted' AND (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN
    RAISE EXCEPTION 'BULK_SESSION_CLOSED';
  END IF;
  IF OLD.bulk_owner_account_id IS NOT NULL AND NEW.bulk_owner_account_id IS DISTINCT FROM OLD.bulk_owner_account_id THEN
    RAISE EXCEPTION 'BULK_OWNER_IMMUTABLE';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER self_exam_final_guard_v1 BEFORE UPDATE ON public.question_bank_self_exam_sessions
FOR EACH ROW EXECUTE FUNCTION public.self_exam_final_guard_v1();

CREATE FUNCTION public.self_exam_membership_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE st text;
BEGIN
  IF TG_OP='UPDATE' AND NEW.session_id<>OLD.session_id THEN RAISE EXCEPTION 'BULK_SESSION_CLOSED'; END IF;
  SELECT status INTO st FROM public.question_bank_self_exam_sessions
    WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.session_id ELSE NEW.session_id END FOR UPDATE;
  IF NOT FOUND AND TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF st IS DISTINCT FROM 'created' THEN RAISE EXCEPTION 'BULK_SESSION_CLOSED'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER self_exam_membership_guard_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.question_bank_self_exam_session_questions
FOR EACH ROW EXECUTE FUNCTION public.self_exam_membership_guard_v1();

CREATE FUNCTION public.self_exam_submit_bulk_v1(
  p_owner_account_id text, p_session_id uuid, p_submission_id uuid, p_answers jsonb, p_accept_new boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog SET statement_timeout='15s' SET lock_timeout='5s' AS $$
DECLARE
  s public.question_bank_self_exam_sessions%ROWTYPE;
  canonical jsonb; fingerprint text; question_data jsonb; result_data jsonb; stored jsonb;
  correct_count integer; wrong_count integer; score_value numeric; total_value numeric;
  started timestamptz:=clock_timestamp(); locked timestamptz; validated timestamptz; scored timestamptz; finalized timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'BULK_BACKEND_ONLY' USING ERRCODE='42501'; END IF;
  IF p_owner_account_id IS NULL OR p_owner_account_id !~ '^[a-f0-9]{24}$' OR p_submission_id IS NULL THEN RAISE EXCEPTION 'BULK_INVALID_REQUEST'; END IF;
  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' OR jsonb_array_length(p_answers) NOT BETWEEN 1 AND 500
    OR octet_length(p_answers::text)>131072 THEN RAISE EXCEPTION 'BULK_INVALID_REQUEST'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_answers) a WHERE jsonb_typeof(a) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(a))<>2
    OR NOT (a ? 'questionId' AND a ? 'selectedOptionId')
    OR jsonb_typeof(a->'questionId') IS DISTINCT FROM 'string'
    OR (a->>'questionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR (a->'selectedOptionId'<>'null'::jsonb AND (jsonb_typeof(a->'selectedOptionId') IS DISTINCT FROM 'string'
      OR (a->>'selectedOptionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')))
  THEN RAISE EXCEPTION 'BULK_INVALID_ANSWER'; END IF;
  IF (SELECT count(DISTINCT (a->>'questionId')::uuid) FROM jsonb_array_elements(p_answers) a)<>jsonb_array_length(p_answers) THEN RAISE EXCEPTION 'BULK_DUPLICATE_QUESTION'; END IF;
  SELECT jsonb_agg(jsonb_build_object('questionId',(a->>'questionId')::uuid,'selectedOptionId',(a->>'selectedOptionId')::uuid) ORDER BY (a->>'questionId')::uuid)
    INTO canonical FROM jsonb_array_elements(p_answers) a;
  fingerprint:=encode(sha256(convert_to(canonical::text,'UTF8')),'hex');
  SELECT * INTO s FROM public.question_bank_self_exam_sessions WHERE id=p_session_id AND bulk_owner_account_id=p_owner_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BULK_SESSION_UNAVAILABLE'; END IF;
  locked:=clock_timestamp();
  IF s.status='submitted' THEN
    IF s.bulk_submission_id IS DISTINCT FROM p_submission_id THEN RAISE EXCEPTION 'BULK_ALREADY_SUBMITTED'; END IF;
    IF s.bulk_payload_hash IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'BULK_PAYLOAD_CONFLICT'; END IF;
    RETURN jsonb_build_object('canonical',s.bulk_final_result,'replayed',true,'submissionId',s.bulk_submission_id);
  END IF;
  IF p_accept_new IS DISTINCT FROM true THEN RAISE EXCEPTION 'BULK_DISABLED'; END IF;
  IF s.status NOT IN ('in_progress','expired') OR s.expires_at IS NULL THEN RAISE EXCEPTION 'BULK_SESSION_CLOSED'; END IF;
  IF jsonb_array_length(canonical)<>s.question_count OR
    (SELECT count(*) FROM public.question_bank_self_exam_session_questions WHERE session_id=s.id)<>s.question_count THEN RAISE EXCEPTION 'BULK_SNAPSHOT_INCOMPLETE'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(canonical) a LEFT JOIN public.question_bank_self_exam_session_questions m
    ON m.session_id=s.id AND m.question_id=(a->>'questionId')::uuid WHERE m.id IS NULL) THEN RAISE EXCEPTION 'BULK_QUESTION_UNAVAILABLE'; END IF;
  IF EXISTS(SELECT 1 FROM public.question_bank_self_exam_answers a LEFT JOIN public.question_bank_self_exam_session_questions m
    ON m.session_id=a.session_id AND m.question_id=a.question_id WHERE a.session_id=s.id AND m.id IS NULL) THEN RAISE EXCEPTION 'BULK_QUESTION_UNAVAILABLE'; END IF;
  -- Capture one consistent statement snapshot of content and answer keys. The canonical result is retained forever after commit.
  SELECT jsonb_agg(jsonb_build_object(
    'id',q.id,'nodeId',to_jsonb(q)->>'node_id','classId',coalesce(to_jsonb(q)->>'class_id',to_jsonb(s)->>'class_id',to_jsonb(q)->>'node_id',''),
    'subjectId',coalesce(to_jsonb(q)->>'subject_id',to_jsonb(s)->>'subject_id',to_jsonb(q)->>'node_id',''),
    'chapterId',coalesce(to_jsonb(q)->>'chapter_id',to_jsonb(q)->>'node_id'),'questionType',q.question_type,'questionText',q.question_text,
    'difficulty',q.difficulty,'marks',m.marks,'explanation',coalesce(q.explanation,''),'source',coalesce(q.source,''),
    'status',q.status,'createdAt',q.created_at,'updatedAt',q.updated_at,'displayOrder',m.display_order,'options',
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'text',o.option_text,'isCorrect',o.is_correct,'displayOrder',o.display_order) ORDER BY o.display_order,o.id),'[]'::jsonb)
       FROM public.question_bank_question_options o WHERE o.question_id=q.id)) ORDER BY m.display_order)
    INTO question_data FROM public.question_bank_self_exam_session_questions m JOIN public.question_bank_questions q ON q.id=m.question_id WHERE m.session_id=s.id;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(question_data) q WHERE q->>'questionType'<>'mcq' OR (q->>'marks')::numeric<=0
    OR (SELECT count(*) FROM jsonb_array_elements(q->'options') o WHERE (o->>'isCorrect')::boolean)<>1) THEN RAISE EXCEPTION 'BULK_QUESTION_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(canonical) a JOIN jsonb_array_elements(question_data) q ON a->>'questionId'=q->>'id'
    WHERE a->'selectedOptionId'<>'null'::jsonb AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(q->'options') o WHERE o->>'id'=a->>'selectedOptionId')) THEN RAISE EXCEPTION 'BULK_OPTION_UNAVAILABLE'; END IF;
  IF s.status='expired' OR clock_timestamp()>=s.expires_at THEN
    -- Preserve expired saved-answer finalization without allowing late new selections.
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(canonical) a LEFT JOIN public.question_bank_self_exam_answers old
      ON old.session_id=s.id AND old.question_id=(a->>'questionId')::uuid
      WHERE old.selected_option_id IS DISTINCT FROM (a->>'selectedOptionId')::uuid OR coalesce(old.answer_text,'')<>'') THEN RAISE EXCEPTION 'BULK_SESSION_EXPIRED'; END IF;
  ELSE
    INSERT INTO public.question_bank_self_exam_answers(session_id,question_id,selected_option_id,answer_text,answered_at,updated_at)
      SELECT s.id,(a->>'questionId')::uuid,(a->>'selectedOptionId')::uuid,NULL,clock_timestamp(),clock_timestamp() FROM jsonb_array_elements(canonical) a
      ON CONFLICT(session_id,question_id) DO UPDATE SET selected_option_id=EXCLUDED.selected_option_id,answer_text=NULL,answered_at=EXCLUDED.answered_at,updated_at=EXCLUDED.updated_at;
  END IF;
  validated:=clock_timestamp();
  WITH grades AS (
    SELECT (q->>'id')::uuid id,(q->>'marks')::numeric marks,
      coalesce((a->>'selectedOptionId')=(SELECT o->>'id' FROM jsonb_array_elements(q->'options') o WHERE (o->>'isCorrect')::boolean),false) correct,
      a->>'selectedOptionId' chosen
    FROM jsonb_array_elements(question_data) q JOIN jsonb_array_elements(canonical) a ON a->>'questionId'=q->>'id'
  ) SELECT coalesce(sum(CASE WHEN correct THEN marks ELSE 0 END),0),sum(marks),count(*) FILTER(WHERE correct),count(*) FILTER(WHERE chosen IS NOT NULL AND NOT correct)
    INTO score_value,total_value,correct_count,wrong_count FROM grades;
  IF total_value IS NULL OR total_value<=0 OR total_value>999999.99 THEN RAISE EXCEPTION 'BULK_QUESTION_INVALID'; END IF;
  UPDATE public.question_bank_self_exam_answers a SET
    is_correct=coalesce(a.selected_option_id::text=(SELECT o->>'id' FROM jsonb_array_elements(q->'options') o WHERE (o->>'isCorrect')::boolean),false),
    marks_awarded=CASE WHEN a.selected_option_id::text=(SELECT o->>'id' FROM jsonb_array_elements(q->'options') o WHERE (o->>'isCorrect')::boolean) THEN (q->>'marks')::numeric ELSE 0 END,updated_at=clock_timestamp()
    FROM jsonb_array_elements(question_data) q WHERE a.session_id=s.id AND a.question_id::text=q->>'id';
  scored:=clock_timestamp();
  s.status:='submitted'; s.submitted_at:=scored; s.score:=score_value; s.total_marks:=total_value; s.updated_at:=scored;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'sessionId',a.session_id,'questionId',a.question_id,'selectedOptionId',a.selected_option_id,
    'answerText',coalesce(a.answer_text,''),'isCorrect',a.is_correct,'marksAwarded',a.marks_awarded,'answeredAt',a.answered_at,'updatedAt',a.updated_at) ORDER BY a.question_id),'[]'::jsonb)
    INTO stored FROM public.question_bank_self_exam_answers a WHERE a.session_id=s.id;
  result_data:=jsonb_build_object('session',jsonb_build_object('id',s.id,'studentId',s.student_id,'bulkSubmissionVersion',1,
    'nodeId',coalesce(to_jsonb(s)->>'node_id',to_jsonb(s)->>'chapter_id',to_jsonb(s)->>'subject_id',to_jsonb(s)->>'class_id'),
    'classId',coalesce(to_jsonb(s)->>'class_id',to_jsonb(s)->>'node_id',''),'subjectId',coalesce(to_jsonb(s)->>'subject_id',to_jsonb(s)->>'node_id',''),
    'chapterId',to_jsonb(s)->>'chapter_id','durationMinutes',s.duration_minutes,'questionCount',s.question_count,'difficultyMode',s.difficulty_mode,
    'status',s.status,'startedAt',s.started_at,'expiresAt',s.expires_at,'submittedAt',s.submitted_at,'score',score_value,'totalMarks',total_value,'createdAt',s.created_at,'updatedAt',s.updated_at),
    'questions',question_data,'answers',stored,'serverTime',scored,'result',jsonb_build_object('score',score_value,'totalMarks',total_value,
    'percentage',round(score_value/total_value*100),'correctCount',correct_count,'incorrectCount',wrong_count,'unansweredCount',s.question_count-correct_count-wrong_count));
  UPDATE public.question_bank_self_exam_sessions SET status='submitted',submitted_at=scored,score=score_value,total_marks=total_value,updated_at=scored,
    bulk_submission_id=p_submission_id,bulk_payload_hash=fingerprint,bulk_final_result=result_data WHERE id=s.id;
  finalized:=clock_timestamp();
  RETURN jsonb_build_object('canonical',result_data,'submissionId',p_submission_id,'replayed',false,'timing',jsonb_build_object(
    'lockMs',extract(epoch FROM locked-started)*1000,'validationAndSaveMs',extract(epoch FROM validated-locked)*1000,
    'scoringMs',extract(epoch FROM scored-validated)*1000,'resultMs',extract(epoch FROM finalized-scored)*1000,'transactionMs',extract(epoch FROM finalized-started)*1000));
END; $$;

CREATE FUNCTION public.self_exam_bulk_status_v1(p_owner_account_id text,p_session_id uuid,p_submission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE s public.question_bank_self_exam_sessions%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'BULK_BACKEND_ONLY' USING ERRCODE='42501'; END IF;
  SELECT * INTO s FROM public.question_bank_self_exam_sessions WHERE id=p_session_id AND bulk_owner_account_id=p_owner_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BULK_SESSION_UNAVAILABLE'; END IF;
  IF s.status='submitted' AND s.bulk_final_result IS NOT NULL THEN
    RETURN jsonb_build_object('state',CASE WHEN s.bulk_submission_id=p_submission_id THEN 'committed' ELSE 'finalized_other' END,'canonical',s.bulk_final_result);
  END IF;
  IF s.status='submitted' THEN RETURN jsonb_build_object('state','finalized_legacy','canonical',NULL); END IF;
  RETURN jsonb_build_object('state','pending','canonical',NULL);
END; $$;

REVOKE ALL ON FUNCTION public.self_exam_submit_bulk_v1(text,uuid,uuid,jsonb,boolean),public.self_exam_bulk_status_v1(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.self_exam_submit_bulk_v1(text,uuid,uuid,jsonb,boolean),public.self_exam_bulk_status_v1(text,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.self_exam_answer_guard_v1(),public.self_exam_final_guard_v1(),public.self_exam_membership_guard_v1() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
