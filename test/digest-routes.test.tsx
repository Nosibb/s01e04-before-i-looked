import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-routes-'));
const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: tmp };

beforeAll(() => {
  // Copy the real fixture for the bad line test
  copyFileSync('runs/2026-10-28.jsonl', join(tmp, '2026-10-28.jsonl'));
  // Empty night
  writeFileSync(join(tmp, '2026-11-01.jsonl'), '');
  // Night with data
  writeFileSync(
    join(tmp, '2026-11-02.jsonl'),
    [
      '{"at":"2026-11-02T23:00:00+01:00","job":"alpha","status":"ok","owner":"alice"}',
      '{"at":"2026-11-02T23:01:00+01:00","job":"beta","status":"retry","owner":"bob","error":"flaky"}',
      '{"at":"2026-11-02T23:02:00+01:00","job":"beta","status":"retry","owner":"bob","error":"flaky"}',
      '{"at":"2026-11-02T23:03:00+01:00","job":"beta","status":"retry","owner":"bob","error":"flaky"}',
      '{"at":"2026-11-02T23:04:00+01:00","job":"beta","status":"ok","owner":"bob"}',
      '{"at":"2026-11-02T23:05:00+01:00","job":"gamma","status":"fail","owner":null,"error":"crash"}',
    ].join('\n'),
  );
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('GET /digest/:night (page)', () => {
  it('200 for a night with data: shows job names and lane banner', async () => {
    process.env.LANE_MARKER = 'TEST-BANNER';
    const res = await createApp(config).request('/digest/2026-11-02');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-BANNER');
    expect(html).toContain('alpha');
    expect(html).toContain('beta');
    expect(html).toContain('gamma');
  });

  it('404 for a night with no file', async () => {
    const res = await createApp(config).request('/digest/2026-12-25');
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).toContain('not found');
    expect(html).toContain('2026-12-25');
  });

  it('404 for a malformed night', async () => {
    const res = await createApp(config).request('/digest/not-a-date');
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).toContain('not found');
  });

  it('empty night: page contains "nothing ran"', async () => {
    const res = await createApp(config).request('/digest/2026-11-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('night with bad line: 200, page says "1 line did not parse", valid rows present', async () => {
    const res = await createApp(config).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 line did not parse');
    expect(html).toContain('digest/render');
    expect(html).toContain('fixtures/refresh');
    expect(html).toContain('lane/sync');
    expect(html).toContain('notes/backup');
    expect(html).toContain('rig/rotate-logs');
  });

  it('page marks retries >= 3 and fail rows with class "warn"', async () => {
    const res = await createApp(config).request('/digest/2026-11-02');
    const html = await res.text();
    expect(res.status).toBe(200);
    // beta has 3 retries, gamma has a fail
    const rows = html.match(/<tr[^>]*>/g) || [];
    const warnRows = html.match(/<tr class="warn">/g) || [];
    expect(warnRows.length).toBeGreaterThanOrEqual(2); // beta and gamma
  });

  it('owner null shows —', async () => {
    const res = await createApp(config).request('/digest/2026-11-02');
    const html = await res.text();
    expect(res.status).toBe(200);
    // gamma has owner null
    const gammaRow = html.match(/<tr class="warn">[^]*?gamma[^]*?<\/tr>/s);
    expect(gammaRow).toBeTruthy();
    expect(gammaRow![0]).toContain('—');
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('200 for a night with data: JSON has rows', async () => {
    const res = await createApp(config).request('/api/digest/2026-11-02');
    const json = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(json.night).toBe('2026-11-02');
    expect(json.rows.length).toBe(3);
    expect(json.rows.map((r) => r.job)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('404 for a night with no file', async () => {
    const res = await createApp(config).request('/api/digest/2026-12-25');
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.error).toBe('no such night');
    expect(json.night).toBe('2026-12-25');
  });

  it('404 for a malformed night', async () => {
    const res = await createApp(config).request('/api/digest/not-a-date');
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.error).toBe('no such night');
  });

  it('empty night: JSON rows []', async () => {
    const res = await createApp(config).request('/api/digest/2026-11-01');
    const json = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(json.night).toBe('2026-11-01');
    expect(json.rows).toEqual([]);
  });

  it('night with bad line: 200, JSON badLines 1, valid rows present', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-28');
    const json = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(json.badLines).toBe(1);
    expect(json.rows.length).toBe(5);
    expect(json.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('JSON structure includes all expected fields', async () => {
    const res = await createApp(config).request('/api/digest/2026-11-02');
    const json = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(json).toHaveProperty('night');
    expect(json).toHaveProperty('rows');
    expect(json).toHaveProperty('badLines');
    expect(json).toHaveProperty('counts');
    expect(json.rows[0]).toHaveProperty('job');
    expect(json.rows[0]).toHaveProperty('owner');
    expect(json.rows[0]).toHaveProperty('runs');
    expect(json.rows[0]).toHaveProperty('retries');
    expect(json.rows[0]).toHaveProperty('fails');
    expect(json.rows[0]).toHaveProperty('lastStatus');
    expect(json.rows[0]).toHaveProperty('lastError');
    expect(json.rows[0]).toHaveProperty('firstAt');
    expect(json.rows[0]).toHaveProperty('lastAt');
  });
});

describe('page and JSON agreement', () => {
  it('job order in page table equals JSON rows job order', async () => {
    const pageRes = await createApp(config).request('/digest/2026-11-02');
    const jsonRes = await createApp(config).request('/api/digest/2026-11-02');
    const html = await pageRes.text();
    const json = (await jsonRes.json()) as Night;

    // Extract job names from HTML table in order
    const jobMatches = [...html.matchAll(/<td>([a-z/]+)<\/td>/g)];
    const pageJobs = jobMatches
      .map((m) => m[1])
      .filter((job) => job !== '—' && job !== 'ok' && job !== 'fail' && job !== 'retry'); // filter out non-job cells

    // Get unique jobs (first occurrence only, as table has multiple columns)
    const uniquePageJobs: string[] = [];
    for (const job of pageJobs) {
      if (!uniquePageJobs.includes(job) && json.rows.some((r) => r.job === job)) {
        uniquePageJobs.push(job);
      }
    }

    expect(uniquePageJobs).toEqual(json.rows.map((r) => r.job));
  });

  it('page and JSON agree on row count', async () => {
    const pageRes = await createApp(config).request('/digest/2026-10-28');
    const jsonRes = await createApp(config).request('/api/digest/2026-10-28');
    const html = await pageRes.text();
    const json = (await jsonRes.json()) as Night;

    // Count tbody tr elements (excluding thead)
    const tbodyMatch = html.match(/<tbody>(.*?)<\/tbody>/s);
    const rowMatches = tbodyMatch ? tbodyMatch[1].match(/<tr[^>]*>/g) : [];
    const pageRowCount = rowMatches ? rowMatches.length : 0;

    expect(pageRowCount).toBe(json.rows.length);
  });
});
