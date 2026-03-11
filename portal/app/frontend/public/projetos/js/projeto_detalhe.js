function parseJsonMaybe(v){
  if (v == null) return null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    try { return JSON.parse(s); } catch { return null; }
  }
  return v;
}


function isPlanejarExecucaoTask(t){
  const titulo = String(t?.titulo || '').toLowerCase();
  // regra: tarefa fixa criada após aprovação do projeto
  return titulo.includes('planejar execução do projeto') || titulo.startsWith('planejar execução');
}

function buildProjetoCamposRows(p){
  const rows = [];
  const def = parseJsonMaybe(p?.definicao_json) || {};
  const answers = parseJsonMaybe(p?.campos_json) || {};
  const campos = (def.campos_projeto || def.camposProjeto || def.campos || def.perguntas || (def.form && def.form.campos) || []);
  if (Array.isArray(campos) && campos.length){
    campos.forEach((c, idx) => {
      const label = c.label || c.nome || c.titulo || c.pergunta || c.name || `Campo ${idx+1}`;
      const key = c.key || c.id || c.codigo || c.nome || c.name || label;
      const val = (answers && (answers[key] ?? answers[c.id] ?? answers[c.nome] ?? answers[c.name])) ?? null;
      rows.push([label, formatValueByFieldDef(val, c)]);
    });
  }
  return rows;
}


function formatValueByFieldDef(val, def){
  if (val == null || val === '') return '-';
  const tipo = String(def?.tipo || def?.type || '').toLowerCase();
  const opcoes = def?.opcoes || def?.options || def?.itens || null;
  if (opcoes && (tipo === 'select' || tipo === 'selecao' || tipo === 'dropdown')) {
    const arr = Array.isArray(opcoes) ? opcoes : [];
    const hit = arr.find(o => (o?.valor ?? o?.value) == val);
    if (hit) return String(hit?.label ?? hit?.nome ?? hit?.text ?? val);
  }
  if (Array.isArray(val)) return val.map(x => (x==null?'':String(x))).filter(Boolean).join(', ') || '-';
  if (typeof val === 'object') {
    try { return JSON.stringify(val); } catch { return String(val); }
  }
  return String(val);
}
// projeto_detalhe.js — Modern 2026 Version

const API = {
  me: '/api/me',
  projetos: (id) => `/api/projetos/${id}`,
  colunas: (id) => `/api/projetos/${id}/colunas`,
  timeline: (id) => `/api/projetos/${id}/timeline`,
  historico: (id) => `/api/projetos/${id}/historico`,
  aprovacoes: (query) => `/api/projetos/aprovacoes${query ? `?${query}` : ''}`,

  tarefas: (query) => `/api/tarefas${query ? `?${query}` : ''}`,
  criarTarefaNoProjeto: (id) => `/api/projetos/${id}/tarefas`,
  tarefa: (id) => `/api/tarefas/${id}`,
  aceitar: (id) => `/api/tarefas/${id}/aceitar`,
  recusar: (id) => `/api/tarefas/${id}/recusar`,
  finalizar: (id) => `/api/tarefas/${id}/finalizar`,

  aprovarAprovacao: (id) => `/api/projetos/aprovacoes/${id}/aprovar`,
  reprovarAprovacao: (id) => `/api/projetos/aprovacoes/${id}/reprovar`,
  cancelarProjeto: (id) => `/api/projetos/${id}/cancelar`,

  // Configurações (usado para vínculo Setores/Modelos/Modelos de tarefa)
  setoresCfg: () => `/api/projetos/setores?with_membros=1`,
  modelosCfg: () => `/api/projetos/modelos`,
  tarefasModelosCfg: () => `/api/projetos/tarefas-modelos`,
  anexos: (id) => `/api/tarefas/${id}/anexos`,
};

const token = localStorage.getItem('token') || null;

function ensureAuthOrRedirect() {
  const t = localStorage.getItem('token');
  if (!t) {
    location.href = '/login.html';
    throw new Error('Sem token');
  }
}

function qs(name) {
  const url = new URL(location.href);
  return url.searchParams.get(name);
}

function authHeaders(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function apiGet(url) {
  const r = await fetch(url, { headers: authHeaders() });
  if (r.status === 401) { localStorage.removeItem('token'); location.href = '/login.html'; throw await safeJson(r); }
  if (!r.ok) throw await safeJson(r);
  return r.json();
}

async function apiPost(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body || {})
  });
  if (r.status === 401) { localStorage.removeItem('token'); location.href = '/login.html'; throw await safeJson(r); }
  if (!r.ok) throw await safeJson(r);
  return r.json();
}

async function safeJson(r) {
  try { return await r.json(); } catch { return { error: `${r.status} ${r.statusText}` }; }
}

function el(id) { return document.getElementById(id); }
function txt(id, v) { const e = el(id); if (e) e.textContent = v ?? ''; }

function normalizeCamposDef(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.campos) ? parsed.campos : []);
    } catch {
      return [];
    }
  }
  // pg pode devolver objeto já parseado
  if (typeof raw === 'object') {
    if (Array.isArray(raw.campos)) return raw.campos;
  }
  return [];
}

function normalizeCamposVal(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  if (typeof raw === 'object') return raw;
  return {};
}

function isPlanejarTarefa(tarefa) {
  const t = (tarefa?.titulo || '').trim().toLowerCase();
  return t.startsWith('planejar');
}

function toggleNextUI() {
  const allow = !!_finalizarCtx?.allowNext;

  const head = el('finalizar-next-head');
  const empty = el('finalizar-next-empty');
  const list  = el('finalizar-next-list');
  const hint  = el('finalizar-next-hint');

  if (head) head.style.display = allow ? 'flex' : 'none';
  if (empty) empty.style.display = allow ? '' : 'none';
  if (list) list.style.display = allow ? '' : 'none';
  if (hint) hint.style.display = allow ? '' : 'none';

  if (hint) hint.style.display = allow ? 'none' : '';
}

function toast(msg, type = 'info') {
  // Simple alert for now
  if (type === 'error') console.error(msg);
  // alert(msg); 
}

function formatDate(dt) {
  if (!dt) return '-';
  const d = new Date(dt);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function badge(text, type = 'neutral') {
  const s = document.createElement('span');
  s.className = `pill ${type}`;
  s.textContent = text;
  return s;
}

/* ======================
   TAB LOGIC
   ====================== */
function setActiveTab(name) {
  document.querySelectorAll('.tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });

  const sections = ['triagem','tarefas','kanban','cronograma','dossie'];
  sections.forEach(s => {
    const sec = document.getElementById(`tab-${s}`);
    if (!sec) return;
    sec.classList.toggle('hidden', s !== name);
  });

  // lazy loads
  if (name === 'triagem') loadTriagem().catch(err => toast(err?.error || 'Falha ao carregar triagem', 'error'));
  if (name === 'dossie') loadDossie().catch(err => toast(err?.error || 'Falha ao carregar dossiê', 'error'));
}

document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.tab');
  if (btn) setActiveTab(btn.dataset.tab);

  const close = ev.target.closest('[data-close]');
  if (close) closeModal(close.dataset.close);
});

/* ======================
   MODAL HELPERS
   ====================== */
function openModal(id) {
  el('modal-backdrop')?.classList.remove('hidden');
  el(id)?.classList.remove('hidden');
}
function closeModal(id) {
  el(id)?.classList.add('hidden');
  el('modal-backdrop')?.classList.add('hidden');
}

/* ======================
   STATE
   ====================== */
const state = {
  ui: { addMode: null },
  projetoId: Number(qs('id') || 0),
  projeto: null,
  colunas: [],
  tarefas: [],

  cfg: {
    loaded: false,
    setores: [],
    modelos: [],
    modelosTarefa: [],
  },
  triagem: {
    pendentes: [],
    reprovarId: null,
  },
  dossie: {
    aprovacoes: [],
    timeline: [],
    tarefas: [],
  }
};

/* ======================
   INIT
   ====================== */
async function init() {
  try { if (window.checkAuth) await window.checkAuth(); } catch (e) {}
  try { if (window.guardProjetosAccess) window.guardProjetosAccess(); } catch (e) {}

  ensureAuthOrRedirect();

  bindUI();
  await loadMe();
  await reloadAll();

  // default: abre Tarefas
  setActiveTab('tarefas');
}

function bindUI() {
  el('btn-logout')?.addEventListener('click', () => {
    localStorage.removeItem('token');
    location.href = '/login.html';
  });

  el('btn-refresh')?.addEventListener('click', () => reloadAll().catch(err => toast(err?.error || 'Falha ao atualizar', 'error')));

  el('btn-filtrar')?.addEventListener('click', () => renderTarefas());
  el('btn-limpar')?.addEventListener('click', () => {
    el('f-text').value = '';
    el('f-status').value = '';
    el('f-tipo').value = '';
    renderTarefas();
  });

  el('btn-nova-tarefa')?.addEventListener('click', () => {
    (async () => {
      state.ui.addMode = 'create';
      const h = document.querySelector('#modal-next .modal-header h3');
      if (h) h.textContent = 'Nova Tarefa';
      await loadCfg();
      await openAddNextModal();
    })().catch(err => toast(err?.error || err?.message || 'Falha ao abrir modal', 'danger'));
  });
  el('btn-criar-tarefa')?.addEventListener('click', () => criarTarefa().catch(err => toast(err?.error || 'Falha ao criar tarefa', 'error')));

  el('btn-cancelar-projeto')?.addEventListener('click', () => {
    el('cancelar-confirmacao').value = '';
    el('cancelar-motivo').value = '';
    openModal('modal-cancelar');
  });
  el('btn-confirmar-cancelar')?.addEventListener('click', () => cancelarProjeto().catch(err => toast(err?.error || 'Falha ao cancelar', 'error')));

  el('btn-confirmar-reprovar')?.addEventListener('click', () => reprovarAprovacao().catch(err => toast(err?.error || 'Falha ao reprovar', 'error')));

  el('btn-recarregar-dossie')?.addEventListener('click', () => loadDossie().catch(err => toast(err?.error || 'Falha ao recarregar dossiê', 'error')));
  el('btn-print-dossie')?.addEventListener('click', () => window.print());

  // recusa (modal)
  el('btn-add-campo-recusar')?.addEventListener('click', () => addCampoRecusa());
  el('btn-confirmar-recusar')?.addEventListener('click', () => confirmarRecusa());
}


async function loadMe() {
  try {
    const me = await apiGet(API.me);
    txt('u-name', me?.nome || 'Usuário');
    txt('u-role', me?.role || me?.perfil || 'Admin');
    txt('u-avatar', (me?.nome || 'U').slice(0, 1).toUpperCase());
  } catch {
    // ignore
  }
}

async function reloadAll() {
  await Promise.all([
    loadProjeto(),
    loadColunas(),
    loadTarefas(),
    loadCfg(),
  ]);

  renderHeader();
  renderTarefas();
  renderKanban();
  renderCronograma();

  await loadUltimoMotivoTriagem();
  await loadDossie();
}

async function loadCfg() {
  if (state.cfg.loaded) return;
  try {
    const [setores, modelos, modelosTarefa] = await Promise.all([
      apiGet(API.setoresCfg()),
      apiGet(API.modelosCfg()),
      apiGet(API.tarefasModelosCfg()),
    ]);

    state.cfg.setores = (setores || []).map(s => ({ ...s, id: Number(s.id) }));
    state.cfg.modelos = (modelos || []).map(m => ({ ...m, id: Number(m.id) }));
    state.cfg.modelosTarefa = (modelosTarefa || []).map(m => ({ ...m, id: Number(m.id) }));

    state.cfg.loaded = true;
  } catch (e) {
    console.warn('Falha ao carregar configurações.', e);
  }
}

/* ======================
   LOADERS
   ====================== */
async function loadProjeto() {
  state.projeto = await apiGet(API.projetos(state.projetoId));
}

async function loadColunas() {
  state.colunas = await apiGet(API.colunas(state.projetoId));
}

async function loadTarefas() {
  const q = new URLSearchParams({ projeto_id: String(state.projetoId) });
  state.tarefas = await apiGet(API.tarefas(q.toString()));
}

async function loadUltimoMotivoTriagem() {
  try {
    const all = await apiGet(API.aprovacoes('')); 
    const doProjeto = (all || [])
      .filter(a => Number(a.projeto_id) === state.projetoId)
      .filter(a => String(a.origem || '').toUpperCase() === 'LEGACY')
      .filter(a => String(a.tipo || '').toUpperCase() === 'PROJETO');
    const reprov = doProjeto.filter(a => String(a.status).toUpperCase() === 'REPROVADO');
    reprov.sort((a,b) => new Date(b.aprovado_em || b.solicitado_em || 0) - new Date(a.aprovado_em || a.solicitado_em || 0));
    const last = reprov[0];
    txt('triagem-ultimo-motivo', last?.motivo || '-');
  } catch {
    txt('triagem-ultimo-motivo', '-');
  }
}

async function loadTriagem() {
  const q = new URLSearchParams({ status: 'PENDENTE', tipo: 'PROJETO' });
  const all = await apiGet(API.aprovacoes(q.toString()));
    state.triagem.pendentes = (all || [])
    .filter(a => Number(a.projeto_id) === state.projetoId)
    .filter(a => String(a.origem || '').toUpperCase() === 'LEGACY')
    .filter(a => String(a.tipo || '').toUpperCase() === 'PROJETO');

  txt('triagem-status', state.projeto?.status_projeto || state.projeto?.status || '-');
  renderTriagem();
}

async function loadDossie() {
  const settled = await Promise.allSettled([
    apiGet(API.projetos(state.projetoId)),
    apiGet(API.tarefas(new URLSearchParams({ projeto_id: String(state.projetoId) }).toString())),
    apiGet(API.timeline(state.projetoId)),
    apiGet(API.historico(state.projetoId)),
    apiGet(API.aprovacoes(''))
  ]);
  const [pRes, tarefasRes, timelineRes, historicoRes, aprovsRes] = settled.map(r => (r.status === 'fulfilled' ? r.value : null));
  const p = pRes;
  const tarefas = tarefasRes || [];
  const timeline = timelineRes || [];
  const historico = historicoRes || [];
  const aprovs = aprovsRes || [];
state.dossie.tarefas = tarefas || [];
  state.dossie.timeline = timeline || [];
  state.dossie.historico = historico || [];
  state.dossie.aprovacoes = (aprovs || []).filter(a => Number(a.projeto_id) === state.projetoId);

  renderDossie(p);
}

/* ======================
   HEADER
   ====================== */
function renderHeader() {
  const p = state.projeto || {};
  txt('p-title', p.nome || `Projeto #${state.projetoId}`);
  txt('p-crumb', p.nome || `#${state.projetoId}`);
  txt('p-setor', `${p.setor_nome || 'Geral'}`);
  txt('p-resp', `${p.responsavel_nome || 'Sem responsável'}`);

  const st = p.status_projeto || p.status || 'EM ANDAMENTO';
  const stEl = el('p-status');
  if (stEl) {
    stEl.textContent = st;
    const badgeEl = el('p-status-badge');
    const dotEl = badgeEl.querySelector('.status-dot');
    
    if (st === 'CONCLUIDO') dotEl.style.backgroundColor = 'var(--success)';
    else if (st === 'CANCELADO') dotEl.style.backgroundColor = 'var(--danger)';
    else if (st === 'TRIAGEM') dotEl.style.backgroundColor = 'var(--warning)';
    else dotEl.style.backgroundColor = 'var(--primary)';
  }

  const triBtn = el('tab-btn-triagem');
  if (triBtn) {
    triBtn.querySelector('.tri-dot')?.remove();
    const isTriagem = String(st).toUpperCase() === 'TRIAGEM' || String(st).toUpperCase() === 'AGUARDANDO_INFORMACAO';
    if (isTriagem) {
      const dot = document.createElement('span');
      dot.className = 'status-dot tri-dot';
      dot.style.background = 'var(--warning)';
      dot.style.marginLeft = '8px';
      triBtn.appendChild(dot);
    }
  }
}

/* ======================
   TRIAGEM RENDER + ACTIONS
   ====================== */
function renderTriagem() {
  const wrap = el('triagem-inicial-list');
  const empty = el('triagem-inicial-empty');
  if (!wrap) return;

  wrap.innerHTML = '';
  const pend = state.triagem.pendentes || [];

  empty?.classList.toggle('hidden', pend.length > 0);

  pend.forEach(a => {
    const item = document.createElement('div');
    item.className = 'item';

    const left = document.createElement('div');
    left.className = 'item-main';

    const title = document.createElement('div');
    title.className = 'item-title';
    title.innerHTML = `<i class="ph ph-check-square-offset"></i> Aprovação #${a.id} • ${a.projeto_nome || 'Projeto'}`;

    const sub = document.createElement('div');
    sub.className = 'item-sub';
    sub.textContent = `Solicitado em ${formatDate(a.solicitado_em)} • Solicitante: ${a.solicitante_nome || '-'}`;

    left.appendChild(title);
    left.appendChild(sub);

    // snapshot do modelo (base para aprovação)
    if (state.projeto && Number(a.projeto_id) === Number(state.projetoId)) {
      const snap = document.createElement('div');
      snap.className = 'item-snapshot';
      const rows = buildProjetoCamposRows(state.projeto);
      if (rows.length) {
        const html = rows.map(r => `<div class="kv"><div class="k">${escapeHtml(r[0])}</div><div class="v">${escapeHtml(String(r[1] ?? '-'))}</div></div>`).join('');
        snap.innerHTML = `<div class="snap-title">Dados do projeto</div><div class="snap-grid">${html}</div>`;
        left.appendChild(snap);
      }
    }


    const right = document.createElement('div');
    right.className = 'item-actions';

    const btnOk = document.createElement('button');
    btnOk.className = 'btn btn-primary';
    btnOk.innerHTML = '<i class="ph ph-check"></i> Aprovar';
    btnOk.addEventListener('click', () => aprovarAprovacao(a.id));

    const btnNo = document.createElement('button');
    btnNo.className = 'btn btn-danger-ghost';
    btnNo.innerHTML = '<i class="ph ph-x"></i> Reprovar';
    btnNo.addEventListener('click', () => abrirModalReprovar(a));

    right.appendChild(btnOk);
    right.appendChild(btnNo);

    item.appendChild(left);
    item.appendChild(right);

    wrap.appendChild(item);
  });
}

async function aprovarAprovacao(aprovacaoId) {
  try {
    await apiPost(API.aprovarAprovacao(aprovacaoId), {});
    toast('Aprovado ✅');
    await reloadAll();
    if (document.querySelector('.tab.active')?.dataset?.tab === 'triagem') {
      await loadTriagem();
    }
  } catch (err) {
    toast(err?.error || 'Falha ao aprovar', 'error');
  }
}

function abrirModalReprovar(a) {
  state.triagem.reprovarId = a.id;
  el('reprovar-motivo').value = '';
  txt('reprovar-info', `Aprovação #${a.id} • solicitado em ${formatDate(a.solicitado_em)}`);
  openModal('modal-reprovar');
}

async function reprovarAprovacao() {
  const id = Number(state.triagem.reprovarId || 0);
  const motivo = (el('reprovar-motivo').value || '').trim();
  if (!id) return toast('Aprovação inválida', 'error');
  if (!motivo) return toast('Motivo é obrigatório.', 'error');

  try {
    await apiPost(API.reprovarAprovacao(id), { motivo });
    closeModal('modal-reprovar');
    toast('Reprovado (retorno criado) ✅');
    await reloadAll();
    if (document.querySelector('.tab.active')?.dataset?.tab === 'triagem') {
      await loadTriagem();
    }
  } catch (err) {
    toast(err?.error || 'Falha ao reprovar', 'error');
  }
}

async function cancelarProjeto() {
  const confirmacao = (el('cancelar-confirmacao').value || '').trim();
  const motivo = (el('cancelar-motivo').value || '').trim();
  if (confirmacao !== 'CANCELAR') return toast('Digite CANCELAR para confirmar.', 'error');
  if (!motivo) return toast('Motivo é obrigatório.', 'error');

  try {
    await apiPost(API.cancelarProjeto(state.projetoId), { confirmacao, motivo });
    closeModal('modal-cancelar');
    toast('Projeto cancelado ✅');
    await reloadAll();
  } catch (err) {
    toast(err?.error || 'Falha ao cancelar', 'error');
  }
}

/* ======================
   TAREFAS (LISTA)
   ====================== */
function renderTarefas() {
  const wrap = el('tarefas-list');
  const empty = el('tarefas-empty');
  if (!wrap) return;

  const qText = (el('f-text')?.value || '').trim().toLowerCase();
  const qStatus = el('f-status')?.value || '';
  const qTipo = el('f-tipo')?.value || '';

  let list = [...(state.tarefas || [])];

  if (qText) {
    list = list.filter(t =>
      String(t.titulo || '').toLowerCase().includes(qText) ||
      String(t.descricao || '').toLowerCase().includes(qText)
    );
  }
  if (qStatus) list = list.filter(t => String(t.status).toUpperCase() === qStatus);
  if (qTipo) list = list.filter(t => String(t.tipo).toUpperCase() === qTipo);

  wrap.innerHTML = '';
  empty?.classList.toggle('hidden', list.length > 0);

  list.forEach(t => wrap.appendChild(renderTarefaItem(t)));
}

function renderTarefaItem(t) {
  const item = document.createElement('div');
  item.className = 'item';

  const left = document.createElement('div');
  left.className = 'item-main';

  const title = document.createElement('div');
  title.className = 'item-title';
  title.textContent = t.titulo || `Tarefa #${t.id}`;

  const sub = document.createElement('div');
  sub.className = 'item-sub';
  sub.innerHTML = `<i class="ph ph-columns"></i> ${t.coluna_nome || '-'} &nbsp;•&nbsp; <i class="ph ph-buildings"></i> ${t.setor_nome || '-'} &nbsp;•&nbsp; <i class="ph ph-calendar-blank"></i> ${formatDate(t.created_at)}`;

  const tags = document.createElement('div');
  tags.className = 'tags';
  tags.appendChild(badge(String(t.tipo || '-'), 'neutral'));
  
  let statusType = 'neutral';
  if (t.status === 'CONCLUIDA') statusType = 'success';
  if (t.status === 'EM_ANDAMENTO') statusType = 'primary';
  if (t.status === 'AGUARDANDO_INFORMACAO') statusType = 'warn';
  
    const isPlanejar = isPlanejarExecucaoTask(t);
  const statusLabel = (isPlanejar && String(t.status).toUpperCase()==='SOLICITADO') ? 'ABERTA' : String(t.status || '-');
  tags.appendChild(badge(statusLabel, statusType));
  
  if (t.obrigatoria) tags.appendChild(badge('OBRIGATÓRIA', 'danger'));

  left.appendChild(title);
  left.appendChild(sub);
  left.appendChild(tags);

  const right = document.createElement('div');
  right.className = 'item-actions';

  if (String(t.status).toUpperCase() === 'SOLICITADO' && !isPlanejarExecucaoTask(t)) {
    const b1 = document.createElement('button');
    b1.className = 'btn btn-primary';
    b1.innerHTML = '<i class="ph ph-check"></i> Aceitar';
    b1.addEventListener('click', () => aceitarTarefa(t.id));
    right.appendChild(b1);

    const b2 = document.createElement('button');
    b2.className = 'btn btn-danger-ghost';
    b2.innerHTML = '<i class="ph ph-x"></i> Recusar';
    b2.addEventListener('click', () => recusarTarefa(t.id));
    right.appendChild(b2);
  }

  if (String(t.status).toUpperCase() === 'ABERTA' || String(t.status).toUpperCase() === 'EM_ANDAMENTO' || isPlanejarExecucaoTask(t)) {
    const b3 = document.createElement('button');
    b3.className = 'btn btn-secondary';
    b3.innerHTML = '<i class="ph ph-check-circle"></i> Executar';
    b3.addEventListener('click', () => finalizarTarefa(t.id));
    right.appendChild(b3);
  }

  item.appendChild(left);
  item.appendChild(right);
  return item;
}

async function aceitarTarefa(id) {
  await apiPost(API.aceitar(id), {});
  await reloadAll();
}

/* ======================
   AÇÕES DA TAREFA (modal)
   ====================== */
let _taskActionsCtx = { tarefa: null };

function openTaskActionsModal(tarefa) {
  _taskActionsCtx = { tarefa };

  const title = el('task-actions-title');
  if (title) title.textContent = tarefa.titulo || (`Tarefa #${tarefa.id}`);

  const meta = el('task-actions-meta');
  if (meta) {
    const st = (tarefa.status || '-');
    const setor = (tarefa.setor_nome || '-');
    const etapa = (tarefa.coluna_nome || tarefa.kanban_coluna || '-');
    meta.textContent = `${setor} • ${etapa} • ${st}`;
  }

  const actions = el('task-actions-buttons');
  if (actions) {
    actions.innerHTML = '';
    const st = String(tarefa.status || '').toUpperCase();

    if (st === 'SOLICITADO' && !isPlanejarExecucaoTask(tarefa)) {
      const b1 = document.createElement('button');
      b1.className = 'btn btn-primary';
      b1.innerHTML = '<i class="ph ph-check"></i> Aceitar';
      b1.addEventListener('click', async () => {
        try { await aceitarTarefa(tarefa.id); closeModal('modal-task-actions'); } catch(e){ toast(e?.error || 'Falha ao aceitar', 'danger'); }
      });
      actions.appendChild(b1);

      const b2 = document.createElement('button');
      b2.className = 'btn btn-danger';
      b2.innerHTML = '<i class="ph ph-x"></i> Recusar';
      b2.addEventListener('click', async () => {
        closeModal('modal-task-actions');
        await recusarTarefa(tarefa.id);
      });
      actions.appendChild(b2);
    }

    if (['ABERTA','EM_ANDAMENTO'].includes(st) || isPlanejarExecucaoTask(tarefa)) {
      const b3 = document.createElement('button');
      b3.className = 'btn btn-secondary';
      b3.innerHTML = '<i class="ph ph-check-circle"></i> Executar';
      b3.addEventListener('click', async () => {
        closeModal('modal-task-actions');
        await finalizarTarefa(tarefa.id);
      });
      actions.appendChild(b3);

      const b4 = document.createElement('button');
      b4.className = 'btn btn-danger-ghost';
      b4.innerHTML = '<i class="ph ph-x"></i> Recusar';
      b4.addEventListener('click', async () => {
        closeModal('modal-task-actions');
        await recusarTarefa(tarefa.id);
      });
      actions.appendChild(b4);
    }

    if (!actions.children.length) {
      const p = document.createElement('div');
      p.className = 'empty-text';
      p.textContent = 'Nenhuma ação disponível para esta tarefa.';
      actions.appendChild(p);
    }
  }

  openModal('modal-task-actions');
}

/* ======================
   RECUSAR (modal completo)
   ====================== */
let _recusarCtx = { tarefa: null, campos: [] };

async function openRecusarModal(tarefaId) {
  const tarefa = await apiGet(API.tarefa(tarefaId));
  _recusarCtx = { tarefa, campos: [] };

  el('recusar-title').textContent = `Recusar: ${tarefa.titulo || ('Tarefa #' + tarefa.id)}`;
  el('recusar-motivo').value = '';

  renderRecusaCampos();
  openModal('modal-recusar');
}

function renderRecusaCampos() {
  const wrap = el('recusar-campos');
  if (!wrap) return;
  wrap.innerHTML = '';

  const list = _recusarCtx.campos || [];
  if (!list.length) {
    const p = document.createElement('div');
    p.className = 'empty-text';
    p.textContent = 'Nenhum campo adicional solicitado. (Opcional)';
    wrap.appendChild(p);
    return;
  }

  list.forEach((c, idx) => {
    const row = document.createElement('div');
    row.className = 'field-row';

    row.innerHTML = `
      <div class="field-row-grid">
        <div>
          <label>Nome do campo</label>
          <input type="text" data-k="nome" value="${escapeHtml(c.label || '')}" placeholder="Ex: Número do orçamento">
        </div>
        <div>
          <label>Tipo</label>
          <select data-k="tipo">
            <option value="texto">Texto</option>
            <option value="textarea">Texto longo</option>
            <option value="selecao">Seleção</option>
            <option value="numero">Número</option>
            <option value="data">Data</option>
            <option value="upload">Upload</option>
          </select>
        </div>
        <div>
          <label>Obrigatório</label>
          <select data-k="obrigatorio">
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        </div>
      </div>
      <div class="field-row-grid field-row-grid-2">
        <div class="opt-wrap ${c.tipo === 'selecao' ? '' : 'hidden'}">
          <label>Opções (separadas por vírgula)</label>
          <input type="text" data-k="opcoes" value="${escapeHtml((c.opcoes || []).join(','))}" placeholder="Ex: A,B,C">
        </div>
        <div class="field-row-actions">
          <button class="btn btn-danger-ghost" data-remove="${idx}">Remover</button>
        </div>
      </div>
    `;

    const selTipo = row.querySelector('select[data-k="tipo"]');
    if (selTipo) selTipo.value = c.tipo || 'texto';
    const selOb = row.querySelector('select[data-k="obrigatorio"]');
    if (selOb) selOb.value = String(!!c.obrigatorio);

    selTipo?.addEventListener('change', () => {
      const t = String(selTipo.value || 'texto');
      const opt = row.querySelector('.opt-wrap');
      opt?.classList.toggle('hidden', t !== 'selecao');
    });

    row.querySelector('[data-remove]')?.addEventListener('click', () => {
      _recusarCtx.campos.splice(idx, 1);
      renderRecusaCampos();
    });

    wrap.appendChild(row);
  });
}

function addCampoRecusa() {
  _recusarCtx.campos.push({ label: '', tipo: 'texto', obrigatorio: true, opcoes: [] });
  renderRecusaCampos();
}

function readCamposRecusaFromUI() {
  const wrap = el('recusar-campos');
  if (!wrap) return [];
  const rows = Array.from(wrap.querySelectorAll('.field-row'));
  return rows.map(r => {
    const nome = (r.querySelector('input[data-k="nome"]')?.value || '').trim();
    const tipo = (r.querySelector('select[data-k="tipo"]')?.value || 'texto').trim();
    const obrigatorio = String(r.querySelector('select[data-k="obrigatorio"]')?.value || 'true') === 'true';
    const opcoesRaw = (r.querySelector('input[data-k="opcoes"]')?.value || '').trim();
    const opcoes = tipo === 'selecao'
      ? opcoesRaw.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    return { label: nome, tipo, obrigatorio, opcoes };
  }).filter(c => c.label);
}

async function confirmarRecusa() {
  const motivo = (el('recusar-motivo').value || '').trim();
  if (!motivo) return toast('Motivo é obrigatório.', 'error');

  const campos = readCamposRecusaFromUI();
  try {
    await apiPost(API.recusar(_recusarCtx.tarefa.id), { motivo, campos_novos: campos });
    closeModal('modal-recusar');
    await reloadAll();
  } catch (e) {
    toast(e?.error || 'Falha ao recusar.', 'danger');
  }
}


async function recusarTarefa(id) {
  await openRecusarModal(id);
}

async function finalizarTarefa(id) {
  const t = await apiGet(API.tarefa(id));
  openFinalizarModal(t);
}

/* ======================
   KANBAN
   ====================== */
function renderKanban() {
  const wrap = el('kanban');
  const empty = el('kanban-empty');
  if (!wrap) return;

  const cols = state.colunas || [];
  empty?.classList.toggle('hidden', cols.length > 0);
  wrap.innerHTML = '';

  cols.forEach(col => {
    const colEl = document.createElement('div');
    colEl.className = 'col';

    const head = document.createElement('div');
    head.className = 'col-head';
    head.innerHTML = `<strong>${col.nome || 'Etapa'}</strong><span class="badge-soft">${col.ordem ?? ''}</span>`;

    const body = document.createElement('div');
    body.className = 'col-body';

    const tasks = (state.tarefas || []).filter(t => Number(t.projeto_coluna_id) === Number(col.id));
    tasks.forEach(t => body.appendChild(renderKanbanCard(t)));

    colEl.appendChild(head);
    colEl.appendChild(body);
    wrap.appendChild(colEl);
  });
}

function renderKanbanCard(t) {
  const st = String(t.status || '').toUpperCase();

  const card = document.createElement('div');
  card.className = 'card-task';
  if (st === 'CONCLUIDA') card.classList.add('is-done');

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = t.titulo || `#${t.id}`;

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  meta.innerHTML = `<i class="ph ph-buildings"></i> ${t.setor_nome || '-'} &nbsp;•&nbsp; ${t.status || '-'}`;

  const tags = document.createElement('div');
  tags.className = 'tags';
  tags.appendChild(badge(String(t.tipo || '-')));
  if (t.obrigatoria) tags.appendChild(badge('OBRIGATÓRIA', 'danger'));

  if (st === 'CONCLUIDA') {
    tags.appendChild(badge('CONCLUÍDA', 'success'));
  } else if (st === 'AGUARDANDO_APROVACACAO') {
    tags.appendChild(badge('AGUARDANDO APROVAÇÃO', 'warn'));
  } else if (st === 'AGUARDANDO_INFORMACAO') {
    tags.appendChild(badge('AGUARDANDO', 'warn'));
  } else if (st === 'REPROVADO') {
    tags.appendChild(badge('REPROVADO', 'danger'));
  }

  card.appendChild(title);
  card.appendChild(meta);
  card.appendChild(tags);

  card.addEventListener('click', async () => {
    try {
      const full = await apiGet(API.tarefa(t.id));
      openTaskActionsModal(full);
    } catch (e) {
      toast('Não foi possível abrir a tarefa.', 'danger');
    }
  });

  return card;
}

/* ======================
   CRONOGRAMA (simples)
   ====================== */
function renderCronograma() {
  const wrap = el('cronograma');
  const empty = el('cronograma-empty');
  if (!wrap) return;

  const list = (state.tarefas || [])
    .filter(t => t.prazo || t.data_inicio || t.data_fim)
    .sort((a,b) => new Date(a.prazo || a.data_fim || 0) - new Date(b.prazo || b.data_fim || 0));

  wrap.innerHTML = '';
  empty?.classList.toggle('hidden', list.length > 0);

  list.forEach(t => {
    const row = document.createElement('div');
    row.className = 'trow';
    row.innerHTML = `
      <div>
        <strong>${t.titulo || `Tarefa #${t.id}`}</strong>
        <div class="item-sub">${t.coluna_nome || '-'} • ${t.setor_nome || '-'}</div>
      </div>
      <div class="badge-soft"><i class="ph ph-calendar"></i> ${formatDate(t.prazo)}</div>
    `;
    wrap.appendChild(row);
  });
}

/* ======================
   NOVA TAREFA (modal)
   ====================== */
async function criarTarefa() {
  const titulo = (el('nt-titulo').value || '').trim();
  const descricao = (el('nt-desc').value || '').trim();
  const tipo = el('nt-tipo').value || 'OFICIAL';
  const projeto_coluna_id = Number(el('nt-coluna').value || 0);
  const obrigatoria = String(el('nt-obrigatoria').value || 'false') === 'true';

  if (!titulo) return toast('Título é obrigatório.', 'error');
  if (!projeto_coluna_id) return toast('Selecione uma etapa.', 'error');

  await apiPost(API.criarTarefaNoProjeto(state.projetoId), {
    titulo,
    descricao,
    tipo,
    projeto_coluna_id,
    obrigatoria
  });

  closeModal('modal-tarefa');
  toast('Tarefa criada ✅');
  await reloadAll();
}

/* ======================
   DOSSIE RENDER
   ====================== */
function renderDossie(p) {
  // snapshot
  const snap = el('dossie-snapshot');
  if (snap) {
    snap.innerHTML = '';
    const rows = [];

    rows.push(['ID', p.id]);
    rows.push(['Nome', p.nome || '-']);
    rows.push(['Descrição', p.descricao || '-']);
    rows.push(['Status', p.status_projeto || p.status || '-']);
    rows.push(['Setor', p.setor_nome || '-']);
    rows.push(['Responsável', p.responsavel_nome || '-']);
    rows.push(['Criado em', formatDate(p.created_at)]);

    // campos do modelo (perguntas respondidas na abertura do projeto)
    const def = parseJsonMaybe(p.definicao_json) || {};
    const answers = parseJsonMaybe(p.campos_json) || {};
    const campos = (def.campos_projeto || def.camposProjeto || def.campos || def.perguntas || (def.form && def.form.campos) || []);
    if (Array.isArray(campos) && campos.length) {
      campos.forEach((c, idx) => {
        const label = c.label || c.nome || c.titulo || c.pergunta || c.name || `Campo ${idx+1}`;
        const key = c.key || c.id || c.codigo || c.nome || c.name || label;
        const val = (answers && (answers[key] ?? answers[c.id] ?? answers[c.nome] ?? answers[c.name])) ?? null;
        rows.push([label, formatValueByFieldDef(val, c)]);
      });
    }


    // aprovações (snapshot)
    const aprovs = (state.dossie.aprovacoes || []);
    const aproj = aprovs.filter(a => (a.tipo || '').toUpperCase() === 'PROJETO');
    const aexec = aprovs.filter(a => (a.tipo || '').toUpperCase() === 'EXECUCAO');

    if (aproj.length) {
      const a = aproj[0];
      rows.push(['Aprovação inicial', `${a.status || '-'} • ${a.aprovador_nome || '-'} • ${formatDate(a.aprovado_em || a.solicitado_em)}`]);
    }
    if (aexec.length) {
      const a = aexec[0];
      rows.push(['Aprovação execução', `${a.status || '-'} • ${a.aprovador_nome || '-'} • ${formatDate(a.aprovado_em || a.solicitado_em)}`]);
    }


    rows.forEach(([k,v]) => {
      const kEl = document.createElement('div'); kEl.className='k'; kEl.textContent = k;
      const vEl = document.createElement('div'); vEl.className='v'; vEl.textContent = v ?? '-';
      snap.appendChild(kEl); snap.appendChild(vEl);
    });
  }

  // histórico / aprovações / timeline
  const aWrap = el('dossie-aprovacoes');
  const aEmpty = el('dossie-aprovacoes-empty');
  if (aWrap) {
    const aprov = (state.dossie.aprovacoes || []).map(a => ({
      kind: 'aprovacao',
      at: a.aprovado_em || a.solicitado_em || a.created_at || null,
      data: a
    }));

    const tl = (state.dossie.timeline || []).map(t => ({
      kind: 'timeline',
      at: t.created_at || null,
      data: t
    }));

    const ev = (state.dossie.historico || []).map(e => ({
      kind: 'evento',
      at: e.created_at || null,
      data: e
    }));

    const all = [...aprov, ...tl, ...ev].sort((x, y) => {
      const dx = new Date(x.at || 0).getTime();
      const dy = new Date(y.at || 0).getTime();
      return dy - dx;
    });

    aWrap.innerHTML = '';
    aEmpty?.classList.toggle('hidden', all.length > 0);

    all.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'item';

      const left = document.createElement('div');
      left.className = 'item-main';

      const title = document.createElement('div');
      title.className = 'item-title';

      const meta = document.createElement('div');
      meta.className = 'item-meta';

      if (entry.kind === 'aprovacao') {
        const a = entry.data;
        title.textContent = `${a.tipo || 'APROVAÇÃO'} • ${a.status || '-'}`;
        const who = a.aprovador_nome || a.solicitante_nome || '-';
        const when = formatDate(a.aprovado_em || a.solicitado_em);
        const motivo = a.motivo ? ` • ${a.motivo}` : '';
        meta.textContent = `${who} • ${when}${motivo}`;
      } else if (entry.kind === 'timeline') {
        const t = entry.data;
        title.textContent = t.titulo || t.tipo || 'Timeline';
        const who = t.user_nome || '-';
        const when = formatDate(t.created_at);
        meta.textContent = `${who} • ${when}`;
      } else {
        const e = entry.data;
        title.textContent = e.titulo || e.tipo || 'Evento';
        const who = e.criado_por_nome || '-';
        const when = formatDate(e.created_at);
        const desc = e.descricao ? ` • ${e.descricao}` : '';
        meta.textContent = `${who} • ${when}${desc}`;
      }

      left.appendChild(title);
      left.appendChild(meta);

      item.appendChild(left);
      aWrap.appendChild(item);
    });
  }

// tarefas
  const tWrap = el('dossie-tarefas');
  const tEmpty = el('dossie-tarefas-empty');
  if (tWrap) {
    const list = (state.dossie.tarefas || []).slice().sort((a,b) => {
      const da = new Date(a.created_at || 0).getTime();
      const db = new Date(b.created_at || 0).getTime();
      return db - da;
    });

    tWrap.innerHTML = '';
    tEmpty?.classList.toggle('hidden', list.length > 0);

    list.forEach(t => {
      const item = document.createElement('div');
      item.className = 'item';

      const left = document.createElement('div');
      left.className = 'item-main';

      const title = document.createElement('div');
      title.className = 'item-title';
      title.textContent = `${t.titulo || `Tarefa #${t.id}`}`;

      const sub = document.createElement('div');
      sub.className = 'item-sub';
      sub.textContent = `${t.coluna_nome || '-'} • ${t.setor_nome || '-'} • criada: ${formatDate(t.created_at)}`;

      const tags = document.createElement('div');
      tags.className = 'tags';
      tags.appendChild(badge(String(t.tipo || '-')));
      tags.appendChild(badge(String(t.status || '-'), String(t.status).toUpperCase() === 'AGUARDANDO_INFORMACAO' ? 'warn' : 'neutral'));
      if (t.obrigatoria) tags.appendChild(badge('OBRIGATÓRIA', 'danger'));

      left.appendChild(title);
      left.appendChild(sub);
      left.appendChild(tags);

      item.appendChild(left);
      tWrap.appendChild(item);
    });
  }
}

/* ======================
   POPULA SELECT ETAPAS
   ====================== */
function fillColunaSelect() {
  const sel = el('nt-coluna');
  if (!sel) return;
  sel.innerHTML = '';
  (state.colunas || []).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.nome || `Etapa ${c.ordem || ''}`;
    sel.appendChild(opt);
  });
}

// sempre que colunas carregar
const _oldLoadColunas = loadColunas;
loadColunas = async function() {
  await _oldLoadColunas();
  fillColunaSelect();
};


init().catch(err => toast(err?.error || 'Falha ao iniciar', 'error'));


/* ======================
   FINALIZAR TAREFA (EXECUÇÃO)
   ====================== */

let _finalizarCtx = { tarefa: null, nextList: [] };

function tarefaIdForUpload(){ return _finalizarCtx?.tarefa?.id; }


function openFinalizarModal(tarefa) {
  _finalizarCtx = { tarefa, nextList: [], allowNext: isPlanejarTarefa(tarefa) };

  // título
  const title = el('finalizar-title');
  if (title) title.textContent = `Executar: ${tarefa.titulo || ('Tarefa #' + tarefa.id)}`;

  // campos
  const defs = normalizeCamposDef(tarefa?.campos_def_json);
  const vals = normalizeCamposVal(tarefa?.campos_val_json ?? tarefa?.campos_json);

  const wrap = el('finalizar-campos');
  if (wrap) {
    wrap.innerHTML = '';
    if (!defs.length) {
      const p = document.createElement('div');
      p.className = 'empty-text';
      p.textContent = 'Esta tarefa não possui campos para preenchimento.';
      wrap.appendChild(p);
    } else {
      defs.forEach(def => wrap.appendChild(renderCampo(def, vals)));
    }
  }

  renderNextList();
  toggleNextUI();

  const stExec = String(tarefa.status || '').toUpperCase();
  const isReadOnly = !(['ABERTA','EM_ANDAMENTO'].includes(stExec) || isPlanejarExecucaoTask(tarefa));
  el('btn-confirmar-finalizar')?.classList.toggle('hidden', isReadOnly);
  if (isReadOnly) {
    const wrap2 = el('finalizar-campos');
    wrap2?.querySelectorAll('input, textarea, select, button').forEach(n => {
      if (n && n.id && String(n.id).includes('modal')) return;
      n.disabled = true;
    });
  }

  openModal('modal-finalizar');
}

function renderCampo(def, vals) {
  const g = document.createElement('div');
  g.className = 'form-group';

  const label = document.createElement('label');
  label.textContent = def.label || def.id || def.key || 'Campo';
  if (def.obrigatorio) {
    const req = document.createElement('span');
    req.className = 'required';
    req.textContent = ' *';
    label.appendChild(req);
  }
  g.appendChild(label);

  const key = def.id || def.key;

  let input;
  const tipo = String(def.tipo || 'texto').toLowerCase();

  if (tipo === 'upload' || tipo === 'anexos-slot') {
    input = document.createElement('div');
    input.className = 'upload-wrap';
    const info = document.createElement('div');
    info.className = 'upload-info';
    info.textContent = 'Nenhum arquivo enviado.';
    const file = document.createElement('input');
    file.type = 'file';
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      try {
        info.textContent = 'Enviando...';
        const fd = new FormData();
        fd.append('arquivo', f);
        fd.append('campo_id', key);
        fd.append('slot_index', '0');
        const r = await apiPostForm(API.anexos(tarefaIdForUpload()), fd);
        info.textContent = `Enviado: ${r?.nome || f.name}`;
      } catch(e) {
        info.textContent = 'Falha ao enviar.';
        toast(e?.error || 'Falha ao enviar anexo.', 'danger');
      }
    });
    input.appendChild(file);
    input.appendChild(info);
  } else if (tipo === 'textarea') {
    input = document.createElement('textarea');
    input.rows = 4;
    input.value = vals?.[key] ?? '';
  } else if (tipo === 'selecao') {
    input = document.createElement('select');
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = 'Selecione...';
    input.appendChild(opt0);
    (def.opcoes || []).forEach(o => {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      input.appendChild(opt);
    });
    input.value = vals?.[key] ?? '';
  } else if (tipo === 'numero') {
    input = document.createElement('input');
    input.type = 'number';
    input.value = (vals?.[key] ?? '');
  } else if (tipo === 'data') {
    input = document.createElement('input');
    input.type = 'date';
    input.value = (vals?.[key] ?? '').toString().slice(0,10);
  } else {
    input = document.createElement('input');
    input.type = 'text';
    input.value = vals?.[key] ?? '';
  }

  input.dataset.campoKey = key;
  g.appendChild(input);

  return g;
}

function getCamposFromModal() {
  const wrap = el('finalizar-campos');
  const out = {};
  if (!wrap) return out;

  wrap.querySelectorAll('[data-campo-key]').forEach(inp => {
    const key = inp.dataset.campoKey;
    out[key] = inp.value;
  });
  return out;
}

function renderNextList() {
  const wrap = el('finalizar-next-list');
  const empty = el('finalizar-next-empty');
  if (!wrap) return;
  wrap.innerHTML = '';
  const list = _finalizarCtx.nextList || [];
  empty?.classList.toggle('hidden', list.length > 0);

  list.forEach((n, idx) => {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `
      <div class="item-main">
        <div class="item-title">${escapeHtml(n.titulo || 'Nova tarefa')}</div>
        <div class="item-sub">
          <i class="ph ph-buildings"></i> ${escapeHtml(n.setor_nome || '-')}&nbsp;•&nbsp;
          <i class="ph ph-columns"></i> ${escapeHtml(n.coluna_nome || '-')}
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn-danger-ghost" data-del-next="${idx}"><i class="ph ph-trash"></i> Remover</button>
      </div>
    `;
    wrap.appendChild(row);
  });

  wrap.querySelectorAll('[data-del-next]').forEach(b => {
    b.addEventListener('click', () => {
      const i = Number(b.dataset.delNext);
      _finalizarCtx.nextList.splice(i, 1);
      renderNextList();
    });
  });
}

/* ======================
   MANUAL TASK BUILDER
   ====================== */
let _manualFields = [];

function renderNextManualBuilder() {
  const list = el('next-fields-list');
  if (!list) return;
  list.innerHTML = '';

  _manualFields.forEach((f, i) => {
    const row = document.createElement('div');
    row.className = 'field-row';
    row.innerHTML = `
      <div class="field-row-grid">
        <div class="field">
          <label>Nome do campo</label>
          <input type="text" class="input-sm" value="${escapeHtml(f.label)}" onchange="updateManualField(${i}, 'label', this.value)">
        </div>
        <div class="field">
          <label>Tipo</label>
          <select class="input-sm" onchange="updateManualField(${i}, 'tipo', this.value)">
            <option value="texto" ${f.tipo === 'texto' ? 'selected' : ''}>Texto</option>
            <option value="numero" ${f.tipo === 'numero' ? 'selected' : ''}>Número</option>
            <option value="data" ${f.tipo === 'data' ? 'selected' : ''}>Data</option>
            <option value="selecao" ${f.tipo === 'selecao' ? 'selected' : ''}>Seleção</option>
            <option value="textarea" ${f.tipo === 'textarea' ? 'selected' : ''}>Área de Texto</option>
            <option value="arquivo" ${f.tipo === 'arquivo' ? 'selected' : ''}>Arquivo</option>
          </select>
        </div>
        <div class="field">
          <label>Obrigatório</label>
          <select class="input-sm" onchange="updateManualField(${i}, 'obrigatorio', this.value === 'true')">
            <option value="false" ${!f.obrigatorio ? 'selected' : ''}>Não</option>
            <option value="true" ${f.obrigatorio ? 'selected' : ''}>Sim</option>
          </select>
        </div>
      </div>
      ${f.tipo === 'selecao' ? renderOptionsBuilder(f, i) : ''}
      <div class="field-row-actions">
        <button class="btn btn-danger-ghost btn-sm" onclick="removeManualField(${i})"><i class="ph ph-trash"></i> Remover</button>
      </div>
    `;
    list.appendChild(row);
  });
}

function renderOptionsBuilder(f, i) {
  const opts = Array.isArray(f.opcoes) ? f.opcoes : [];
  return `
    <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #ccc;">
      <label style="font-size:0.8rem;">Opções (pressione Enter)</label>
      <div class="opt-add">
        <input type="text" class="input-sm" placeholder="Nova opção..." onkeypress="if(event.key==='Enter'){ addManualOption(${i}, this.value); this.value=''; }">
      </div>
      <div class="opt-chips">
        ${opts.map((o, idx) => `
          <span class="opt-chip">${escapeHtml(o)} <button class="opt-chip-x" onclick="removeManualOption(${i}, ${idx})">×</button></span>
        `).join('')}
      </div>
    </div>
  `;
}

window.updateManualField = (i, key, val) => {
  _manualFields[i][key] = val;
  if (key === 'tipo') renderNextManualBuilder();
};

window.removeManualField = (i) => {
  _manualFields.splice(i, 1);
  renderNextManualBuilder();
};

window.addManualOption = (i, val) => {
  if (!val.trim()) return;
  if (!_manualFields[i].opcoes) _manualFields[i].opcoes = [];
  _manualFields[i].opcoes.push(val.trim());
  renderNextManualBuilder();
};

window.removeManualOption = (i, idx) => {
  _manualFields[i].opcoes.splice(idx, 1);
  renderNextManualBuilder();
};

function getNextCamposDefJson() {
  return _manualFields.map(f => ({
    key: f.label.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    label: f.label,
    tipo: f.tipo,
    obrigatorio: f.obrigatorio,
    opcoes: f.opcoes || []
  }));
}

/* ======================
   MODAL NEXT (Unified)
   ====================== */
async function openAddNextModal() {
  await loadCfg();
  
  // Reset fields
  _manualFields = [];
  renderNextManualBuilder();
  
  const selCol = el('next-coluna');
  const selSetor = el('next-setor');
  const selModelo = el('next-modelo');
  const manualWrap = el('next-manual-fields');

  if (selCol) {
    selCol.innerHTML = '<option value="">Selecione...</option>' +
      (state.colunas || []).map(c => `<option value="${c.id}">${escapeHtml(c.nome || ('Coluna #' + c.id))}</option>`).join('');
  }

  if (selSetor) {
    selSetor.innerHTML = '<option value="">Auto (da coluna)</option>' +
      (state.cfg.setores || []).map(s => `<option value="${s.id}">${escapeHtml(s.nome || ('Setor #' + s.id))}</option>`).join('');
  }

  if (selModelo) {
    selModelo.innerHTML = '<option value="">Manual (Criar campos)</option>' +
      (state.cfg.modelosTarefa || []).map(m => `<option value="${m.id}">${escapeHtml(m.nome || ('Modelo #' + m.id))}</option>`).join('');
      
    selModelo.onchange = () => {
      const isManual = !selModelo.value;
      manualWrap.classList.toggle('hidden', !isManual);
    };
  }
  
  // Trigger change to set initial state
  if (selModelo) selModelo.onchange();

  const t = el('next-titulo'); if (t) t.value = '';
  const d = el('next-descricao'); if (d) d.value = '';
  
  // Update button text based on mode
  const btn = el('btn-add-next');
  if (btn) {
    btn.textContent = state.ui.addMode === 'create' ? 'Criar Tarefa' : 'Adicionar';
    // Remove old listeners to avoid duplicates (simple way: clone)
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', handleNextSubmit);
  }
  
  // Add field button
  const btnAdd = el('btn-add-field');
  if (btnAdd) {
    const newBtn = btnAdd.cloneNode(true);
    btnAdd.parentNode.replaceChild(newBtn, btnAdd);
    newBtn.addEventListener('click', () => {
      _manualFields.push({ label: 'Novo Campo', tipo: 'texto', obrigatorio: false });
      renderNextManualBuilder();
    });
  }

  openModal('modal-next');
}

async function handleNextSubmit() {
  if (state.ui.addMode === 'create') {
    await criarTarefaUnified();
  } else {
    await addNextFromModal();
  }
}

async function criarTarefaUnified() {
  const colunaId = Number(el('next-coluna')?.value || 0);
  const setorId = Number(el('next-setor')?.value || 0);
  const modeloId = Number(el('next-modelo')?.value || 0);
  const titulo = (el('next-titulo')?.value || '').trim();
  const descricao = (el('next-descricao')?.value || '').trim();

  if (!colunaId) return toast('Selecione a coluna.', 'error');
  if (!titulo && !modeloId) return toast('Título é obrigatório (ou selecione um modelo).', 'error');

  let camposDef = [];
  if (!modeloId) {
    camposDef = getNextCamposDefJson();
  }

  try {
    await apiPost(API.criarTarefaNoProjeto(state.projetoId), {
      titulo,
      descricao,
      tipo: 'OFICIAL',
      projeto_coluna_id: colunaId,
      setor_id: setorId || null,
      tarefa_modelo_id: modeloId || null,
      campos_def_json: camposDef,
      obrigatoria: true // Default for manual creation
    });

    closeModal('modal-next');
    toast('Tarefa criada ✅');
    await reloadAll();
  } catch (err) {
    toast(err?.error || 'Falha ao criar tarefa', 'error');
  }
}

async function addNextFromModal() {
  const colunaId = Number(el('next-coluna')?.value || 0);
  const setorId = Number(el('next-setor')?.value || 0);
  const modeloId = Number(el('next-modelo')?.value || 0);
  const titulo = (el('next-titulo')?.value || '').trim();
  const descricao = (el('next-descricao')?.value || '').trim();

  if (!colunaId) return toast('Selecione a coluna.', 'danger');

  const col = (state.colunas || []).find(c => Number(c.id) === colunaId);
  const setor = setorId ? (state.cfg.setores || []).find(s => Number(s.id) === setorId) : null;
  const modelo = modeloId ? (state.cfg.modelosTarefa || []).find(m => Number(m.id) === modeloId) : null;
  
  let camposDef = [];
  if (!modeloId) {
    camposDef = getNextCamposDefJson();
  }

  _finalizarCtx.nextList.push({
    coluna_id: colunaId,
    coluna_nome: col?.nome || ('Coluna #' + colunaId),
    setor_id: setorId || null,
    setor_nome: setor?.nome || (setorId ? ('Setor #' + setorId) : (col?.setor_nome || '-')),
    tarefa_modelo_id: modeloId || null,
    modelo_nome: modelo?.nome || null,
    titulo: titulo || (modelo ? modelo.nome : 'Nova Tarefa'),
    descricao: descricao,
    campos_def_json: camposDef
  });

  closeModal('modal-next');
  renderNextList();
}

async function confirmarFinalizar() {
  const tarefa = _finalizarCtx.tarefa;
  if (!tarefa) return;

  try {
    const campos = getCamposFromModal();

    let resp;
    try {
            const payload = { campos_val_json: campos };

      if (_finalizarCtx.allowNext) {
        if (!_finalizarCtx.nextList || !_finalizarCtx.nextList.length) {
          toast('Para finalizar esta tarefa, adicione ao menos uma próxima tarefa.', 'danger');
          return;
        }
        payload.next_tarefas = (_finalizarCtx.nextList || []).map(n => ({
          coluna_id: n.coluna_id,
          setor_id: n.setor_id,
          tarefa_modelo_id: n.tarefa_modelo_id,
          titulo: n.titulo,
          descricao: n.descricao,
          campos_def_json: n.campos_def_json || undefined,
        }));
      }

      resp = await apiPost(API.finalizar(tarefa.id), payload);
    } catch (err) {
      const msg = err?.error || err?.message || 'Falha ao finalizar (erro desconhecido).';
      const detalhes = (Array.isArray(err?.erros) && err.erros.length)
        ? ('\n• ' + err.erros.join('\n• '))
        : '';
      toast(msg + detalhes, 'danger');
      return;
    }
    closeModal('modal-finalizar');
    await reloadAll();

    const st = String(resp?.tarefa?.status || resp?.status || resp?.status_detalhado || '').toUpperCase();
    if (st === 'AGUARDANDO_APROVACACAO') {
      toast('Enviado para aprovação do gestor.', 'success');
    } else {
      toast('Tarefa concluída.', 'success');
    }
  } catch (e) {
    toast(e?.error || e?.message || 'Falha ao finalizar.', 'danger');
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

document.addEventListener('DOMContentLoaded', () => {
  el('btn-open-next')?.addEventListener('click', () => {
    state.ui.addMode = 'next';
    openAddNextModal().catch(err => toast(err?.error || err?.message || 'Falha ao abrir', 'danger'));
  });
  // btn-add-next listener is handled dynamically in openAddNextModal
  el('btn-confirmar-finalizar')?.addEventListener('click', confirmarFinalizar);
});
