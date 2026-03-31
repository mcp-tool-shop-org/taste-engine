<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Taste Engineは、リポジトリのドキュメント（README、アーキテクチャドキュメント、設計ノートなど）を読み込み、多段階のLLM分析によって重要な記述を抽出し、その情報を基に、新しいファイルやコードが既存の規定に適合しているかどうかを評価します。逸脱が検出された場合、修正提案や、規定に沿った代替案を生成します。これらはすべて、ローカルのOllamaインスタンスに対して実行され、有料のAPIは不要です。

## 脅威モデル

Taste Engineは、**ローカル環境でのみ**動作します。プロジェクトファイルはディスクから読み込み、動作状態はローカルのSQLiteデータベース（`.taste/taste.db`）およびJSON形式の規定ファイル（`canon/`）に保存されます。ネットワーク接続は、ローカルのOllamaインスタンス（`127.0.0.1:11434`）への接続のみです。オプションのワークベンチUIは、`localhost:3200`で利用可能です。テレメトリーは収集されません。機密情報や認証情報は扱われません。データはすべてローカルマシン内に保持されます。

## インストール

```bash
npm install -g @mcptoolshop/taste-engine
```

[Node.js](https://nodejs.org/)（バージョン20以上）と、ローカルで実行されている[Ollama](https://ollama.ai/)（モデルがダウンロードされている状態、例：`ollama pull qwen2.5:14b`）が必要です。

## クイックスタート

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

## 機能概要

**抽出（Extract）**: 8種類の専門的な分析を行い、ソースドキュメントから、主要なテーマ、設計ルール、アンチパターン、コーディング規約などを抽出します。Jaccard類似度による重複検出により、重複する情報を統合します。

**キュレーション（Curate）**: 人間によるレビュー：抽出された候補を、受け入れる、拒否する、編集する、マージする、または保留にするなどの操作を行います。矛盾を解決し、再現可能なレビューのためにバージョンを固定します。

**レビュー（Review）**: アーティファクトを、主要なテーマの維持、設計の一貫性、アンチパターンの回避、コーディング規約への適合という4つの側面から評価します。決定的な評価基準（適合 → ほぼ適合 → 修正可能 → 深刻な逸脱 → 矛盾）により、モデルの判断を上書きします。ルールは変更できません。

**修正（Repair）**: 逸脱の深刻度に基づいて、3つの修正モードを提供します。
- **パッチ（Patch）**: 表面的な逸脱を修正するための最小限の変更
- **構造的修正（Structural）**: 目標の抽出 + エラー診断 + 概念の置換
- **リダイレクト（Redirect）**: 規定に準拠した代替案を2〜3つ提示し、目標を完全に変更

**ゲート（Gate）**: 適用モード（アドバイザリ/警告/必須）を設定し、CIの実行結果、上書きの記録、およびアーティファクトの種類ごとの規定を適用します。

**ポートフォリオ（Portfolio）**: 規定のテンプレートを使用してリポジトリを登録し、プロジェクト全体での逸脱の傾向を検出し、移行のパターンを追跡し、導入に関する推奨事項を生成します。

**組織（Org）**: 複数のリポジトリへの展開を管理するための機能：プロモーションキュー、降格トリガー、7種類の警告システム、プレビュー/適用/ロールバック機能、および監査ログ。

**監視塔（Watchtower）**: スナップショットベースの変更検出機能。デルタエンジンとダイジェスト生成により、日々の運用状況を把握します。

**ワークベンチ（Workbench）**: ローカルホストの3200番ポートで動作する、ReactベースのUI。組織の構造、キュー、リポジトリの詳細、および操作管理のための13のAPIエンドポイントを提供します。

## CLIリファレンス

以下のグループに分類された68個のコマンドがあります。

| グループ | コマンド |
|-------|----------|
| `taste init` | プロジェクトの初期化 |
| `taste doctor` | 環境の健全性チェック |
| `taste ingest` | ソースアーティファクトの読み込み |
| `taste canon` | 規定の状態管理 |
| `taste extract` | 抽出、候補/矛盾/例の表示 |
| `taste curate` | キューへの追加、受け入れ、拒否、編集、マージ、固定 |
| `taste review` | レビューの実行、結果の表示、パケットの表示 |
| `taste calibrate` | フィードバック、概要、記述、調査結果 |
| `taste revise` | 再レビュー付きのパッチの適用 |
| `taste repair` | 深刻な逸脱に対する構造的修正 |
| `taste redirect` | 修正不可能なアーティファクトに対する目標のリダイレクト |
| `taste gate` | ゲートの実行、ポリシーの管理、上書きの記録、レポートの生成 |
| `taste onboard` | リポジトリの登録、レポート、推奨事項 |
| `taste portfolio` | クロスリポジトリの構造、調査結果、エクスポート |
| `taste org` | 組織の構造、キュー、警告、操作（プレビュー/適用/ロールバック） |
| `taste watchtower` | スキャン、履歴、デルタ、ダイジェスト |
| `taste workbench` | オペレーター向けWebインターフェースの開始 |

詳細な使用方法については、`taste --help` または `taste <コマンド> --help` を実行してください。

## アーキテクチャ

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

## サポートされているプラットフォーム

- **OS:** Windows、macOS、Linux
- **実行環境:** Node.js >= 20
- **LLM:** Ollama (ローカル) - qwen2.5:14b で動作確認済み

## ライセンス

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://github.com/mcp-tool-shop-org">mcp-tool-shop</a>
</p>
