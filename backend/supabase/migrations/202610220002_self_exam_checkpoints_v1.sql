-- Local/test only; requires Phase 1. Operator approval required for deployment.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.question_bank_self_exam_sessions
 ADD COLUMN checkpoint_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN checkpoint_revision bigint NOT NULL DEFAULT 0 CHECK(checkpoint_revision BETWEEN 0 AND 9007199254740989),
 ADD COLUMN checkpoint_mutation_id uuid,
 ADD COLUMN checkpoint_hash text,
 ADD COLUMN expiry_submission_id uuid,
 ADD COLUMN expiry_retry_after timestamptz;
ALTER TABLE public.question_bank_self_exam_sessions ALTER COLUMN expiry_submission_id SET DEFAULT gen_random_uuid();
ALTER TABLE public.question_bank_self_exam_sessions ADD CONSTRAINT checkpoint_requires_owner CHECK(NOT checkpoint_enabled OR (bulk_owner_account_id IS NOT NULL AND expiry_submission_id IS NOT NULL));
CREATE INDEX self_exam_expiry_due_v1 ON public.question_bank_self_exam_sessions(expires_at,id)
 WHERE checkpoint_enabled AND status IN('in_progress','expired');

-- Commit processing is the acceptance linearization point, not HTTP/device time.
CREATE FUNCTION public.self_exam_checkpoint_commit_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE s public.question_bank_self_exam_sessions%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='question_bank_self_exam_sessions' THEN
  IF NOT NEW.checkpoint_enabled OR NEW.checkpoint_revision=OLD.checkpoint_revision THEN RETURN NULL; END IF;
  IF clock_timestamp()>=NEW.expires_at THEN RAISE EXCEPTION 'BULK_SESSION_EXPIRED'; END IF;
 ELSE
  IF TG_OP='UPDATE' AND NEW.selected_option_id IS NOT DISTINCT FROM OLD.selected_option_id AND NEW.answer_text IS NOT DISTINCT FROM OLD.answer_text THEN RETURN NULL; END IF;
  SELECT * INTO s FROM public.question_bank_self_exam_sessions WHERE id=NEW.session_id;
  IF s.checkpoint_enabled AND clock_timestamp()>=s.expires_at THEN RAISE EXCEPTION 'BULK_SESSION_EXPIRED'; END IF;
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER self_exam_checkpoint_commit_v1 AFTER UPDATE ON public.question_bank_self_exam_sessions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.self_exam_checkpoint_commit_guard_v1();
CREATE CONSTRAINT TRIGGER self_exam_selection_commit_v1 AFTER INSERT OR UPDATE ON public.question_bank_self_exam_answers
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.self_exam_checkpoint_commit_guard_v1();

-- Prevent old unversioned writers from bypassing the checkpoint revision contract.
CREATE FUNCTION public.self_exam_checkpoint_write_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE enabled boolean;
BEGIN
 IF TG_OP='UPDATE' AND NEW.selected_option_id IS NOT DISTINCT FROM OLD.selected_option_id AND NEW.answer_text IS NOT DISTINCT FROM OLD.answer_text THEN RETURN NEW; END IF;
 SELECT checkpoint_enabled INTO enabled FROM public.question_bank_self_exam_sessions WHERE id=NEW.session_id FOR UPDATE;
 IF enabled AND current_setting('cheatlock.checkpoint_write',true) IS DISTINCT FROM NEW.session_id::text THEN RAISE EXCEPTION 'CHECKPOINT_REQUIRED'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER self_exam_checkpoint_write_v1 BEFORE INSERT OR UPDATE ON public.question_bank_self_exam_answers
 FOR EACH ROW EXECUTE FUNCTION public.self_exam_checkpoint_write_guard_v1();

CREATE FUNCTION public.self_exam_checkpoint_state_v1(p_owner_account_id text,p_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog SET statement_timeout='15s' SET lock_timeout='5s' AS $$
DECLARE s public.question_bank_self_exam_sessions%ROWTYPE; a jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'BULK_BACKEND_ONLY' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.question_bank_self_exam_sessions WHERE id=p_session_id AND bulk_owner_account_id=p_owner_account_id FOR UPDATE;
 IF NOT FOUND OR NOT s.checkpoint_enabled THEN RAISE EXCEPTION 'BULK_SESSION_UNAVAILABLE'; END IF;
 IF s.status IN('in_progress','expired') AND clock_timestamp()>=s.expires_at THEN
  PERFORM public.self_exam_finalize_expired_v1(p_owner_account_id,p_session_id);
  SELECT * INTO s FROM public.question_bank_self_exam_sessions WHERE id=p_session_id;
 END IF;
 SELECT jsonb_agg(jsonb_build_object('questionId',m.question_id,'selectedOptionId',x.selected_option_id) ORDER BY m.question_id) INTO a
 FROM public.question_bank_self_exam_session_questions m LEFT JOIN public.question_bank_self_exam_answers x ON x.session_id=m.session_id AND x.question_id=m.question_id WHERE m.session_id=s.id;
 RETURN jsonb_build_object('revision',s.checkpoint_revision,'mutationId',s.checkpoint_mutation_id,'answers',coalesce(a,'[]'::jsonb),
  'serverTime',clock_timestamp(),'expiresAt',s.expires_at,'status',s.status,'result',s.bulk_final_result);
END; $$;

CREATE FUNCTION public.self_exam_checkpoint_v1(p_owner_account_id text,p_session_id uuid,p_mutation_id uuid,p_expected_revision bigint,p_answers jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog SET statement_timeout='15s' SET lock_timeout='5s' AS $$
DECLARE s public.question_bank_self_exam_sessions%ROWTYPE; canonical jsonb; fingerprint text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'BULK_BACKEND_ONLY' USING ERRCODE='42501'; END IF;
 IF p_mutation_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740988 THEN RAISE EXCEPTION 'BULK_INVALID_REQUEST'; END IF;
 IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' OR jsonb_array_length(p_answers) NOT BETWEEN 1 AND 500 OR octet_length(p_answers::text)>131072 THEN RAISE EXCEPTION 'BULK_INVALID_REQUEST'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_answers) a WHERE jsonb_typeof(a) IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(a))<>2 OR NOT(a ? 'questionId' AND a ? 'selectedOptionId')
  OR jsonb_typeof(a->'questionId') IS DISTINCT FROM 'string'
  OR (a->>'questionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR (a->'selectedOptionId'<>'null'::jsonb AND (jsonb_typeof(a->'selectedOptionId') IS DISTINCT FROM 'string'
  OR (a->>'selectedOptionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')))
 THEN RAISE EXCEPTION 'BULK_INVALID_ANSWER'; END IF;
 IF (SELECT count(DISTINCT (a->>'questionId')::uuid) FROM jsonb_array_elements(p_answers) a)<>jsonb_array_length(p_answers) THEN RAISE EXCEPTION 'BULK_DUPLICATE_QUESTION'; END IF;
 SELECT jsonb_agg(jsonb_build_object('questionId',(a->>'questionId')::uuid,'selectedOptionId',(a->>'selectedOptionId')::uuid) ORDER BY (a->>'questionId')::uuid) INTO canonical FROM jsonb_array_elements(p_answers) a;
 fingerprint:=encode(sha256(convert_to(canonical::text,'UTF8')),'hex');
 SELECT * INTO s FROM public.question_bank_self_exam_sessions WHERE id=p_session_id AND bulk_owner_account_id=p_owner_account_id FOR UPDATE;
 IF NOT FOUND OR NOT s.checkpoint_enabled THEN RAISE EXCEPTION 'BULK_SESSION_UNAVAILABLE'; END IF;
 IF s.checkpoint_mutation_id=p_mutation_id THEN
  IF s.checkpoint_hash<>fingerprint OR s.checkpoint_revision<>p_expected_revision+1 THEN RAISE EXCEPTION 'BULK_PAYLOAD_CONFLICT'; END IF;
  RETURN public.self_exam_checkpoint_state_v1(p_owner_account_id,p_session_id);
 END IF;
 IF s.status<>'in_progress' OR s.expires_at IS NULL OR clock_timestamp()>=s.expires_at THEN RAISE EXCEPTION 'BULK_SESSION_EXPIRED'; END IF;
 IF s.checkpoint_revision<>p_expected_revision THEN RAISE EXCEPTION 'CHECKPOINT_CONFLICT'; END IF;
 IF jsonb_array_length(canonical)<>s.question_count OR (SELECT count(*) FROM public.question_bank_self_exam_session_questions WHERE session_id=s.id)<>s.question_count OR EXISTS(SELECT 1 FROM jsonb_array_elements(canonical) a
  LEFT JOIN public.question_bank_self_exam_session_questions m ON m.session_id=s.id AND m.question_id=(a->>'questionId')::uuid WHERE m.id IS NULL)
 THEN RAISE EXCEPTION 'BULK_SNAPSHOT_INCOMPLETE'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(canonical) a LEFT JOIN public.question_bank_question_options o
  ON o.id=(a->>'selectedOptionId')::uuid AND o.question_id=(a->>'questionId')::uuid WHERE a->'selectedOptionId'<>'null'::jsonb AND o.id IS NULL)
 THEN RAISE EXCEPTION 'BULK_OPTION_UNAVAILABLE'; END IF;
 PERFORM set_config('cheatlock.checkpoint_write',s.id::text,true);
 INSERT INTO public.question_bank_self_exam_answers(session_id,question_id,selected_option_id,answer_text,answered_at,updated_at)
 SELECT s.id,(a->>'questionId')::uuid,(a->>'selectedOptionId')::uuid,NULL,clock_timestamp(),clock_timestamp() FROM jsonb_array_elements(canonical) a
 ON CONFLICT(session_id,question_id) DO UPDATE SET selected_option_id=EXCLUDED.selected_option_id,answer_text=NULL,answered_at=EXCLUDED.answered_at,updated_at=EXCLUDED.updated_at;
 UPDATE public.question_bank_self_exam_sessions SET checkpoint_revision=checkpoint_revision+1,checkpoint_mutation_id=p_mutation_id,checkpoint_hash=fingerprint WHERE id=s.id;
 RETURN public.self_exam_checkpoint_state_v1(p_owner_account_id,p_session_id);
END; $$;

ALTER FUNCTION public.self_exam_submit_bulk_v1(text,uuid,uuid,jsonb,boolean) RENAME TO self_exam_submit_bulk_core_v1;
CREATE FUNCTION public.self_exam_finalize_expired_v1(p_owner_account_id text,p_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog SET statement_timeout='15s' SET lock_timeout='5s' AS $$
DECLARE s public.question_bank_self_exam_sessions%ROWTYPE; a jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'BULK_BACKEND_ONLY' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.question_bank_self_exam_sessions WHERE id=p_session_id AND bulk_owner_account_id=p_owner_account_id FOR UPDATE;
 IF NOT FOUND OR NOT s.checkpoint_enabled THEN RAISE EXCEPTION 'BULK_SESSION_UNAVAILABLE'; END IF;
 IF s.status='submitted' THEN RETURN jsonb_build_object('canonical',s.bulk_final_result,'submissionId',s.bulk_submission_id,'replayed',true); END IF;
 IF s.status NOT IN('in_progress','expired') OR s.expires_at IS NULL OR clock_timestamp()<s.expires_at THEN RAISE EXCEPTION 'CHECKPOINT_NOT_DUE'; END IF;
 SELECT jsonb_agg(jsonb_build_object('questionId',m.question_id,'selectedOptionId',x.selected_option_id) ORDER BY m.question_id) INTO a
 FROM public.question_bank_self_exam_session_questions m LEFT JOIN public.question_bank_self_exam_answers x ON x.session_id=m.session_id AND x.question_id=m.question_id WHERE m.session_id=s.id;
 RETURN public.self_exam_submit_bulk_core_v1(p_owner_account_id,s.id,s.expiry_submission_id,a,true);
END; $$;
CREATE FUNCTION public.self_exam_submit_bulk_v1(p_owner_account_id text,p_session_id uuid,p_submission_id uuid,p_answers jsonb,p_accept_new boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog SET statement_timeout='15s' SET lock_timeout='5s' AS $$
DECLARE s public.question_bank_self_exam_sessions%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'BULK_BACKEND_ONLY' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.question_bank_self_exam_sessions WHERE id=p_session_id AND bulk_owner_account_id=p_owner_account_id FOR UPDATE;
 IF s.checkpoint_enabled THEN
  IF s.status<>'submitted' AND clock_timestamp()>=s.expires_at THEN RETURN public.self_exam_finalize_expired_v1(p_owner_account_id,p_session_id); END IF;
  PERFORM set_config('cheatlock.checkpoint_write',s.id::text,true);
 END IF;
 RETURN public.self_exam_submit_bulk_core_v1(p_owner_account_id,p_session_id,p_submission_id,p_answers,p_accept_new);
END; $$;
CREATE FUNCTION public.self_exam_expiry_sweep_v1(p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog SET statement_timeout='25s' SET lock_timeout='2s' AS $$
DECLARE s record; done integer:=0; failed integer:=0;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'BULK_BACKEND_ONLY' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'BULK_INVALID_REQUEST'; END IF;
 FOR s IN SELECT id,bulk_owner_account_id FROM public.question_bank_self_exam_sessions
  WHERE checkpoint_enabled AND status IN('in_progress','expired') AND expires_at<=clock_timestamp()
   AND (expiry_retry_after IS NULL OR expiry_retry_after<=clock_timestamp())
  ORDER BY expires_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
  BEGIN
   PERFORM public.self_exam_finalize_expired_v1(s.bulk_owner_account_id,s.id);done:=done+1;
  EXCEPTION WHEN OTHERS THEN
   failed:=failed+1;
   UPDATE public.question_bank_self_exam_sessions SET expiry_retry_after=clock_timestamp()+interval '60 seconds' WHERE id=s.id;
  END;
 END LOOP;
 RETURN jsonb_build_object('finalized',done,'failed',failed);
END; $$;
REVOKE ALL ON FUNCTION public.self_exam_checkpoint_state_v1(text,uuid),public.self_exam_checkpoint_v1(text,uuid,uuid,bigint,jsonb),
 public.self_exam_finalize_expired_v1(text,uuid),public.self_exam_submit_bulk_v1(text,uuid,uuid,jsonb,boolean),public.self_exam_expiry_sweep_v1(integer),
 public.self_exam_checkpoint_commit_guard_v1(),public.self_exam_checkpoint_write_guard_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.self_exam_checkpoint_state_v1(text,uuid),public.self_exam_checkpoint_v1(text,uuid,uuid,bigint,jsonb),
 public.self_exam_finalize_expired_v1(text,uuid),public.self_exam_submit_bulk_v1(text,uuid,uuid,jsonb,boolean),public.self_exam_expiry_sweep_v1(integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
