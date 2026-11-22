import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-runs-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('readNight', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night!.rows.find((r) => r.job === job)!;

  it('reads the real night: 5 jobs sorted, 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night!.night).toBe('2026-10-28');
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night!.badLines).toBe(1);
    expect(night!.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('keeps per-job details', () => {
    expect(row('digest/render').owner).toBeNull();
    expect(row('fixtures/refresh')).toMatchObject({ runs: 4, retries: 3, fails: 0, lastStatus: 'ok', lastError: null });
    expect(row('notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded', fails: 1, owner: 'lane-07' });
    expect(row('lane/sync')).toMatchObject({
      runs: 8,
      retries: 1,
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });

  it('returns null for a night with no file', () => {
    expect(readNight(tmp, '2026-01-01')).toBeNull();
  });

  it('returns an empty night for an empty file', () => {
    writeFileSync(join(tmp, '2026-01-02.jsonl'), '');
    expect(readNight(tmp, '2026-01-02')).toEqual({
      night: '2026-01-02',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts wrong-shape lines as bad and keeps the last non-null owner', () => {
    writeFileSync(
      join(tmp, '2026-01-03.jsonl'),
      [
        '{"at":"t1","job":"a","status":"ok","owner":"x"}',
        '{"at":"t2","job":"a","status":"weird","owner":"x"}',
        '[]',
        '',
        '{"at":"t3","job":"a","status":"retry","owner":null,"error":"e"}',
      ].join('\n'),
    );
    const n = readNight(tmp, '2026-01-03')!;
    expect(n.badLines).toBe(2);
    expect(n.rows).toEqual([
      { job: 'a', owner: 'x', runs: 2, retries: 1, fails: 0, lastStatus: 'retry', lastError: 'e', firstAt: 't1', lastAt: 't3' },
    ]);
  });
});
