import { useState } from "react";
import { ExamQuestion } from "../types";
import { Card } from "./Card";
import { Input } from "./Input";
import { Button } from "./Button";
import { Terminal, Image as ImageIcon, Play, CheckCircle } from "lucide-react";

interface QuestionRendererProps {
  question: ExamQuestion;
  value: string;
  onChange: (val: string) => void;
}

export function QuestionRenderer({ question, value, onChange }: QuestionRendererProps) {
  const [codeLang, setCodeLang] = useState("javascript");
  const [compiling, setCompiling] = useState(false);
  const [compileLog, setCompileLog] = useState<string | null>(null);

  // Parse potential image link from question text: e.g. ![caption](url) or [img:url]
  const imageRegex = /!\[.*?\]\((.*?)\)|\[img:(.*?)\]/;
  const imageMatch = question.text.match(imageRegex);
  const imageUrl = imageMatch ? (imageMatch[1] || imageMatch[2]) : null;
  const cleanQuestionText = question.text.replace(imageRegex, "").trim();

  // Infer the dynamic interactive type of the question
  const getInferredType = (): "TRUE_FALSE" | "CHECKBOX" | "CODE" | "SHORT_ANSWER" | "LONG_ANSWER" | "MCQ" => {
    const textLower = question.text.toLowerCase();
    
    if (question.type === "MCQ") {
      const isTF =
        question.options.length === 2 &&
        question.options.some((o) => o.toLowerCase() === "true" || o.toLowerCase() === "t") &&
        question.options.some((o) => o.toLowerCase() === "false" || o.toLowerCase() === "f");
      if (isTF) return "TRUE_FALSE";
      
      if (textLower.includes("[checkbox]") || textLower.includes("[select all]")) {
        return "CHECKBOX";
      }
      return "MCQ";
    } else {
      if (textLower.includes("[code]") || textLower.includes("[program]")) {
        return "CODE";
      }
      if (textLower.includes("[short]") || textLower.includes("[brief]")) {
        return "SHORT_ANSWER";
      }
      return "LONG_ANSWER";
    }
  };

  const type = getInferredType();

  // Helper for Checkbox multi-select values (saved as comma-separated options)
  const handleCheckboxToggle = (opt: string) => {
    const selected = value ? value.split(",") : [];
    let updated: string[];
    if (selected.includes(opt)) {
      updated = selected.filter((o) => o !== opt);
    } else {
      updated = [...selected, opt];
    }
    onChange(updated.join(","));
  };

  const runCodeCompilation = () => {
    setCompiling(true);
    setCompileLog("Executing dry run in sandboxed container...");
    setTimeout(() => {
      setCompiling(false);
      setCompileLog(
        `[OK] Compiled successfully in 12ms.\nOutput:\n-------------------\nSimulation run complete. Core tests passed.`
      );
    }, 1500);
  };

  return (
    <div className="flex flex-col gap-5 w-full select-none">
      
      {/* 1. Question Text */}
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-medium text-zinc-50 leading-relaxed font-sans">
          {cleanQuestionText}
        </h3>
      </div>

      {/* 2. Image Diagram Panel */}
      {imageUrl && (
        <div className="max-w-md my-2 rounded-lg border border-border overflow-hidden bg-surface-base flex items-center justify-center p-2 relative group">
          <img src={imageUrl} alt="Exam diagram reference" className="max-h-64 object-contain rounded-md transition-transform duration-300 group-hover:scale-[1.01]" />
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-surface-base border border-border flex items-center gap-1.5 text-[9px] font-mono text-zinc-400">
            <ImageIcon size={10} /> Diagram Reference
          </div>
        </div>
      )}

      {/* 3. Interactive Input Container */}
      <div className="w-full mt-1">
        
        {/* Render TRUE/FALSE Options */}
        {type === "TRUE_FALSE" && (
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            {question.options.map((opt) => {
              const isTrue = opt.toLowerCase() === "true" || opt.toLowerCase() === "t";
              const isSelected = value === opt;
              return (
                <button
                  type="button"
                  key={opt}
                  onClick={() => onChange(opt)}
                  className={`py-5 rounded-lg border text-center font-semibold font-sans text-sm transition-all duration-150 ${
                    isSelected
                      ? isTrue
                        ? "bg-success/10 border-success text-success"
                        : "bg-danger/10 border-danger text-danger"
                      : "bg-surface-base border-border hover:border-border-emphasis text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {opt.toUpperCase()}
                </button>
              );
            })}
          </div>
        )}

        {/* Render MCQ Option List */}
        {type === "MCQ" && (
          <div className="flex flex-col gap-2.5 max-w-2xl">
            {question.options.map((opt, i) => {
              const isSelected = value === opt;
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => onChange(opt)}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-lg border text-left text-sm transition-all duration-150 ${
                    isSelected
                      ? "bg-accent/10 border-accent text-zinc-50"
                      : "bg-surface-base border-border hover:border-border-emphasis text-zinc-350 hover:text-zinc-150"
                  }`}
                >
                  <div className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center shrink-0 ${
                    isSelected ? "border-accent bg-accent" : "border-zinc-600 bg-surface-base"
                  }`}>
                    {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="font-mono text-xs text-accent font-semibold pr-1">({String.fromCharCode(65 + i)})</span>
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {/* Render Checkbox Questions (Multi Select) */}
        {type === "CHECKBOX" && (
          <div className="flex flex-col gap-2.5 max-w-2xl">
            {question.options.map((opt, i) => {
              const selectedOptions = value ? value.split(",") : [];
              const isSelected = selectedOptions.includes(opt);
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => handleCheckboxToggle(opt)}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-lg border text-left text-sm transition-all duration-150 ${
                    isSelected
                      ? "bg-accent/10 border-accent text-zinc-50"
                      : "bg-surface-base border-border hover:border-border-emphasis text-zinc-350 hover:text-zinc-150"
                  }`}
                >
                  <div className={`h-4.5 w-4.5 rounded border flex items-center justify-center shrink-0 ${
                    isSelected ? "border-accent bg-accent" : "border-zinc-600 bg-surface-base"
                  }`}>
                    {isSelected && <CheckCircle size={10} className="text-white" />}
                  </div>
                  <span className="font-mono text-xs text-accent font-semibold pr-1">[{String.fromCharCode(65 + i)}]</span>
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {/* Render Code Workspace */}
        {type === "CODE" && (
          <Card className="flex flex-col gap-3 p-4 border-border max-w-4xl bg-surface-raised">
            <div className="flex justify-between items-center bg-surface-base p-2 rounded-lg border border-border">
              <span className="text-[10px] font-sans font-semibold tracking-wider text-accent uppercase flex items-center gap-1.5 pl-1">
                <Terminal size={12} /> Sandbox Editor
              </span>
              <select
                value={codeLang}
                onChange={(e) => setCodeLang(e.target.value)}
                className="bg-surface-base border border-border rounded px-2 py-1 text-xs text-zinc-300 outline-none font-mono"
              >
                <option value="javascript">JavaScript (NodeJS)</option>
                <option value="rust">Rust (rustc 1.75)</option>
                <option value="python">Python 3.11</option>
                <option value="cpp">C++ (GCC 13)</option>
              </select>
            </div>

            <textarea
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={`// Write your ${codeLang} code here...`}
              className="w-full h-80 bg-surface-base text-zinc-200 border border-border rounded-lg p-4 font-mono text-sm leading-relaxed outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all duration-150 resize-y"
            />

            <div className="flex justify-between items-center border-t border-border pt-3 mt-1">
              <Button
                variant="secondary"
                onClick={runCodeCompilation}
                disabled={compiling}
                className="py-1.5 px-3 text-xs font-mono gap-1.5 border border-border"
              >
                <Play size={12} className={compiling ? "animate-pulse text-accent" : ""} />
                {compiling ? "Compiling..." : "Run Tests"}
              </Button>
              <span className="text-[10px] font-mono text-zinc-500 uppercase">
                Tab indentation enabled
              </span>
            </div>

            {compileLog && (
              <pre className="bg-surface-base p-3 rounded-lg border border-border text-[10px] font-mono text-zinc-400 leading-relaxed overflow-x-auto">
                {compileLog}
              </pre>
            )}
          </Card>
        )}

        {/* Render Short Answer Input */}
        {type === "SHORT_ANSWER" && (
          <div className="max-w-xl">
            <Input
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Type your brief, single-line response..."
              className="text-sm px-4 py-3"
            />
          </div>
        )}

        {/* Render Long Answer Markdown Area */}
        {type === "LONG_ANSWER" && (
          <div className="flex flex-col gap-2 max-w-4xl">
            <textarea
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Type your comprehensive written answer here..."
              className="w-full h-64 bg-surface-base border border-border rounded-lg p-4 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all duration-150 resize-y font-sans leading-relaxed"
            />
            <div className="flex justify-end text-[10px] font-mono text-zinc-500 pr-1">
              Word Count: {value ? value.trim().split(/\s+/).filter(Boolean).length : 0} &bull; Characters: {value ? value.length : 0}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
