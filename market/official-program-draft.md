# DeepSeek Harness 官方插件作者扶持计划 — 意向申请（草稿）

> 来源：官方 2026-11-08 公告《Growing Together with Our Plugin Community》
> 表单：https://trtgsjkv6r.feishu.cn/share/base/form/shrcnkRrxNyri4bOF9n48BIYWbb （飞书，只收集初步意向，参与规则待正式公布）
> 状态：待人工填写提交（飞书表单无法可靠自动化，且涉及账号身份）

## 可直接粘贴的字段内容

**插件名称 / 作品链接**
dsh-ungrouped-sweeper — https://github.com/dororo42/dsh-ungrouped-sweeper

**一句话介绍**
会话清扫器：在 dsh web 里按分组列出全部对话，一键批量归档未分组的测试对话（走官方 workspace 注册表、先停运行任务），随时恢复；彻底删除作为独立第二阶段、仅限已归档会话。零依赖，含原生侧边栏入口注入。

**技术要点 / 差异化**
- 完全走官方服务 API（workspaceRegistry.archiveSession / sessionPersistence / webServer.register / connection.requestRejection），不碰内部数据结构
- 标题直接读官方 dsh-session-title 服务的投影缓存，与原生 UI 显示一致
- 两级删除模型：归档（可逆缓冲）→ 彻底删除（仅限已归档），误操作永远有一步可救
- 零运行时依赖；客户端注入采用宿主 CJS 工厂形态，无构建步骤
- 已在 DSH 0.2.0-rc.2 生产环境验证（list/delete/restore/purge 全链路实测）

**希望获得的支持**（官方提供三类的勾选建议）
- Token 资助：插件开发与测试消耗
- 技术交流：插件 API 稳定性反馈（webServer.register 重复注册抛错语义、sessionPersistence 缺少删除 API 等）
- 作品推广：愿意在官方市场上架

**联系方式**
dororo42（GitHub）

## 提交步骤
1. 打开飞书表单链接，GitHub 显示名 dororo42
2. 粘贴上述字段（按表单实际字段拆分）
3. 提交后截图留档到本目录
