<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
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

O Taste Engine analisa a documentação de um repositório (READMEs, documentação da arquitetura, notas de design), extrai declarações importantes por meio de análise avançada de modelos de linguagem (LLM) e utiliza essa informação para verificar se novos componentes estão em conformidade com as diretrizes. Quando são detectadas divergências, ele gera sugestões de correção ou redirecionamentos completos, tudo executado localmente usando o Ollama, sem a necessidade de APIs pagas.

## Modelo de Ameaças

O Taste Engine opera **exclusivamente localmente**. Ele lê arquivos do projeto do disco, armazena o estado de trabalho em um banco de dados SQLite local (`.taste/taste.db`) e em arquivos JSON de referência (`canon/`). A única conexão de rede é para uma instância local do Ollama em `127.0.0.1:11434`. A interface de usuário opcional (workbench) está disponível em `localhost:3200`. Nenhuma informação de telemetria é coletada. Segredos ou credenciais não são gerenciados. Nenhum dado sai da sua máquina.

## Instalação

```bash
npm install -g @mcptoolshop/taste-engine
```

Requer [Node.js](https://nodejs.org/) >= 20 e [Ollama](https://ollama.ai/) instalado localmente, com um modelo baixado (por exemplo, `ollama pull qwen2.5:14b`).

## Início Rápido

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

## O que ele faz

**Extração** — 8 etapas especializadas analisam seus documentos para identificar declarações de tese, regras de design, padrões anti, convenções de estilo/nomenclatura e muito mais. A detecção de duplicatas, por meio da similaridade de Jaccard, consolida resultados sobrepostos.

**Curadoria** — Curadoria com intervenção humana: aceite, rejeite, edite, mescle ou adie os candidatos extraídos. Resolva contradições. Congele versões para revisões reproduzíveis.

**Revisão** — Avalia os componentes em 4 dimensões (preservação da tese, fidelidade aos padrões, detecção de padrões anti, adequação do estilo/nomenclatura). Uma sequência de verificação determinística (alinhado → alinhado_parcialmente → com_possibilidade_de_correção → divergência_significativa → contradição) substitui o modelo — as regras não podem ser ignoradas.

**Correção** — Três modos de correção com base na gravidade da divergência:
- **Correção** (1A) — Pequenas alterações para corrigir divergências superficiais.
- **Estrutural** (1B) — Extração de objetivos + diagnóstico de falhas + substituição de conceitos.
- **Redirecionamento** (2C) — Redirecionamento completo dos objetivos com 2 a 3 alternativas compatíveis com as diretrizes.

**Validação** — Modos de aplicação (informativo/alerta/obrigatório) com códigos de saída para integração contínua, registro de substituições e diretrizes de promoção por tipo de componente.

**Portfólio** — Adiciona repositórios com configurações predefinidas, detecta famílias de divergências entre projetos, acompanha a evolução, gera recomendações de adoção.

**Organização** — Painel de controle para implantação em vários repositórios: filas de promoção, gatilhos de despromoção, sistema de alertas com 7 categorias, ações de visualização/aplicação/reversão com registro de auditoria.

**Torre de Vigilância** — Detecção de alterações baseada em snapshots com um mecanismo de cálculo de diferenças (delta) e geração de resumos para monitoramento operacional diário.

**Ambiente de Trabalho** — Interface de usuário React com tema escuro em localhost:3200, com 13 pontos de extremidade de API para gerenciamento de matriz de organização, filas, detalhes do repositório e ações.

## Referência da Linha de Comando

68 comandos organizados nos seguintes grupos:

| Grupo | Comandos |
|-------|----------|
| `taste init` | Inicializar projeto |
| `taste doctor` | Verificação de saúde do ambiente |
| `taste ingest` | Importar artefatos de origem |
| `taste canon` | Status e gerenciamento das diretrizes |
| `taste extract` | Executar extração, visualizar candidatos/contradições/exemplos |
| `taste curate` | Filas, aceitar, rejeitar, editar, mesclar, congelar |
| `taste review` | Executar revisões, listar resultados, visualizar pacotes |
| `taste calibrate` | Feedback, resumo, declarações, descobertas |
| `taste revise` | Correção de revisão com reavaliação |
| `taste repair` | Correção estrutural para divergências profundas |
| `taste redirect` | Redirecionamento de objetivos para componentes irrecuperáveis |
| `taste gate` | Executar validação, gerenciar políticas, registrar substituições, gerar relatório de implantação |
| `taste onboard` | Integração de repositórios, relatórios, recomendações |
| `taste portfolio` | Matriz entre repositórios, descobertas, exportação |
| `taste org` | Matriz da organização, filas, alertas, ações (visualização/aplicação/reversão) |
| `taste watchtower` | Verificação, histórico, diferenças, resumo |
| `taste workbench` | Interface web para operadores. |

Execute `taste --help` ou `taste <comando> --help` para obter informações completas sobre o uso.

## Arquitetura

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

## Plataformas suportadas

- **Sistema Operacional:** Windows, macOS, Linux
- **Ambiente de execução:** Node.js >= 20
- **Modelo de Linguagem (LLM):** Ollama (local) — testado com qwen2.5:14b

## Licença

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://github.com/mcp-tool-shop-org">mcp-tool-shop</a>
</p>
