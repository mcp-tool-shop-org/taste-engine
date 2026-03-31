<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Taste Engine analiza la documentación de un repositorio (READMEs, documentación de arquitectura, notas de diseño), extrae declaraciones clave mediante un análisis exhaustivo con modelos de lenguaje, y utiliza esta información para revisar cualquier nuevo componente y verificar su conformidad. Cuando se detecta una desviación, genera sugerencias de corrección o redirecciones completas, todo ello ejecutándose localmente contra Ollama, sin necesidad de una API de pago.

## Modelo de Amenazas

Taste Engine opera **únicamente de forma local**. Lee archivos de proyecto del disco, almacena el estado de trabajo en una base de datos SQLite local (`.taste/taste.db`) y en archivos JSON de referencia (`canon/`). La única conexión de red es a una instancia local de Ollama en `127.0.0.1:11434`. La interfaz de usuario opcional (workbench) se conecta a `localhost:3200`. No se recopila telemetría. No se manejan contraseñas ni credenciales. Ningún dato sale de su máquina.

## Instalación

```bash
npm install -g @mcptoolshop/taste-engine
```

Requiere [Node.js](https://nodejs.org/) >= 20 y [Ollama](https://ollama.ai/) instalado localmente con un modelo descargado (por ejemplo, `ollama pull qwen2.5:14b`).

## Guía de inicio rápido

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

## ¿Qué hace?

**Extracción:** — 8 análisis especializados que examinan sus documentos fuente en busca de tesis, reglas de diseño, patrones anti, convenciones de estilo/nomenclatura, y más. La detección de duplicados mediante la similitud de Jaccard consolida los hallazgos superpuestos.

**Curación:** — Curación con intervención humana: acepta, rechaza, edita, fusiona o pospone los candidatos extraídos. Resuelve contradicciones. Congela versiones para revisiones reproducibles.

**Revisión:** — Asigna puntuaciones a los componentes en 4 dimensiones (preservación de la tesis, fidelidad al patrón, colisión de patrones anti, adecuación del estilo/nomenclatura). Un sistema de evaluación determinista (alineado → mayormente_alineado → susceptible_de_corrección → desviación_grave → contradicción) anula el modelo; las reglas no pueden ser ignoradas.

**Corrección:** — Tres modos de corrección según la gravedad de la desviación:
- **Parche** (1A) — Ediciones mínimas para corregir desviaciones superficiales.
- **Estructural** (1B) — Extracción de objetivos + diagnóstico de fallos + reemplazo de conceptos.
- **Redirección** (2C) — Redirección completa de objetivos con 2-3 alternativas compatibles con la referencia.

**Control:** — Modos de aplicación (informativo/advertencia/obligatorio) con códigos de salida de CI, registros de anulaciones y doctrina de promoción por tipo de componente.

**Portafolio:** — Incorpora repositorios con configuraciones predefinidas, detecta familias de desviaciones en proyectos, realiza un seguimiento de los patrones de adopción y genera recomendaciones.

**Organización:** — Panel de control para la implementación en varios repositorios: colas de promoción, disparadores de democión, motor de alertas de 7 categorías, acciones de vista previa/aplicación/reversión con registros de auditoría.

**Torre de control:** — Detección de cambios basada en instantáneas con un motor delta y generación de resúmenes para una conciencia operativa diaria.

**Entorno de trabajo:** — Interfaz de usuario de React con tema oscuro en localhost:3200, con 13 puntos finales de API para la matriz de la organización, colas, detalles del repositorio y gestión de acciones.

## Referencia de la línea de comandos

68 comandos organizados en los siguientes grupos:

| Grupo | Comandos |
|-------|----------|
| `taste init` | Inicializar proyecto |
| `taste doctor` | Comprobación de estado del entorno |
| `taste ingest` | Importar componentes fuente |
| `taste canon` | Estado y gestión de la referencia |
| `taste extract` | Ejecutar extracción, ver candidatos/contradicciones/ejemplos |
| `taste curate` | Cola, aceptar, rechazar, editar, fusionar, congelar |
| `taste review` | Ejecutar revisiones, listar resultados, ver paquetes |
| `taste calibrate` | Comentarios, resumen, declaraciones, hallazgos |
| `taste revise` | Parche de revisión con re-evaluación |
| `taste repair` | Corrección estructural para desviaciones profundas |
| `taste redirect` | Redirección de objetivos para componentes irrecuperables |
| `taste gate` | Ejecutar control, gestionar políticas, registrar anulaciones, generar informe de implementación |
| `taste onboard` | Incorporación de repositorios, informes, recomendaciones |
| `taste portfolio` | Matriz entre repositorios, hallazgos, exportación |
| `taste org` | Matriz de la organización, colas, alertas, acciones (vista previa/aplicación/reversión) |
| `taste watchtower` | Escaneo, historial, delta, resumen |
| `taste workbench` | Interfaz de usuario web para operadores. |

Ejecute `taste --help` o `taste <comando> --help` para obtener información completa sobre el uso.

## Arquitectura

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

## Plataformas soportadas

- **Sistema operativo:** Windows, macOS, Linux
- **Entorno de ejecución:** Node.js >= 20
- **Modelo de lenguaje (LLM):** Ollama (local) — probado con qwen2.5:14b

## Licencia

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://github.com/mcp-tool-shop-org">mcp-tool-shop</a>
</p>
