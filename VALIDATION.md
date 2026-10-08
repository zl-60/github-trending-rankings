# 验证记录

- 2026-10-08 北京时间 21:36:59–21:37:00，从三个 GitHub Trending 实时页面抓取。
- 日榜 9 个项目、周榜 11 个项目、月榜 24 个项目，保留所有 article 项目，没有截取前 10。
- 验证每个周期的输出数量等于该 HTML 的项目数量、排名按周期新增数降序、保存的 HTML 与记录的 SHA-256 一致。
- `npm test`：5 项通过，0 项失败。覆盖三个周期、超过 10 个项目全量保留、同分原顺序、字段缺失报错、三个页面同时成功后生成文件、离线快照及 Markdown 转义。
- 日榜首位：morluto/rea，页面显示 7,744 stars today。
- 周榜首位：Panniantong/Agent-Reach，页面显示 6,912 stars this week。
- 月榜首位：debpalash/VoiceStudio，页面显示 34,563 stars this month。
- 自动运行配置位于 `.github/workflows/trending.yml`，配置为每日北京时间 10:37；云端运行状态请查看仓库 Actions 页面。

快照日期表示保存日期；各周期新增数直接沿用各自页面。以后页面数值变化时，与本快照不一致属于不同抓取时点。
