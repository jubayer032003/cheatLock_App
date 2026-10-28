const privateKeys = new Set([
  "correctanswer", "correctanswers", "correctoption", "correctoptionid", "correctoptionids",
  "correct", "iscorrect", "answerkey", "solution", "solutions", "solutionsteps", "teachernotes",
  "explanation", "rubric", "gradingrubric", "privatecases", "hiddentests", "hiddentestcases",
  "expectedanswer", "expectedoutput", "expectedresult",
]);
function publicContent(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(publicContent);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !privateKeys.has(key.toLowerCase()))
      .map(([key, item]) => [key, publicContent(item)]));
  }
  return value;
}
/** Teacher serialization stays intact; student prompts never need answer keys or classmate IDs. */
export function studentExamPayload(exam, studentId) {
  return {
    ...publicContent(exam),
    assignedStudents: exam.assignedStudents?.includes(studentId) ? [studentId] : [],
    communityStudents: [],
  };
}