// Lightweight, JSON-serializable debug trace.
//
// Steve works entirely against the deployed sandbox — no local terminal, no
// server console. The only way for him to see what actually happened inside a
// server call (what Claude returned, what the normalization math did to it) is
// to ship a structured trace back to the browser and render it. A trace
// accumulates timestamped, labelled steps that an /api route returns alongside
// its result; the UI shows them in a copyable panel, so a wrong extraction can
// be discussed with exact before/after numbers instead of guesses.

export type DebugStep = {
  t: number; // ms since the trace started
  label: string;
  data?: unknown; // any JSON-serializable payload
};

export type DebugTraceData = {
  title: string;
  startedAt: string; // ISO timestamp
  durationMs: number;
  steps: DebugStep[];
};

export type DebugTrace = {
  step: (label: string, data?: unknown) => void;
  toJSON: () => DebugTraceData;
};

// A deep clone that also survives non-serializable values, so logging a step
// never throws and never captures a later-mutated reference by accident.
function snapshot<T>(v: T): T {
  try {
    return JSON.parse(JSON.stringify(v)) as T;
  } catch {
    return v;
  }
}

export function createTrace(title: string): DebugTrace {
  const start = Date.now();
  const data: DebugTraceData = {
    title,
    startedAt: new Date(start).toISOString(),
    durationMs: 0,
    steps: [],
  };
  return {
    step(label, d) {
      data.steps.push({
        t: Date.now() - start,
        label,
        data: d === undefined ? undefined : snapshot(d),
      });
    },
    toJSON() {
      data.durationMs = Date.now() - start;
      return data;
    },
  };
}
