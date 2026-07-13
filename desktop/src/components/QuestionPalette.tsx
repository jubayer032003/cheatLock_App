import { Card } from "./Card";

interface QuestionPaletteProps {
  totalQuestions: number;
  currentIndex: number;
  answers: Record<number, string>;
  markedQuestions: number[];
  onSelect: (index: number) => void;
}

export function QuestionPalette({
  totalQuestions,
  currentIndex,
  answers,
  markedQuestions,
  onSelect,
}: QuestionPaletteProps) {
  // Compute counts
  const answeredCount = Object.keys(answers).filter(
    (key) => answers[Number(key)] && answers[Number(key)].trim() !== ""
  ).length;
  const markedCount = markedQuestions.length;
  const unansweredCount = totalQuestions - answeredCount;

  return (
    <Card className="flex flex-col gap-4 h-full border-border max-h-[500px] bg-surface-raised">
      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider border-b border-border pb-2">
        Question Navigator
      </h4>

      {/* Tallies */}
      <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-sans select-none">
        <div className="bg-success/5 border border-success/15 text-success p-2 rounded-md">
          <span className="block text-sm font-semibold font-mono">{answeredCount}</span>
          <span className="text-[10px] text-zinc-500 font-medium">Answered</span>
        </div>
        <div className="bg-warning/5 border border-warning/15 text-warning p-2 rounded-md">
          <span className="block text-sm font-semibold font-mono">{markedCount}</span>
          <span className="text-[10px] text-zinc-500 font-medium">Marked</span>
        </div>
        <div className="bg-zinc-800/10 border border-border text-zinc-400 p-2 rounded-md">
          <span className="block text-sm font-semibold font-mono">{unansweredCount}</span>
          <span className="text-[10px] text-zinc-500 font-medium">Remaining</span>
        </div>
      </div>

      {/* Palette Grid Container */}
      <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-5 gap-2 max-h-[300px]">
        {Array.from({ length: totalQuestions }).map((_, idx) => {
          const isCurrent = idx === currentIndex;
          const isMarked = markedQuestions.includes(idx);
          const isAnswered = answers[idx] !== undefined && answers[idx].trim() !== "";

          let bgClass = "bg-surface-base hover:bg-surface-overlay text-zinc-400 border-border";
          if (isAnswered) {
            bgClass = "bg-success/10 hover:bg-success/20 text-success border-success/20";
          }
          if (isMarked) {
            bgClass = "bg-warning/10 hover:bg-warning/20 text-warning border-warning/20";
          }
          if (isCurrent) {
            bgClass = "bg-accent hover:bg-accent-hover text-white border-accent shadow-sm";
          }

          return (
            <button
              key={idx}
              onClick={() => onSelect(idx)}
              className={`h-9 w-full rounded-md font-mono text-xs font-semibold flex items-center justify-center border transition-all duration-150 ${bgClass}`}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
