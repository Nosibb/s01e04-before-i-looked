import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { lastBeat, type Beat } from './heartbeat.js';
import { readNight } from './digest/read.js';
import type { RunStatus } from './digest/types.js';

export type NightWithCounts = {
  night: string;
  counts: Record<RunStatus, number> | null; // null when readNight returns null
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightWithCounts[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  const nightStrings = nightsOnDisk(config.runsDir);
  const nights = nightStrings.map((night) => {
    const result = readNight(config.runsDir, night);
    return {
      night,
      counts: result ? result.counts : null,
    };
  });

  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
  };
}
