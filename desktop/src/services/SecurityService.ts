export class SecurityService {
  private static onViolationCallback: ((type: string, message: string) => void) | null = null;
  private static idleTimeoutId: number | null = null;
  private static readonly IDLE_THRESHOLD_MS = 60000; // 60 seconds inactivity triggers idle warning

  private static eventListeners: { target: EventTarget; type: string; handler: EventListener }[] = [];

  public static initialize(options: { onViolation: (type: string, message: string) => void }) {
    this.onViolationCallback = options.onViolation;
    this.destroy(); // Clear any previous active handlers

    // 1. Intercept context menu (right click)
    this.addListener(window, "contextmenu", (e) => {
      e.preventDefault();
      this.triggerViolation("CONTEXT_MENU", "Attempted to open right-click context menu.");
    });

    // 2. Clipboard protection
    this.addListener(window, "copy", (e) => {
      e.preventDefault();
      this.triggerViolation("CLIPBOARD_COPY", "Text copy actions are blocked.");
    });
    this.addListener(window, "cut", (e) => {
      e.preventDefault();
      this.triggerViolation("CLIPBOARD_CUT", "Text cut actions are blocked.");
    });
    this.addListener(window, "paste", (e) => {
      e.preventDefault();
      this.triggerViolation("CLIPBOARD_PASTE", "Clipboard paste actions are blocked.");
    });

    // 3. Drag and Drop protection
    this.addListener(window, "dragover", (e) => {
      e.preventDefault();
    });
    this.addListener(window, "drop", (e) => {
      e.preventDefault();
      this.triggerViolation("DRAG_DROP", "Attempted to drag and drop files or objects into the window.");
    });

    // 4. Developer Tools & keyboard tamper detection
    this.addListener(window, "keydown", (e: Event) => {
      const ke = e as KeyboardEvent;
      const isF12 = ke.key === "F12";
      const isDevToolsCombo =
        (ke.ctrlKey && ke.shiftKey && ke.key.toLowerCase() === "i") ||
        (ke.metaKey && ke.altKey && ke.key.toLowerCase() === "i");

      if (isF12 || isDevToolsCombo) {
        ke.preventDefault();
        this.triggerViolation("TAMPER_DEVTOOLS", "Developer Tools shortcuts blocked.");
      }
    });

    // 5. Inactivity Idle detection tracker
    this.resetIdleTimer();
    this.addListener(window, "mousemove", () => this.resetIdleTimer());
    this.addListener(window, "mousedown", () => this.resetIdleTimer());
    this.addListener(window, "keydown", () => this.resetIdleTimer());
    this.addListener(window, "scroll", () => this.resetIdleTimer());
  }

  public static destroy() {
    // Unbind all registered events
    this.eventListeners.forEach(({ target, type, handler }) => {
      target.removeEventListener(type, handler);
    });
    this.eventListeners = [];

    if (this.idleTimeoutId) {
      clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }
    this.onViolationCallback = null;
  }

  private static addListener(target: EventTarget, type: string, handler: EventListener) {
    target.addEventListener(type, handler);
    this.eventListeners.push({ target, type, handler });
  }

  private static resetIdleTimer() {
    if (this.idleTimeoutId) {
      clearTimeout(this.idleTimeoutId);
    }
    this.idleTimeoutId = window.setTimeout(() => {
      this.triggerViolation("IDLE_INACTIVITY", "Inactivity limit reached (60 seconds mouse/keyboard idle).");
      this.resetIdleTimer(); // Re-trigger next idle check loop
    }, this.IDLE_THRESHOLD_MS);
  }

  private static triggerViolation(type: string, message: string) {
    if (this.onViolationCallback) {
      this.onViolationCallback(type, message);
    }
  }
}
