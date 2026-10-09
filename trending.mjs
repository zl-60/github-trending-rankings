import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export const PERIODS = {
  daily: { label: '日榜', metric: '今日新增 Star', suffix: 'today' },
  weekly: { label: '周榜', metric: '本周新增 Star', suffix: 'this week' },
  monthly: { label: '月榜', metric: '本月新增 Star', suffix: 'this month' },
};

function decodeEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (original, entity) => {
    if (entity.startsWith('#')) {
      const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : original;
    }
    return named[entity.toLowerCase()];
  });
}

function text(html) {
  return decodeEntities(html.replace(/<(svg|script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function parseTrending(html, period) {
  const config = PERIODS[period];
  if (!config) throw new Error(`未知周期: ${period}`);
  const articles = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)].map(match => match[0]);
  if (!articles.length) throw new Error(`${config.label}没有项目，可能是页面结构变化、限流或访问失败`);
  const seen = new Set();
  const rows = articles.map((article, index) => {
    const heading = article.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '';
    const repository = heading.match(/\bhref\s*=\s*["']\/([a-z\d_.-]+\/[a-z\d_.-]+)["']/i)?.[1];
    if (!repository || seen.has(repository.toLowerCase())) throw new Error(`${config.label}第 ${index + 1} 个项目名称缺失或重复`);
    seen.add(repository.toLowerCase());
    // Read the dedicated growth span, never a number inside a description.
    const growthSpan = article.match(/<span\b(?=[^>]*\bclass\s*=\s*["'][^"']*\bfloat-sm-right\b[^"']*["'])[^>]*>([\s\S]*?)<\/span>/i)?.[1];
    const growthText = growthSpan === undefined ? '' : text(growthSpan);
    const growth = growthText.match(new RegExp(`^([\\d,]+)\\s+stars?\\s+${config.suffix}$`, 'i'));
    if (!growth) throw new Error(`${config.label} ${repository} 缺少对应周期的 Star 数: ${growthText}`);
    const starsGained = Number(growth[1].replace(/,/g, ''));
    if (!Number.isSafeInteger(starsGained)) throw new Error(`无效 Star 数: ${repository}`);
    const description = text(article.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '');
    const language = text(article.match(/<span\b[^>]*\bitemprop\s*=\s*["']programmingLanguage["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? '');
    const totalText = text(article.match(/<a\b[^>]*\bhref\s*=\s*["']\/[^"']+\/stargazers["'][^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? '');
    const total = /^\d[\d,]*$/.test(totalText) ? Number(totalText.replace(/,/g, '')) : null;
    return { github_rank: index + 1, repository, url: `https://github.com/${repository}`,
      stars_gained: starsGained, growth_text: growthText, total_stars: total, language, description };
  });
  return rows.sort((a, b) => b.stars_gained - a.stars_gained || a.github_rank - b.github_rank)
    .map((row, index) => ({ rank: index + 1, ...row }));
}

async function fetchPage(period) {
  const url = `https://github.com/trending?since=${period}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000),
        headers: { 'User-Agent': 'github-trending-rankings/1.0', 'Accept-Language': 'en-US,en;q=0.9' } });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`HTTP ${response.status}`);
      }
      const html = await response.text();
      const rows = parseTrending(html, period);
      return { period, source_url: url, fetched_at: new Date().toISOString(), html, rows };
    } catch (error) {
      if (attempt === 3) throw new Error(`${period} 抓取失败: ${error.message}`);
      console.error(`${period} 重试 ${attempt}/3: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

function cell(value) {
  return String(value ?? '—').replace(/[\r\n]+/g, ' ').replace(/&/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([\\`*_[\]])/g, '\\$1').replace(/\|/g, '&#124;');
}

export function markdown(report, onlyPeriod) {
  const periods = onlyPeriod ? [onlyPeriod] : Object.keys(PERIODS);
  const lines = [`# ${report.snapshot_date} GitHub Trending ${onlyPeriod ? PERIODS[onlyPeriod].label : '日榜、周榜、月榜'}排名`, '',
    '按各页面显示的对应周期新增 Star 数降序排列，保留全部上榜项目；同分保持 GitHub 原顺序。', '',
    '日期表示快照保存日（北京时间）。日、周、月的统计口径沿用 GitHub 页面，未重算自然日、自然周或自然月。', '',
  ];
  for (const period of periods) {
    const board = report.boards[period];
    const config = PERIODS[period];
    lines.push(`## ${config.label} · ${board.rows.length} 个项目`, '',
      `[数据来源](${board.source_url}) · 抓取时间：${board.fetched_at ?? '离线 HTML 输入，原始抓取时间未知'}。`, '',
      `| 增数排名 | 项目 | ${config.metric} | 总 Star | 语言 | 简介 |`,
      '| ---: | --- | ---: | ---: | --- | --- |');
    for (const row of board.rows) {
      lines.push(`| ${row.rank} | [${cell(row.repository)}](${row.url}) | ${row.stars_gained.toLocaleString('en-US')} | ${row.total_stars === null ? '—' : row.total_stars.toLocaleString('en-US')} | ${cell(row.language || '—')} | ${cell(row.description || '—')} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function atomicWrite(filename, content) {
  await writeFile(`${filename}.tmp`, content, 'utf8');
  await rename(`${filename}.tmp`, filename);
}

export function snapshotDate(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

export function readmeForDate(content, date) {
  const line = `${date} 快照：[日榜](reports/${date}/daily.md) · [周榜](reports/${date}/weekly.md) · [月榜](reports/${date}/monthly.md) · [合并榜单](reports/${date}/rankings.md)。其它日期的快照保存在 [reports](reports/)。`;
  if (/^\d{4}-\d{2}-\d{2} 快照：.*$/m.test(content)) {
    return content.replace(/^\d{4}-\d{2}-\d{2} 快照：.*$/m, line);
  }
  return content.replace(/^(# [^\n]+\n)/, `$1\n${line}\n`);
}

export async function hasSnapshot(outputDir = 'reports', date = snapshotDate()) {
  try {
    const destination = path.join(outputDir, date);
    const report = JSON.parse(await readFile(path.join(destination, 'rankings.json'), 'utf8'));
    if (report.mode !== 'live' || report.snapshot_date !== date || !report.boards) return false;
    if (!Object.keys(PERIODS).every(period => {
      const board = report.boards[period];
      return board && Number.isInteger(board.count) && board.count > 0 && Array.isArray(board.rows) && board.rows.length === board.count;
    })) return false;
    const files = ['rankings.md', ...Object.keys(PERIODS).flatMap(period => [`${period}.md`, `sources/${period}.html`])];
    const stats = await Promise.all(files.map(file => stat(path.join(destination, file))));
    return stats.every(item => item.isFile() && item.size > 0);
  } catch {
    return false;
  }
}

export async function generate({ outputDir = 'reports', inputDir } = {}) {
  const captured = await Promise.all(Object.keys(PERIODS).map(async period => {
    if (!inputDir) return fetchPage(period);
    const html = await readFile(path.join(inputDir, `${period}.html`), 'utf8');
    return { period, source_url: `https://github.com/trending?since=${period}`,
      fetched_at: null, html, rows: parseTrending(html, period) };
  }));
  const now = new Date();
  const date = snapshotDate(now);
  const report = { snapshot_date: date, generated_at: now.toISOString(),
    snapshot_date_timezone: 'Asia/Shanghai', mode: inputDir ? 'offline' : 'live',
    ranking: 'period stars descending; ties preserve GitHub rank; all listed repositories retained', boards: {} };
  for (const { html, period, rows, ...metadata } of captured) {
    report.boards[period] = { ...metadata, count: rows.length,
      source_html_sha256: createHash('sha256').update(html).digest('hex'), rows };
  }
  // Do not publish any board until all three downloads and parses succeed.
  const destination = path.join(outputDir, date);
  await mkdir(path.join(destination, 'sources'), { recursive: true });
  for (const { period, html } of captured) {
    await atomicWrite(path.join(destination, 'sources', `${period}.html`), html);
    await atomicWrite(path.join(destination, `${period}.md`), markdown(report, period));
  }
  await atomicWrite(path.join(destination, 'rankings.json'), JSON.stringify(report, null, 2) + '\n');
  await atomicWrite(path.join(destination, 'rankings.md'), markdown(report));
  return { report, destination };
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--help') {
      console.log('node trending.mjs [--output-dir reports] [--input-dir 保存有 daily.html、weekly.html、monthly.html 的目录]');
      return;
    }
    const key = { '--output-dir': 'outputDir', '--input-dir': 'inputDir' }[flag];
    if (!key || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`参数错误: ${flag}`);
    options[key] = args[++index];
  }
  const { report, destination } = await generate(options);
  if (!options.inputDir && (options.outputDir === undefined || options.outputDir === 'reports')) {
    // Only update the snapshot line; keep the user's source declaration intact.
    let readme;
    try { readme = await readFile('README.md', 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (readme !== undefined) await atomicWrite('README.md', readmeForDate(readme, report.snapshot_date));
  }
  for (const [period, board] of Object.entries(report.boards)) console.log(`${PERIODS[period].label}: ${board.count} 个项目`);
  console.log(`已保存至 ${destination}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
