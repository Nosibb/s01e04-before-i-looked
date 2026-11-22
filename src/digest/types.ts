// Contract for the morning digest (plan.md § 1). Reader logic lives elsewhere.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing.
export type RunLine = {
  at: string; // raw timestamp from the log, offset kept
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job for the night.
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as `—`
  runs: number; // lines for this job
  retries: number; // lines with status `retry`
  fails: number; // lines with status `fail` (added in #2: the page marks any fail)
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string; // raw `at`, offset kept, never converted
  lastAt: string; // raw `at`, offset kept, never converted
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job; empty when nothing ran
  badLines: number; // lines that did not parse; counted, never thrown
  counts: Record<RunStatus, number>; // parsed lines per status, whole night (added in #2: board counts)
};

// Reads runsDir/<night>.jsonl. Returns null when the file does not exist (404),
// a Night with no rows when the file is empty ("nothing ran"). Never throws on a bad line.
export type ReadNight = (runsDir: string, night: string) => Night | null;
