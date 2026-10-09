import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PERIODS, parseTrending, generate, markdown } from '../trending.mjs';

function article(repo, stars, period = 'daily', description = '描述 &amp; details') {
  return `<article class="Box-row"><a href="/login">Star</a>
  <h2 class="lh-condensed"><a data-info="x" href="/${repo}"><svg><path /></svg>${repo}</a></h2>
  <p>${description}</p><span itemprop="programmingLanguage">C++</span>
  <a href="/${repo}/stargazers"><svg><path /></svg>999,999</a>
  <span class="d-inline-block float-sm-right"><svg><path /></svg>${stars} stars ${PERIODS[period].suffix}</span></article>`;
}

test('三个周期分别按新增数排序，保留所有项目，原名次与同分顺序保留', () => {
  for (const period of Object.keys(PERIODS)) {
    const html = Array.from({ length: 15 }, (_, index) => article(`owner/repo-${index}`, index === 1 ? '1,234' : index, period)).join('');
    const rows = parseTrending(html, period);
    assert.equal(rows.length, 15);
    assert.equal(rows[0].repository, 'owner/repo-1');
    assert.equal(rows[0].stars_gained, 1234);
    assert.equal(rows[0].github_rank, 2);
    assert.equal(rows.at(-1).stars_gained, 0);
    assert.equal(rows[0].total_stars, 999999);
    assert.equal(rows[0].language, 'C++');
    assert.equal(rows[0].description, '描述 & details');
  }
  const ties = parseTrending(article('o/z', 1) + article('o/a', 1), 'daily');
  assert.deepEqual(ties.map(row => row.repository), ['o/z', 'o/a']);
});

test('简介中的 Star 字样不干扰周期字段，缺少简介和语言允许为空', () => {
  const html = article('o/r', 0, 'daily', '999,999 stars today &lt;tag&gt;').replace(/<span itemprop[\s\S]*?<\/span>/, '');
  const row = parseTrending(html, 'daily')[0];
  assert.equal(row.stars_gained, 0);
  assert.equal(row.language, '');
  assert.equal(row.description, '999,999 stars today <tag>');
});

test('空页面、缺少周期字段、错周期、重复项目均明确失败', () => {
  assert.throws(() => parseTrending('<html>rate limited</html>', 'daily'), /没有项目/);
  assert.throws(() => parseTrending(article('o/r', 10).replace('float-sm-right', 'changed'), 'daily'), /缺少/);
  assert.throws(() => parseTrending(article('o/r', 10), 'weekly'), /缺少/);
  assert.throws(() => parseTrending(article('o/r', 10) + article('O/R', 20), 'daily'), /重复/);
});

test('三个完整 HTML 离线生成独立榜单、合并榜单、JSON 和源文件', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'trending-tests-'));
  try {
    const inputDir = path.join(directory, 'input');
    const outputDir = path.join(directory, 'output');
    await mkdir(inputDir);
    for (const period of Object.keys(PERIODS)) await writeFile(path.join(inputDir, `${period}.html`), article('o/one', 10, period) + article('o/two', 20, period));
    const { report, destination } = await generate({ inputDir, outputDir });
    assert.equal(report.mode, 'offline');
    for (const period of Object.keys(PERIODS)) {
      assert.equal(report.boards[period].count, 2);
      assert.equal(report.boards[period].fetched_at, null);
      assert.match(report.boards[period].source_html_sha256, /^[a-f\d]{64}$/);
      const rendered = await readFile(path.join(destination, `${period}.md`), 'utf8');
      assert.match(rendered, /o\/two/);
      assert.match(rendered, /抓取时间：/);
      assert.doesNotMatch(rendered, /数据来源|https:\/\/github\.com\/trending/);
      assert.equal(await readFile(path.join(destination, 'sources', `${period}.html`), 'utf8'), await readFile(path.join(inputDir, `${period}.html`), 'utf8'));
    }
    assert.equal(JSON.parse(await readFile(path.join(destination, 'rankings.json'), 'utf8')).boards.daily.rows.length, 2);
    const combined = await readFile(path.join(destination, 'rankings.md'), 'utf8');
    assert.match(combined, /月榜/);
    assert.doesNotMatch(combined, /数据来源|https:\/\/github\.com\/trending/);
    await writeFile(path.join(inputDir, 'weekly.html'), '<html>error</html>');
    const failedDir = path.join(directory, 'failed');
    await assert.rejects(generate({ inputDir, outputDir: failedDir }), /没有项目/);
    await assert.rejects(readFile(path.join(failedDir, report.snapshot_date, 'daily.md')), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Markdown 安全呈现管道、HTML 和括号字符', () => {
  const rows = parseTrending(article('o/r', 1, 'daily', '&lt;img&gt; a|b [x]'), 'daily');
  const rendered = markdown({ snapshot_date: '2026-10-08', boards: { daily: { source_url: 'https://github.com/trending?since=daily', rows } } }, 'daily');
  assert.match(rendered, /&lt;img&gt; a&#124;b/);
  assert.ok(!rendered.includes('<img>'));
});
