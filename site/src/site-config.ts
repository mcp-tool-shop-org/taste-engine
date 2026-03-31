import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'Taste Engine',
  description: 'Canon-and-judgment system for creative and product work — extract doctrine, detect drift, repair alignment. Ollama-first, local-only.',
  logoBadge: 'TE',
  brandName: 'taste-engine',
  repoUrl: 'https://github.com/mcp-tool-shop-org/taste-engine',
  npmUrl: 'https://www.npmjs.com/package/@mcptoolshop/taste-engine',
  footerText: 'MIT Licensed — built by <a href="https://github.com/mcp-tool-shop-org" style="color:var(--color-muted);text-decoration:underline">mcp-tool-shop-org</a>',

  hero: {
    badge: 'Open source',
    headline: 'Taste',
    headlineAccent: 'Engine.',
    description: 'Ingest doctrine. Extract canon. Detect drift. Repair alignment. All local, all Ollama, no paid API.',
    primaryCta: { href: '#usage', label: 'Get started' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
    previews: [
      { label: 'Install', code: 'npm install -g @mcptoolshop/taste-engine' },
      { label: 'Init', code: 'taste init my-project && taste doctor' },
      { label: 'Review', code: 'taste ingest README.md && taste extract run && taste review run artifact.md' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'Features',
      subtitle: 'From doctrine extraction to org-wide rollout.',
      features: [
        { title: 'Multi-Pass Extraction', desc: '8 specialized LLM passes extract thesis statements, design rules, anti-patterns, voice conventions, and more from your source docs.' },
        { title: 'Deterministic Verdicts', desc: 'Rule-backed verdict ladder (aligned → contradiction) that the model cannot override. Rules always win.' },
        { title: '4-Dimension Scoring', desc: 'Every artifact is scored on thesis preservation, pattern fidelity, anti-pattern collision, and voice/naming fit.' },
        { title: '3-Mode Repair', desc: 'Patch edits for surface drift, structural repair for deep misalignment, goal redirection for irreparable artifacts.' },
        { title: 'Workflow Gate', desc: 'Advisory, warn, or required enforcement modes with CI exit codes, override receipts, and promotion doctrine.' },
        { title: 'Portfolio Intelligence', desc: 'Cross-repo drift families, graduation patterns, preset fit analysis, and adoption recommendations.' },
        { title: 'Org Control Plane', desc: 'Promotion queues, demotion triggers, 7-category alerts, preview/apply/rollback actions with audit receipts.' },
        { title: 'Operator Workbench', desc: 'Dark-theme React UI at localhost:3200 for daily operational awareness across your entire portfolio.' },
        { title: 'Ollama-First', desc: 'Runs entirely against local Ollama. No cloud API, no paid tokens, no data leaves your machine.' },
      ],
    },
    {
      kind: 'code-cards',
      id: 'usage',
      title: 'Usage',
      cards: [
        { title: 'Install', code: 'npm install -g @mcptoolshop/taste-engine\n\n# Requires Ollama running locally\nollama pull qwen2.5:14b' },
        { title: 'Extract canon', code: 'taste init my-project\ntaste ingest README.md docs/architecture.md\ntaste extract run\ntaste curate queue\ntaste curate accept <id>' },
        { title: 'Review artifacts', code: 'taste curate freeze --tag v1\ntaste review run path/to/artifact.md\ntaste gate run' },
        { title: 'Org rollout', code: 'taste org matrix --dir ./portfolio\ntaste org queue --dir ./portfolio\ntaste workbench --dir ./portfolio' },
      ],
    },
  ],
};
