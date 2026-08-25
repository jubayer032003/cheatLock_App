# Central Question Bank and Self Exam

CheatLock keeps the existing MongoDB/JWT authentication system. Supabase is used only as a PostgreSQL data store for central question-bank and self-exam data. Android, desktop, and browser clients must call the CheatLock backend; they must not receive the Supabase service-role key.

## Environment

Configure these in `backend/.env`:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` is backend-only. Do not add it to Vite, Android Gradle, Tauri, or public deployment settings. The Admin, Teacher, and Student clients call the authenticated Express API instead of using Supabase credentials directly.

## Migration

Apply the SQL migration in:

```text
backend/supabase/migrations/202608230001_question_bank_self_exam.sql
```

It creates classes, subjects, chapters, questions, options, tags, self-exam sessions, session questions, answers, indexes, audit logs, and service-role-only RLS policies.

## API Seed

After Supabase is configured, the backend is running, and an admin account exists, seed a small Class 9 Mathematics hierarchy through the authenticated Express API:

```powershell
$env:CHEATLOCK_SEED_API_BASE_URL="http://127.0.0.1:3000"
$env:CHEATLOCK_SEED_ADMIN_IDENTIFIER="admin@example.com"
$env:CHEATLOCK_SEED_ADMIN_PASSWORD="replace-with-admin-password"
node backend/scripts/seed-question-bank-api.mjs
```

The script uses `/auth/login`, `/question-bank/admin/classes`, `/question-bank/admin/subjects`, `/question-bank/admin/chapters`, and `/question-bank/questions`. It does not connect directly to Supabase.

## API Shape

Question Bank routes live under `/question-bank`.

Students use `/self-exam`.

Existing JWT roles remain authoritative:

```text
STUDENT -> self exam only
TEACHER -> browse active bank questions and copy snapshots into owned exams
SUPER_ADMIN / INSTITUTION_ADMIN / DEPARTMENT_ADMIN -> manage central bank content
```

## Security Notes

Self-exam payloads omit `isCorrect` while a session is active. Correct options and explanations are returned only through the result path after server-side submission has finalized the attempt.

The backend calculates score and expiration from server state. Clients cannot set score, owner, status, expiration, or correct answers.

Teacher question-bank imports copy a snapshot into the existing Mongo `Exam.questions` array. Later admin edits to a central question do not mutate already-created teacher exams.

## Deferred Client Work

The backend foundation is ready for:

```text
Android Self Exam setup, exam, result, and review screens
Teacher dashboard Question Bank browser and bulk select
Admin dashboard Question Bank management screens
```
