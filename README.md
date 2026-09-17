# 索伦引擎客户网站

正式地址：https://hjh19970220.github.io/

手机优先的足球赛事分析 H5：首页 / 赛事 / 战绩 / 我的。无构建依赖，静态文件由 GitHub Pages 发布；数据仅使用生产客户安全读取接口。

- 前端：`index.html`、`assets/soren/`；`client-v1.html` 为同版预览入口。
- 开发分支：`soren-client-v1`。
- 发布：`main`，GitHub Pages 自动部署。
- 验证：`npm ci && npm run check && npm test`。
- 测试夹具仅用于测试，不进入客户数据或战绩。
- PRO 支付未开放，真实邮件注册闭环仍待验证。
- 详见 `_ops/soren-client/RELEASE.md` 的数据问题、验证边界和回滚方法。

## 回滚

原站备份：`backup-pre-soren-client-20260917`（`f0380e694088f27f7eb86b298f98e6913bd29bd3`）。优先撤销首页切换提交；或从备份分支恢复 `index.html` 并创建普通新提交。不要强制推送，不涉及数据库回滚。

本次工作不修改任何模型核心、FT、让球、单双选或 Best Play。
