export class ExamShortcutManager {
  public static setupShortcuts(callbacks: {
    onPrev: () => void;
    onNext: () => void;
    onToggleMark: () => void;
    onSelectOption: (optionIdx: number) => void;
  }): () => void {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Bypass keyboard navigation if the user is typing inside text input fields
      const activeEl = document.activeElement;
      if (activeEl) {
        const tagName = activeEl.tagName.toLowerCase();
        const isEditable = activeEl.getAttribute("contenteditable") === "true";
        if (
          tagName === "input" ||
          tagName === "textarea" ||
          isEditable
        ) {
          return;
        }
      }

      // 2. Map hotkeys to navigation events
      switch (e.key.toLowerCase()) {
        case "arrowleft":
        case "p":
          e.preventDefault();
          callbacks.onPrev();
          break;
        case "arrowright":
        case "n":
          e.preventDefault();
          callbacks.onNext();
          break;
        case "m":
          e.preventDefault();
          callbacks.onToggleMark();
          break;
        default:
          // Numeric options (1-9) for MCQ/Checkbox option selecting
          const num = parseInt(e.key, 10);
          if (!isNaN(num) && num >= 1 && num <= 9) {
            e.preventDefault();
            callbacks.onSelectOption(num - 1);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    
    // Return cleanup function to easily unmount inside useEffect hooks
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }
}
