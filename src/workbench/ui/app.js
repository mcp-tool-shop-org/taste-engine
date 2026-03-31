import { createElement as h, useState, useEffect, Fragment } from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';

const API = 'http://localhost:3200/api';

async function get(path) { return (await fetch(`${API}${path}`)).json(); }
async function post(path, body) { return (await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(); }

function Badge({ text, className }) {
  return h('span', { className: `badge ${className}` }, text);
}

// ── Org Matrix Page ──────────────────────────────────────────

function OrgMatrix({ onSelectRepo }) {
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState(null);

  useEffect(() => {
    get('/org/matrix').then(setData);
    get('/org/alerts').then(setAlerts);
  }, []);

  if (!data) return h('div', { className: 'empty' }, 'Loading...');

  return h(Fragment, null,
    h('div', { className: 'stats' },
      h('div', { className: 'stat' }, h('div', { className: 'stat-value' }, data.summary.total), h('div', { className: 'stat-label' }, 'Repos')),
      h('div', { className: 'stat' }, h('div', { className: 'stat-value' }, data.summary.gate_ready), h('div', { className: 'stat-label' }, 'Gate Ready')),
      h('div', { className: 'stat' }, h('div', { className: 'stat-value' }, data.summary.total_statements), h('div', { className: 'stat-label' }, 'Canon Statements')),
      alerts && h('div', { className: 'stat' }, h('div', { className: 'stat-value' }, alerts.counts.critical + alerts.counts.warning), h('div', { className: 'stat-label' }, 'Active Alerts')),
    ),
    h('table', null,
      h('thead', null, h('tr', null,
        h('th', null, 'Repo'), h('th', null, 'Canon'), h('th', null, 'Statements'), h('th', null, 'Gate'), h('th', null, 'Surfaces'), h('th', null, 'Risks'),
      )),
      h('tbody', null, data.statuses.map(r =>
        h('tr', { key: r.slug, style: { cursor: 'pointer' }, onClick: () => onSelectRepo(r.slug) },
          h('td', { style: { fontWeight: 600 } }, r.slug),
          h('td', null, h(Badge, { text: r.canon_confidence, className: r.canon_confidence })),
          h('td', null, r.statement_count),
          h('td', null, r.gate_ready ? 'Ready' : 'Not Ready'),
          h('td', null, h('div', { className: 'surfaces' },
            ...Object.entries(r.surfaces).filter(([_, m]) => m !== 'advisory').map(([s, m]) =>
              h(Badge, { key: s, text: `${s.split('_')[0]}: ${m}`, className: m })
            ),
          )),
          h('td', null, r.risk_flags.length > 0 ? h('span', { className: 'risk' }, r.risk_flags.join(', ')) : '-'),
        )
      )),
    ),
  );
}

// ── Queue Page ───────────────────────────────────────────────

function QueuePage({ onApply }) {
  const [data, setData] = useState(null);

  useEffect(() => { get('/org/queue').then(setData); }, []);

  if (!data) return h('div', { className: 'empty' }, 'Loading...');
  if (data.promotions.length === 0 && data.demotions.length === 0) return h('div', { className: 'empty' }, 'No actionable items');

  return h(Fragment, null,
    data.recommendations.map((r, i) =>
      h('div', { key: i, className: 'card' },
        h('div', { className: 'card-header' },
          h('span', null, h('strong', null, r.surface ? `${r.repo_slug}/${r.surface}` : r.repo_slug), ' ', h(Badge, { text: r.action, className: r.priority === 'high' ? 'critical' : 'info' })),
          r.action === 'promote' && h('button', { className: 'action-btn', onClick: () => onApply(r) }, 'Apply'),
        ),
        h('div', { style: { color: '#8b949e', fontSize: 13 } }, r.description),
      )
    ),
  );
}

// ── Repo Detail Page ─────────────────────────────────────────

function RepoDetail({ slug, onBack }) {
  const [data, setData] = useState(null);

  useEffect(() => { get(`/org/repo/${slug}`).then(setData); }, [slug]);

  if (!data) return h('div', { className: 'empty' }, 'Loading...');

  const { repo, alerts, actions } = data;

  return h(Fragment, null,
    h('button', { className: 'action-btn', onClick: onBack, style: { marginBottom: 16 } }, 'Back'),
    h('h2', null, repo.name, ' ', h(Badge, { text: repo.canon_confidence, className: repo.canon_confidence })),
    h('div', { className: 'card' },
      h('h3', null, 'Canon'),
      h('div', null, `${repo.statement_count} statements | Version: ${repo.canon_version || 'none'}`),
      h('div', null, `Gate: ${repo.gate_ready ? 'Ready' : 'Not ready'}`),
    ),
    h('div', { className: 'card' },
      h('h3', null, 'Surfaces'),
      h('div', { className: 'surfaces', style: { gap: 8 } },
        ...Object.entries(repo.surfaces).map(([s, m]) =>
          h('div', { key: s, style: { marginBottom: 4 } }, s, ': ', h(Badge, { text: m, className: m }))
        ),
      ),
    ),
    alerts.length > 0 && h('div', { className: 'card' },
      h('h3', null, `Alerts (${alerts.length})`),
      ...alerts.map((a, i) => h('div', { key: i, style: { marginBottom: 8 } },
        h(Badge, { text: a.severity, className: a.severity }), ' ', a.title,
        h('div', { style: { color: '#8b949e', fontSize: 12, marginLeft: 8 } }, a.recommended_action),
      )),
    ),
    repo.risk_flags.length > 0 && h('div', { className: 'card' },
      h('h3', null, 'Risks'),
      ...repo.risk_flags.map((r, i) => h('div', { key: i, className: 'risk' }, r)),
    ),
    actions.length > 0 && h('div', { className: 'card' },
      h('h3', null, 'Actions'),
      ...actions.map((a, i) => h('div', { key: i, style: { marginBottom: 8 } },
        h(Badge, { text: a.status, className: a.status }), ' ',
        `[${a.kind}] ${a.surface || ''} ${a.from_mode || ''} -> ${a.to_mode || ''}`,
        h('div', { style: { color: '#8b949e', fontSize: 12 } }, a.reason),
      )),
    ),
    repo.override_count > 0 && h('div', { className: 'card' },
      h('h3', null, 'Overrides'),
      h('div', null, `${repo.override_count} override(s) recorded`),
    ),
  );
}

// ── Action History Page ──────────────────────────────────────

function ActionHistory({ onRollback }) {
  const [data, setData] = useState(null);

  useEffect(() => { get('/org/actions/history').then(setData); }, []);

  if (!data) return h('div', { className: 'empty' }, 'Loading...');
  if (data.actions.length === 0) return h('div', { className: 'empty' }, 'No actions yet');

  return h('table', null,
    h('thead', null, h('tr', null,
      h('th', null, 'Status'), h('th', null, 'Action'), h('th', null, 'Target'), h('th', null, 'Change'), h('th', null, 'Reason'), h('th', null, ''),
    )),
    h('tbody', null, data.actions.map(a =>
      h('tr', { key: a.id },
        h('td', null, h(Badge, { text: a.status, className: a.status })),
        h('td', null, a.kind),
        h('td', { className: 'mono' }, a.surface ? `${a.repo_slug}/${a.surface}` : a.repo_slug),
        h('td', null, a.from_mode && a.to_mode ? `${a.from_mode} -> ${a.to_mode}` : '-'),
        h('td', { style: { maxWidth: 300, fontSize: 12 } }, a.reason),
        h('td', null, a.status === 'applied' && h('button', { className: 'action-btn danger', onClick: () => onRollback(a) }, 'Rollback')),
      )
    )),
  );
}

// ── Apply Modal ──────────────────────────────────────────────

function ApplyModal({ action, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (action.surface) {
      const toMode = action.action === 'demote' ? 'advisory' : (action.description.includes('required') ? 'required' : 'warn');
      post('/org/actions/preview', { repo: action.repo_slug, surface: action.surface, to: toMode }).then(setPreview);
    }
  }, [action]);

  const toMode = action.description.includes('required') ? 'required' : 'warn';

  return h('div', { className: 'modal-overlay', onClick: onClose },
    h('div', { className: 'modal', onClick: e => e.stopPropagation() },
      h('h2', null, 'Apply Action'),
      h('div', { style: { marginBottom: 12 } },
        h('strong', null, `${action.repo_slug}/${action.surface}`), ': ',
        preview ? preview.policy_diff : 'Loading...',
      ),
      h('div', { style: { marginBottom: 8, color: '#8b949e' } }, action.description),
      h('textarea', { placeholder: 'Reason for this action...', value: reason, onChange: e => setReason(e.target.value) }),
      h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        h('button', { className: 'action-btn', style: { background: '#21262d' }, onClick: onClose }, 'Cancel'),
        h('button', { className: 'action-btn', disabled: !reason, onClick: () => onConfirm({ repo: action.repo_slug, surface: action.surface, to: toMode, reason }) }, 'Apply'),
      ),
    ),
  );
}

// ── Rollback Modal ───────────────────────────────────────────

function RollbackModal({ action, onClose, onConfirm }) {
  const [reason, setReason] = useState('');

  return h('div', { className: 'modal-overlay', onClick: onClose },
    h('div', { className: 'modal', onClick: e => e.stopPropagation() },
      h('h2', null, 'Rollback Action'),
      h('div', { style: { marginBottom: 12 } },
        h('strong', null, `${action.repo_slug}/${action.surface || ''}`), ': ',
        `${action.from_mode} -> ${action.to_mode}`,
      ),
      h('textarea', { placeholder: 'Reason for rollback...', value: reason, onChange: e => setReason(e.target.value) }),
      h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        h('button', { className: 'action-btn', style: { background: '#21262d' }, onClick: onClose }, 'Cancel'),
        h('button', { className: 'action-btn danger', disabled: !reason, onClick: () => onConfirm({ id: action.id, reason }) }, 'Rollback'),
      ),
    ),
  );
}

// ── App ──────────────────────────────────────────────────────

function App() {
  const [page, setPage] = useState('matrix');
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [applyTarget, setApplyTarget] = useState(null);
  const [rollbackTarget, setRollbackTarget] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey(k => k + 1);

  const handleApply = async (opts) => {
    await post('/org/actions/apply', opts);
    setApplyTarget(null);
    refresh();
  };

  const handleRollback = async (opts) => {
    await post('/org/actions/rollback', opts);
    setRollbackTarget(null);
    refresh();
  };

  let content;
  if (selectedRepo) {
    content = h(RepoDetail, { key: refreshKey, slug: selectedRepo, onBack: () => setSelectedRepo(null) });
  } else if (page === 'matrix') {
    content = h(OrgMatrix, { key: refreshKey, onSelectRepo: setSelectedRepo });
  } else if (page === 'queue') {
    content = h(QueuePage, { key: refreshKey, onApply: setApplyTarget });
  } else if (page === 'history') {
    content = h(ActionHistory, { key: refreshKey, onRollback: setRollbackTarget });
  }

  return h('div', { className: 'app' },
    h('h1', null, 'Taste Engine'),
    h('div', { className: 'subtitle' }, 'Operator Workbench'),
    h('nav', null,
      h('button', { className: page === 'matrix' && !selectedRepo ? 'active' : '', onClick: () => { setPage('matrix'); setSelectedRepo(null); } }, 'Org Matrix'),
      h('button', { className: page === 'queue' ? 'active' : '', onClick: () => { setPage('queue'); setSelectedRepo(null); } }, 'Queue'),
      h('button', { className: page === 'history' ? 'active' : '', onClick: () => { setPage('history'); setSelectedRepo(null); } }, 'History'),
    ),
    content,
    applyTarget && h(ApplyModal, { action: applyTarget, onClose: () => setApplyTarget(null), onConfirm: handleApply }),
    rollbackTarget && h(RollbackModal, { action: rollbackTarget, onClose: () => setRollbackTarget(null), onConfirm: handleRollback }),
  );
}

createRoot(document.getElementById('root')).render(h(App));
