import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as trending from '../trending.mjs';

test('README 快照日期和三个榜单链接随更新推进，保留用户来源声明', () => {
  assert.equal(typeof trending.readmeForDate, 'function');
  const original = '# 榜单\n\n榜单内容来自 GitHub 上的热门话题，**可能遗漏部分项目**。\n\n2026-10-08 快照：[日榜](reports/2026-10-08/daily.md) · [周榜](reports/2026-10-08/weekly.md) · [月榜](reports/2026-10-08/monthly.md) · [合并榜单](reports/2026-10-08/rankings.md)。其它日期的快照保存在 [reports](reports/)。\n';
  const updated = trending.readmeForDate(original, '2026-10-09');
  assert.ok(!updated.includes('2026-10-08'));
  for (const period of ['daily', 'weekly', 'monthly', 'rankings']) assert.ok(updated.includes(`reports/2026-10-09/${period}.md`));
  assert.ok(updated.includes('榜单内容来自 GitHub 上的热门话题，**可能遗漏部分项目**。'));
  assert.equal(trending.readmeForDate(updated, '2026-10-09'), updated);
});

test('备用触发仅跳过完整的当日实时榜单，缺失、旧日、离线或损坏数据需要补跑', async () => {
  assert.equal(typeof trending.hasSnapshot, 'function');
  const directory = await mkdtemp(path.join(tmpdir(), 'snapshot-tests-'));
  try {
    const date = '2026-10-09';
    const destination = path.join(directory, date);
    await mkdir(destination);
    const filename = path.join(destination, 'rankings.json');
    await mkdir(path.join(destination, 'sources'));
    for (const file of ['rankings.md', 'daily.md', 'weekly.md', 'monthly.md', 'sources/daily.html', 'sources/weekly.html', 'sources/monthly.html']) {
      await writeFile(path.join(destination, file), 'snapshot');
    }
    assert.equal(await trending.hasSnapshot(directory, date), false);
    const report = { snapshot_date: date, mode: 'live', boards: Object.fromEntries(['daily', 'weekly', 'monthly'].map(period => [period, { count: 1, rows: [{ repository: 'o/r' }] }])) };
    await writeFile(filename, JSON.stringify(report));
    assert.equal(await trending.hasSnapshot(directory, date), true);
    report.mode = 'offline';
    await writeFile(filename, JSON.stringify(report));
    assert.equal(await trending.hasSnapshot(directory, date), false);
    report.mode = 'live';
    report.snapshot_date = '2026-10-08';
    await writeFile(filename, JSON.stringify(report));
    assert.equal(await trending.hasSnapshot(directory, date), false);
    report.snapshot_date = date;
    report.boards.monthly.rows = [];
    await writeFile(filename, JSON.stringify(report));
    assert.equal(await trending.hasSnapshot(directory, date), false);
    await writeFile(filename, '{broken');
    assert.equal(await trending.hasSnapshot(directory, date), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
