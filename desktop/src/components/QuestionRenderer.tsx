import type { ExamQuestion } from "../types";

interface QuestionRendererProps {
  question: ExamQuestion;
  value: string;
  onChange: (value: string) => void;
}

type RenderableQuestion =
  | (ExamQuestion & { type: "MCQ"; options: string[] })
  | (ExamQuestion & { type: "CQ" });

export function QuestionRenderer({ question, value, onChange }: QuestionRendererProps) {
  const renderable = toRenderableQuestion(question);

  return (
    <div className="flex w-full flex-col gap-5">
      <QuestionPrompt text={renderable.text} />
      {renderable.type === "MCQ" ? (
        <McqQuestionRenderer question={renderable} value={value} onChange={onChange} />
      ) : (
        <WrittenQuestionRenderer value={value} onChange={onChange} />
      )}
    </div>
  );
}

function McqQuestionRenderer({
  question,
  value,
  onChange,
}: {
  question: RenderableQuestion & { type: "MCQ" };
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="flex max-w-3xl flex-col gap-2.5">
      <legend className="sr-only">Select one answer</legend>
      {question.options.map((option, index) => {
        const selected = value === option;
        return (
          <button
            type="button"
            key={`${option}-${index}`}
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={`flex min-h-12 items-center gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base ${
              selected
                ? "border-accent bg-accent/10 text-zinc-50"
                : "border-border bg-surface-base text-zinc-300 hover:border-border-emphasis"
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                selected ? "border-accent bg-accent text-white" : "border-zinc-600 text-zinc-500"
              }`}
            >
              {String.fromCharCode(65 + index)}
            </span>
            <span>{option}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

function WrittenQuestionRenderer({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex max-w-4xl flex-col gap-2">
      <label htmlFor="written-answer" className="sr-only">
        Written answer
      </label>
      <textarea
        id="written-answer"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Type your answer here."
        className="min-h-72 w-full resize-y rounded-md border border-border bg-surface-base p-4 text-sm leading-6 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <div className="text-right text-xs text-zinc-500">
        {value.trim() ? value.trim().split(/\s+/).length : 0} words
      </div>
    </div>
  );
}

function QuestionPrompt({ text }: { text: string }) {
  const { cleanText, imageUrl } = extractPromptMedia(text);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold leading-7 text-zinc-50">{cleanText}</h2>
      {imageUrl && (
        <div className="flex max-w-xl items-center justify-center overflow-hidden rounded-md border border-border bg-surface-base p-2">
          <img src={imageUrl} alt="Question reference" className="max-h-72 rounded object-contain" />
        </div>
      )}
    </div>
  );
}

function toRenderableQuestion(question: ExamQuestion): RenderableQuestion {
  if (question.type === "MCQ") {
    return {
      ...question,
      options: Array.isArray(question.options) ? question.options.filter((option) => option.trim()) : [],
    };
  }
  return question;
}

function extractPromptMedia(text: string) {
  const imageRegex = /!\[.*?\]\((.*?)\)|\[img:(.*?)\]/;
  const imageMatch = text.match(imageRegex);
  return {
    imageUrl: imageMatch ? imageMatch[1] || imageMatch[2] : null,
    cleanText: text.replace(imageRegex, "").trim(),
  };
}
