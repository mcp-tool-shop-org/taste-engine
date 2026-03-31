<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Taste Engine analyse le contenu d'un dépôt (README, documentation d'architecture, notes de conception), extrait les affirmations clés grâce à une analyse multi-pass effectuée par un modèle de langage, et utilise cet ensemble de règles pour vérifier la conformité de tout nouvel élément. Lorsqu'un écart est détecté, il génère des suggestions de correction ou des redirections complètes, le tout fonctionnant localement avec Ollama, sans nécessiter d'API payante.

## Modèle de menace

Taste Engine fonctionne **uniquement localement**. Il lit les fichiers du projet à partir du disque, stocke l'état de travail dans une base de données SQLite locale (`.taste/taste.db`) et dans des fichiers canon JSON (`canon/`). La seule connexion réseau est vers une instance locale d'Ollama à l'adresse `127.0.0.1:11434`. L'interface utilisateur optionnelle (workbench) est accessible à l'adresse `localhost:3200`. Aucune donnée de télémétrie n'est collectée. Aucun secret ou identifiant n'est géré. Aucune donnée ne quitte votre machine.

## Installation

```bash
npm install -g @mcptoolshop/taste-engine
```

Nécessite [Node.js](https://nodejs.org/) >= 20 et [Ollama](https://ollama.ai/) installé localement avec un modèle téléchargé (par exemple, `ollama pull qwen2.5:14b`).

## Démarrage rapide

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

## Ce que cela fait

**Extraction** : 8 analyses spécialisées de vos documents sources pour identifier les thèses, les règles de conception, les anti-patterns, les conventions de style/noms, et plus encore. La détection de doublons via la similarité de Jaccard consolide les résultats.

**Curatelle** : Curatelle par intervention humaine : accepter, rejeter, modifier, fusionner ou différer les éléments extraits. Résoudre les contradictions. Geler les versions pour des revues reproductibles.

**Revue** : Évaluation des éléments selon 4 dimensions (préservation de la thèse, fidélité aux modèles, collision avec les anti-patterns, conformité au style/noms). Un système de notation déterministe (aligné → principalement_aligné → susceptible_de_correction → écart_important → contradiction) prime sur le modèle : les règles ne peuvent pas être ignorées.

**Correction** : Trois modes de correction en fonction de la gravité de l'écart :
- **Correctif** (1A) : Modifications minimales pour corriger les écarts superficiels.
- **Structurale** (1B) : Extraction des objectifs + diagnostic des défauts + remplacement des concepts.
- **Redirection** (2C) : Redirection complète des objectifs avec 2 à 3 alternatives compatibles avec les règles.

**Contrôle** : Modes d'application (informatif/avertissement/obligatoire) avec codes de sortie pour l'intégration continue, enregistrement des exceptions et doctrine d'application par type d'élément.

**Portfolio** : Intégration des dépôts avec des paramètres de politique prédéfinis, détection des familles d'écarts entre les projets, suivi des modèles d'évolution, génération de recommandations d'adoption.

**Organisation** : Plan de contrôle pour le déploiement multi-dépôts : files d'attente de promotion, déclencheurs de rétrogradation, moteur d'alerte à 7 catégories, actions de prévisualisation/application/annulation avec enregistrement des exceptions.

**Tour de garde** : Détection des modifications basée sur des instantanés avec un moteur delta et génération de résumés pour une connaissance opérationnelle quotidienne.

**Tableau de bord** : Interface utilisateur React avec thème sombre accessible à l'adresse localhost:3200, avec 13 points d'accès API pour la matrice de l'organisation, les files d'attente, les détails du dépôt et la gestion des actions.

## Référence de la ligne de commande

68 commandes organisées en ces groupes :

| Groupe | Commandes |
|-------|----------|
| `taste init` | Initialisation du projet |
| `taste doctor` | Vérification de l'état de l'environnement |
| `taste ingest` | Importation des éléments sources |
| `taste canon` | État et gestion des règles |
| `taste extract` | Exécution de l'extraction, affichage des candidats/contradictions/exemples |
| `taste curate` | File d'attente, acceptation, rejet, modification, fusion, gel |
| `taste review` | Exécution des revues, liste des résultats, affichage des rapports |
| `taste calibrate` | Commentaires, résumé, affirmations, résultats |
| `taste revise` | Correction avec nouvelle revue |
| `taste repair` | Correction structurelle pour les écarts importants |
| `taste redirect` | Redirection des objectifs pour les éléments irrécupérables |
| `taste gate` | Exécution du contrôle, gestion de la politique, enregistrement des exceptions, rapport de déploiement |
| `taste onboard` | Intégration des dépôts, rapports, recommandations |
| `taste portfolio` | Matrice inter-dépôts, résultats, exportation |
| `taste org` | Matrice de l'organisation, files d'attente, alertes, actions (prévisualisation/application/annulation) |
| `taste watchtower` | Analyse, historique, delta, résumé |
| `taste workbench` | Interface utilisateur web pour les opérateurs. |

Exécutez `taste --help` ou `taste <commande> --help` pour obtenir la documentation complète sur l'utilisation.

## Architecture

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

## Plateformes supportées

- **Système d'exploitation :** Windows, macOS, Linux
- **Environnement d'exécution :** Node.js >= 20
- **LLM :** Ollama (local) — testé avec qwen2.5:14b

## Licence

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://github.com/mcp-tool-shop-org">mcp-tool-shop</a>
</p>
