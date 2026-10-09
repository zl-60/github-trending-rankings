# GitHub Trending 日榜、周榜、月榜

榜单内容来自 GitHub 上的热门话题，**可能遗漏部分项目**。日榜、周榜、月榜分别按对应周期新增 Star 数降序排列，保留已收集的全部项目。同分保持原顺序，表格中的排序列称为“增数排名”。

2026-10-08 快照：[日榜](reports/2026-10-08/daily.md) · [周榜](reports/2026-10-08/weekly.md) · [月榜](reports/2026-10-08/monthly.md) · [合并榜单](reports/2026-10-08/rankings.md)。其它日期的快照保存在 [reports](reports/)。

| 周期 | 排序字段 |
| --- | --- |
| 日榜 | 今日新增 Star |
| 周榜 | 本周新增 Star |
| 月榜 | 本月新增 Star |

## 运行

需要 Node.js 22 或更新版本，无需安装第三方依赖或配置 GitHub Token。

```bash
npm test
npm start
```

默认保存到 `reports/北京时间快照日期/`：

- `daily.md`、`weekly.md`、`monthly.md`：三个独立榜单。
- `rankings.md`：合并阅读版。
- `rankings.json`：全部项目、增数排名、周期新增数、总 Star、简介、语言、来源 URL 和逐页抓取时间；原始顺序仅作为内部排序和核对数据保留。
- `sources/daily.html`、`sources/weekly.html`、`sources/monthly.html`：抓取到的 HTML 原文，JSON 中保存其 SHA-256，便于核对。

每次运行同时抓取三个周期，周榜和月榜也会每天保存快照。同日重复运行会更新当天快照。日期是快照保存日，不是指定历史统计日；不能通过当前页面反查过去某一天。周期日界线沿用 GitHub 的页面口径。

自定义输出目录或离线复核：

```bash
node trending.mjs --output-dir reports
node trending.mjs --input-dir reports/2026-10-08/sources --output-dir offline-reports
```

离线模式明确标记为 offline，原始抓取时间未知，不会声称是当前网页。网络请求最多尝试 3 次，每次超时 30 秒。任何页面为空或任一项目缺少对应周期 Star 数，均报错，不静默遗漏项目；三个页面全部抓取和解析成功后才写入结果。

页面数量可能变化，少于 10 个时也保留实际全部数量。语言和简介直接从网页读取，不需要另调用 API。

## 每日自动运行

把本目录的内容上传至你自己的 GitHub 仓库根目录，保留 `.github/workflows/trending.yml`。它计划每天北京时间 10:37 抓取三个榜单，保存快照、更新 README 日期链接、上传 artifact 并提交结果。也支持 Actions 页面手动 Run workflow。

GitHub 定时任务可能延迟或漏触发，10:37 不是准点完成的保证。因此从 11:37 到 23:37 每小时设有备用触发；当天完整榜单已生成时自动跳过，缺失或损坏时补跑。首次上传、代码修改和手动运行仍会刷新榜单。

首次上传以及主分支代码或工作流修改时，也会运行一次验证和抓取。只更新榜单文件不会触发重复运行。

工作流需要仓库允许 Actions 写入；受保护分支可能禁止直接推送。定时触发可能延迟。上传后可在仓库的 Actions 页面查看运行状态，也可手动运行验证。
