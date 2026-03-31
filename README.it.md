<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Taste Engine analizza la documentazione di un repository (README, documentazione architetturale, note di progettazione), estrae le dichiarazioni fondamentali attraverso un'analisi multi-livello basata su modelli linguistici (LLM) e utilizza queste informazioni curate per verificare la conformità di qualsiasi nuovo elemento. Quando viene rilevata una deviazione, genera suggerimenti di correzione o reindirizzamenti completi, il tutto eseguito localmente utilizzando Ollama, senza la necessità di API a pagamento.

## Modello di rischio

Taste Engine opera **esclusivamente in locale**. Legge i file del progetto dal disco, memorizza lo stato di lavoro in un database SQLite locale (`.taste/taste.db`) e in file JSON di riferimento (`canon/`). L'unica connessione di rete è verso un'istanza locale di Ollama all'indirizzo `127.0.0.1:11434`. L'interfaccia utente opzionale (workbench) è accessibile all'indirizzo `localhost:3200`. Non vengono raccolti dati di telemetria. Non vengono gestiti segreti o credenziali. Nessun dato lascia la tua macchina.

## Installazione

```bash
npm install -g @mcptoolshop/taste-engine
```

Richiede [Node.js](https://nodejs.org/) >= 20 e [Ollama](https://ollama.ai/) installato localmente con un modello scaricato (ad esempio, `ollama pull qwen2.5:14b`).

## Guida rapida

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

## Cosa fa

**Estrazione** — 8 analisi specializzate dei tuoi documenti sorgente per identificare tesi, regole di progettazione, anti-pattern, convenzioni di stile/nomi e altro. Il rilevamento di duplicati tramite la similarità di Jaccard consolida i risultati sovrapposti.

**Curazione** — Curazione con intervento umano: accettare, rifiutare, modificare, unire o rimandare i candidati estratti. Risolvere le contraddizioni. Congelare le versioni per revisioni riproducibili.

**Revisione** — Valutazione degli elementi in 4 dimensioni (preservazione della tesi, fedeltà ai pattern, collisione con anti-pattern, conformità allo stile/nomi). Un sistema di giudizio deterministico (allineato → prevalentemente_allineato → correggibile → deviazione_significativa → contraddizione) prevale sul modello: le regole non possono essere ignorate.

**Correzione** — Tre modalità di correzione in base alla gravità della deviazione:
- **Patch** (1A) — Modifiche minime per correggere deviazioni superficiali
- **Strutturale** (1B) — Estrazione degli obiettivi + diagnosi dei difetti + sostituzione dei concetti
- **Reindirizzamento** (2C) — Reindirizzamento completo degli obiettivi con 2-3 alternative compatibili con i riferimenti.

**Controllo** — Modalità di applicazione (informativa/avviso/obbligatoria) con codici di uscita per sistemi di integrazione continua (CI), ricevute di override e politiche di promozione per ogni tipo di elemento.

**Portfolio** — Integrazione di repository con impostazioni predefinite, rilevamento di famiglie di deviazioni tra progetti, monitoraggio dei modelli di avanzamento, generazione di raccomandazioni di adozione.

**Organizzazione** — Piattaforma di controllo per la distribuzione multi-repository: code di promozione, trigger di demozione, motore di avvisi a 7 categorie, azioni di anteprima/applicazione/rollback con ricevute di audit.

**Torre di controllo** — Rilevamento di modifiche basato su snapshot con motore delta e generazione di riepiloghi per una consapevolezza operativa quotidiana.

**Ambiente di lavoro** — Interfaccia utente React a tema scuro disponibile all'indirizzo localhost:3200, con 13 endpoint API per la matrice dell'organizzazione, le code, i dettagli del repository e la gestione delle azioni.

## Riferimento della CLI

68 comandi organizzati in questi gruppi:

| Gruppo | Comandi |
|-------|----------|
| `taste init` | Inizializzazione del progetto |
| `taste doctor` | Controllo dello stato dell'ambiente |
| `taste ingest` | Importazione di elementi sorgente |
| `taste canon` | Stato e gestione dei riferimenti |
| `taste extract` | Esecuzione dell'estrazione, visualizzazione di candidati/contraddizioni/esempi |
| `taste curate` | Code, accettazione, rifiuto, modifica, unione, congelamento |
| `taste review` | Esecuzione delle revisioni, elenco dei risultati, visualizzazione dei pacchetti |
| `taste calibrate` | Feedback, riepilogo, dichiarazioni, risultati |
| `taste revise` | Correzione con revisione |
| `taste repair` | Correzione strutturale per deviazioni profonde |
| `taste redirect` | Reindirizzamento degli obiettivi per elementi non correggibili |
| `taste gate` | Esecuzione del controllo, gestione delle politiche, registrazione degli override, report di distribuzione |
| `taste onboard` | Integrazione dei repository, report, raccomandazioni |
| `taste portfolio` | Matrice cross-repository, risultati, esportazione |
| `taste org` | Matrice dell'organizzazione, code, avvisi, azioni (anteprima/applicazione/rollback) |
| `taste watchtower` | Scansione, cronologia, delta, riepilogo |
| `taste workbench` | Interfaccia utente web per l'operatore. |

Eseguire `taste --help` o `taste <comando> --help` per visualizzare tutte le opzioni.

## Architettura

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

## Piattaforme supportate

- **Sistema operativo:** Windows, macOS, Linux
- **Runtime:** Node.js >= 20
- **LLM:** Ollama (locale) — testato con qwen2.5:14b

## Licenza

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://github.com/mcp-tool-shop-org">mcp-tool-shop</a>
</p>
