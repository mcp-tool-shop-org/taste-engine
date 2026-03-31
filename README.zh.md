<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/taste-engine/readme.png" alt="Taste Engine" width="400">
</p>

<h3 align="center">Canon-and-judgment system for creative and product work</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@mcptoolshop/taste-engine"><img src="https://img.shields.io/npm/v/@mcptoolshop/taste-engine" alt="npm version"></a>
  <a href="https://github.com/mcp-tool-shop-org/taste-engine/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mcp-tool-shop-org/taste-engine" alt="license"></a>
  <a href="https://github.com/mcp-tool-shop-org/taste-engine"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="node version"></a>
</p>

---

Taste Engine 可以读取代码仓库的文档（README 文件、架构文档、设计说明），通过多轮 LLM 分析提取核心内容，并使用这些核心内容来审查新的代码或文件，以确保其符合规范。当检测到偏差时，它会生成修复建议或完整的重定向方案，所有操作都在本地运行，无需付费 API。

## 威胁模型

Taste Engine 仅在**本地**运行。它从磁盘读取项目文件，将工作状态存储在本地 SQLite 数据库（`.taste/taste.db`）和 JSON 核心内容文件中（`canon/`）。唯一的网络连接是到本地 Ollama 实例，地址为 `127.0.0.1:11434`。可选的 Workbench 用户界面绑定到 `localhost:3200`。不会收集任何遥测数据。不会处理任何密钥或凭据。您的数据不会离开您的机器。

## 安装

```bash
npm install -g @mcptoolshop/taste-engine
```

需要 [Node.js](https://nodejs.org/) (>= 20) 和 [Ollama](https://ollama.ai/)，并且本地已安装模型（例如：`ollama pull qwen2.5:14b`）。

## 快速入门

```bash
# Initialize a project
taste init my-project --root ./my-project

# Check environment health
taste doctor

# Ingest source artifacts (READMEs, docs, design notes)
taste ingest README.md docs/architecture.md

# Extract canon statements (multi-pass, Ollama-powered)
taste extract run

# Curate: review candidates, accept/reject/edit
taste curate queue
taste curate accept <id>

# Freeze canon version
taste curate freeze --tag v1

# Review an artifact against curated canon
taste review run path/to/artifact.md

# Run the workflow gate on changed files
taste gate run
```

## 它能做什么

**提取 (Extract)**：8 个专业模块分析您的源代码文档，提取核心论点、设计规则、反模式、风格/命名约定等。通过 Jaccard 相似性检测重复内容，以整合重复的发现。

**整理 (Curate)**：人工干预的整理：接受、拒绝、编辑、合并或暂缓提取的候选内容。解决矛盾。冻结版本以进行可重复的审查。

**审查 (Review)**：根据 4 个维度对代码或文件进行评分（核心论点是否保留、模式一致性、反模式冲突、风格/命名是否符合）。一个确定的评审等级（符合 → 勉强符合 → 可修复的偏差 → 严重的偏差 → 矛盾）会覆盖模型结果，规则不能被轻易改变。

**修复 (Repair)**：根据偏差的严重程度，有三种修复模式：
- **补丁 (Patch)** (1A)：对表面偏差进行最小程度的修改。
- **结构化 (Structural)** (1B)：提取目标 + 故障诊断 + 概念替换。
- **重定向 (Redirect)** (2C)：对目标进行完全重定向，并提供 2-3 个与核心内容兼容的替代方案。

**门禁 (Gate)**：执行模式（建议/警告/强制），带有 CI 退出码、覆盖记录以及每个代码或文件类型的策略。

**组合 (Portfolio)**：为代码仓库配置策略预设，检测跨项目的偏差家族，跟踪升级模式，生成采用建议。

**组织 (Org)**：用于多代码仓库发布的控制平面：推广队列、降级触发器、7 个类别的告警引擎、预览/应用/回滚操作以及审计记录。

**瞭望塔 (Watchtower)**：基于快照的变更检测，使用增量引擎和摘要生成，用于每日的运营监控。

**工作台 (Workbench)**：位于 `localhost:3200` 的 React 用户界面，采用深色主题，提供 13 个 API 接口，用于组织矩阵、队列、代码仓库详情和操作管理。

## CLI 参考

68 个命令，组织在以下组中：

| 组 | 命令 |
|-------|----------|
| `taste init` | 初始化项目 |
| `taste doctor` | 环境健康检查 |
| `taste ingest` | 导入源代码 |
| `taste canon` | 核心内容状态和管理 |
| `taste extract` | 运行提取，查看候选内容/矛盾/示例 |
| `taste curate` | 队列、接受、拒绝、编辑、合并、冻结 |
| `taste review` | 运行审查、列出结果、查看报告 |
| `taste calibrate` | 反馈、摘要、声明、发现 |
| `taste revise` | 补丁修订，并重新审查 |
| `taste repair` | 用于深度偏差的结构化修复 |
| `taste redirect` | 用于无法修复的代码或文件的目标重定向 |
| `taste gate` | 运行门禁、管理策略、记录覆盖、生成报告 |
| `taste onboard` | 代码仓库导入、报告、建议 |
| `taste portfolio` | 跨代码仓库矩阵、发现、导出 |
| `taste org` | 组织矩阵、队列、告警、操作（预览/应用/回滚） |
| `taste watchtower` | 扫描、历史、增量、摘要 |
| `taste workbench` | 启动操作员的Web界面。 |

运行 `taste --help` 或 `taste <命令> --help` 以获取完整的用法说明。

## 架构

```
src/
  core/         # Schema, types, enums, validation (Zod), IDs
  db/           # SQLite persistence, migrations
  canon/        # Canon store, versioning, file I/O
  extraction/   # 8-pass extraction, prompts, consolidation
  review/       # Canon packet, dimension prompts, verdict synthesis
  revision/     # Patch revision engine
  repair/       # Structural repair (goal → fault → concept → draft)
  redirect/     # Goal redirection briefs
  gate/         # Workflow gate, policy, overrides, rollout reports
  onboard/      # Source scanner, presets, recommendations
  portfolio/    # Cross-repo intelligence
  org/          # Org control plane, alerts, actions
  watchtower/   # Snapshot engine, delta, digest
  workbench/    # Express API + React UI
  cli/          # Commander CLI (68 commands)
  util/         # JSON, timestamps, Ollama client
```

## 支持的平台

- **操作系统：** Windows、macOS、Linux
- **运行时环境：** Node.js >= 20
- **大型语言模型：** Ollama（本地）——已使用 qwen2.5:14b 进行测试

## 许可证

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://github.com/mcp-tool-shop-org">mcp-tool-shop</a>
</p>
