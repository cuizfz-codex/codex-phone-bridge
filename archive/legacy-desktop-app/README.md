# Legacy Desktop App Archive

这里归档的是本项目早期的 Electron 桌面 App 版本。

归档原因：

- 当前项目已经切换到“脚本启动 + 手机网页”简化版主线
- 旧桌面 App 会持续误导排查方向
- 当前功能目标不再依赖旧桌面 App 的菜单栏控制器、Sync 开关和打包流程

归档范围：

- [desktop](./desktop)
- [release.yml](./.github/workflows/release.yml)

说明：

- 这里只做留档，不再维护
- 不再作为当前项目的推荐启动方式
- `node_modules` 与 `dist` 这类生成内容已从仓库归档中移除，不再保留
- 当前请使用仓库根目录的 [Start-Phone-Codex.command](../../Start-Phone-Codex.command)
