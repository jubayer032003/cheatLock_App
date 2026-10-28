import { useEffect, useState } from "react";
import type { LiveStudent } from "../types";
import { monitoringFreshness } from "../lib/monitoringState";

export function useMonitoringFreshness(student: LiveStudent | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);
  return student ? monitoringFreshness(student, now) : "Unknown";
}
