export class LivenessManager {
  private static timerId: number | null = null;

  /**
   * Start the random continuous liveness scheduler (triggers every 3 to 8 minutes).
   */
  public static startScheduler(onTriggerChallenge: () => void) {
    this.stopScheduler();

    const getRandomIntervalMs = () => {
      const minMin = 3;
      const maxMin = 8;
      const minutes = Math.random() * (maxMin - minMin) + minMin;
      return Math.round(minutes * 60 * 1000); // Convert minutes to milliseconds
    };

    const scheduleNext = () => {
      const delay = getRandomIntervalMs();
      console.log(`[LivenessManager] Next liveness check scheduled in ${(delay / 1000 / 60).toFixed(2)} minutes.`);
      
      this.timerId = window.setTimeout(() => {
        onTriggerChallenge();
        scheduleNext(); // Loop scheduler
      }, delay);
    };

    scheduleNext();
  }

  /**
   * Stop any active liveness schedules.
   */
  public static stopScheduler() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
}
