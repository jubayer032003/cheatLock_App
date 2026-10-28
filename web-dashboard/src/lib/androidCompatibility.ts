/** Match the student Android MCQ/CQ renderer; do not silently change answer semantics. */
export function androidUnsupportedQuestions(questions: ReadonlyArray<{ type?: string | null }>): number[] {
  return questions.flatMap((question, index) => question.type === "MCQ" || question.type === "CQ" ? [] : [index + 1]);
}