function safeParseJwt(token) {
  try {
    const payload = token.split('.')[1];
    return payload ? JSON.parse(atob(payload)) : {};
  } catch {
    return {};
  }
}

function getUserFromPortal() {
  const token = localStorage.getItem('token') || '';
  const p = safeParseJwt(token);
  return {
    id: p.id,
    nome: p.nome || localStorage.getItem('nome') || 'Usuário',
    isAdmin: !!p.isAdmin,
    projetosAdmin: !!p.projetosAdmin,
    acessoProjetos: !!p.acessoProjetos
  };
}

function guardProjetosAdmin() {
  if (window.Auth?.requireAuth) window.Auth.requireAuth();
  const u = getUserFromPortal();
  if (!(u.isAdmin || u.acessoProjetos)) {
    alert('Sem permissão para acessar Projetos.');
    window.location.href = '/home.html';
    return false;
  }
  if (!(u.isAdmin || u.projetosAdmin)) {
    alert('Acesso restrito ao admin de Projetos.');
    window.location.href = '/home.html';
    return false;
  }
  return true;
}

function qs(id) { return document.getElementById(id); }

function openModal(el, show) {
  if (!el) return;
  el.classList.toggle('show', show);
}

function createSelector(rootId) {
  const root = document.getElementById(rootId);
  if (!root) return null;
  const search = root.querySelector('.selector-search');
  const listEl = root.querySelector('[data-role="available"]');
  const chipsEl = root.querySelector('[data-role="selected"]');

  let items = [];
  let selected = new Set();

  function render() {
    const q = (search?.value || '').toLowerCase();
    const available = items.filter(it => !selected.has(it.id))
      .filter(it => !q || it.label.toLowerCase().includes(q) || (it.sub || '').toLowerCase().includes(q));

    listEl.innerHTML = '';
    available.forEach(it => {
      const row = document.createElement('div');
      row.className = 'selector-item';
      row.innerHTML = `
        <div>
          <strong>${it.label}</strong>
          <div class="muted" style="font-size:11px;">${it.sub || ''}</div>
        </div>
        <span>+</span>
      `;
      row.addEventListener('click', () => {
        selected.add(it.id);
        render();
      });
      listEl.appendChild(row);
    });

    chipsEl.innerHTML = '';
    items.filter(it => selected.has(it.id)).forEach(it => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `${it.label} <button type="button">×</button>`;
      chip.querySelector('button').addEventListener('click', () => {
        selected.delete(it.id);
        render();
      });
      chipsEl.appendChild(chip);
    });
  }

  if (search) search.addEventListener('input', render);

  return {
    setItems(newItems) {
      items = Array.isArray(newItems) ? newItems : [];
      render();
    },
    setSelected(ids) {
      selected = new Set((ids || []).map(v => Number(v)).filter(v => v));
      render();
    },
    getSelected() {
      return Array.from(selected);
    }
  };
}

function ensureSelector(rootId) {
  if (!state.selectors[rootId]) {
    const sel = createSelector(rootId);
    if (sel) state.selectors[rootId] = sel;
  }
  return state.selectors[rootId];
}

function textToOptions(v) {
  return (v || '').split(',').map(s => s.trim()).filter(Boolean);
}

const state = {
  setores: [],
  modelos: [],
  modelosTarefa: [],
  usuarios: [],
  editSetorId: null,
  editModeloId: null,
  editModeloTarefaId: null,
  selectors: {},
  savingSetor: false,
  savingModelo: false,
  savingModeloTarefa: false
};

async function fetchJson(url, opts) {
  const res = await Auth.fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Falha na requisição.');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function fillUserSidebar() {
  const u = getUserFromPortal();
  qs('sidebarUserName').textContent = u.nome;
  qs('sidebarUserRole').textContent = u.isAdmin || u.projetosAdmin ? 'Admin Projetos' : 'Usuário';
  qs('sidebarAvatar').textContent = (u.nome || 'U').trim().charAt(0).toUpperCase();
}

function parseJsonMaybe(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return value;
}

function formatDetalhesVinculos(detalhes) {
  if (!detalhes) return '';
  if (Array.isArray(detalhes.projetos_ativos) && detalhes.projetos_ativos.length) {
    const nomes = detalhes.projetos_ativos.map(p => `#${p.id} ${p.nome || ''}`.trim()).join(', ');
    return `Projetos ativos: ${nomes}`;
  }
  const entries = Object.entries(detalhes)
    .filter(([, v]) => Number(v || 0) > 0)
    .map(([k, v]) => `${k}: ${v}`);
  return entries.length ? `Vínculos: ${entries.join(', ')}` : '';
}

function addOpcaoChip(chipsEl, value) {
  const v = (value || '').trim();
  if (!v) return;
  const exists = Array.from(chipsEl.querySelectorAll('.chip')).some(c => (c.dataset.value || '') === v);
  if (exists) return;
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.dataset.value = v;
  chip.innerHTML = `<span>${v}</span><button type="button" aria-label="Remover">×</button>`;
  chip.querySelector('button').addEventListener('click', () => chip.remove());
  chipsEl.appendChild(chip);
}

function getOpcoesFromRow(row) {
  const chipsEl = row.querySelector('.c-opcoes-chips');
  if (!chipsEl) return [];
  return Array.from(chipsEl.querySelectorAll('.chip')).map(c => c.dataset.value).filter(Boolean);
}

function initOpcoesRow(row, initialOptions, allowedTipos) {
  const tipoSel = row.querySelector('.c-tipo');
  const wrap = row.querySelector('.c-opcoes-wrap');
  const chips = row.querySelector('.c-opcoes-chips');
  const input = row.querySelector('.c-opcao-input');
  const addBtn = row.querySelector('.c-opcao-add');

  (initialOptions || []).forEach(opt => addOpcaoChip(chips, opt));

  const refreshVisibility = () => {
    const show = allowedTipos.includes(tipoSel.value);
    wrap.style.display = show ? 'block' : 'none';
  };
  refreshVisibility();

  tipoSel.addEventListener('change', refreshVisibility);

  const commit = () => {
    addOpcaoChip(chips, input.value);
    input.value = '';
    input.focus();
  };
  addBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    commit();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      commit();
    }
  });
}

function hideAdminLinks() {
  const u = getUserFromPortal();
  if (!(u.isAdmin || u.projetosAdmin)) {
    document.querySelectorAll('[data-projetos-admin="1"]').forEach(el => el.remove());
  }
}

function renderSetores() {
  const tbody = qs('tbodySetores');
  tbody.innerHTML = '';
  state.setores.forEach(s => {
    const tr = document.createElement('tr');
    const membrosTxt = (s.membros || []).map(m => m.nome).join(', ');
    const aprovTxt = (s.aprovadores || []).map(m => m.nome).join(', ');
    tr.innerHTML = `
      <td>${s.nome || '-'}</td>
      <td>${s.descricao || '-'}</td>
      <td>${s.ativo ? 'Ativo' : 'Inativo'}</td>
      <td>
        <div><strong>Membros:</strong> ${membrosTxt || '-'}</div>
        <div><strong>Aprovadores:</strong> ${aprovTxt || '-'}</div>
      </td>
      <td>
        <button class="btn ghost" data-edit="${s.id}">Editar</button>
        <button class="btn ghost" data-del="${s.id}">Excluir</button>
        <button class="btn ghost" data-toggle="${s.id}">${s.ativo ? 'Inativar' : 'Ativar'}</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openSetorModal(Number(btn.dataset.edit)));
  });
  tbody.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => deleteSetor(Number(btn.dataset.del)));
  });
  tbody.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => toggleSetor(Number(btn.dataset.toggle)));
  });
}

function renderModelos() {
  const tbody = qs('tbodyModelos');
  tbody.innerHTML = '';
  state.modelos.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.nome || '-'}</td>
      <td>${m.descricao || '-'}</td>
      <td>${m.ativo ? 'Ativo' : 'Inativo'}</td>
      <td>
        <button class="btn ghost" data-edit="${m.id}">Editar</button>
        <button class="btn ghost" data-del="${m.id}">Excluir</button>
        <button class="btn ghost" data-toggle="${m.id}">${m.ativo ? 'Inativar' : 'Ativar'}</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-edit]').forEach(btn => {
    const id = Number(btn.dataset.edit);
    btn.addEventListener('click', () => openModeloModal(id));
  });
  tbody.querySelectorAll('[data-del]').forEach(btn => {
    const id = Number(btn.dataset.del);
    btn.addEventListener('click', () => deleteModelo(id));
  });
  tbody.querySelectorAll('[data-toggle]').forEach(btn => {
    const id = Number(btn.dataset.toggle);
    btn.addEventListener('click', () => toggleModelo(id));
  });
}

function renderModelosTarefa() {
  const tbody = qs('tbodyModelosTarefa');
  tbody.innerHTML = '';
  state.modelosTarefa.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.nome || '-'}</td>
      <td>${m.descricao || '-'}</td>
      <td>${m.ativo ? 'Ativo' : 'Inativo'}</td>
      <td>
        <button class="btn ghost" data-edit-t="${m.id}">Editar</button>
        <button class="btn ghost" data-del-t="${m.id}">Excluir</button>
        <button class="btn ghost" data-toggle-t="${m.id}">${m.ativo ? 'Inativar' : 'Ativar'}</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-edit-t]').forEach(btn => {
    const id = Number(btn.dataset.editT);
    btn.addEventListener('click', () => openModeloTarefaModal(id));
  });
  tbody.querySelectorAll('[data-del-t]').forEach(btn => {
    const id = Number(btn.dataset.delT);
    btn.addEventListener('click', () => deleteModeloTarefa(id));
  });
  tbody.querySelectorAll('[data-toggle-t]').forEach(btn => {
    const id = Number(btn.dataset.toggleT);
    btn.addEventListener('click', () => toggleModeloTarefa(id));
  });
}


async function loadAll() {
  try {
    state.setores = await fetchJson(`${window.API_BASE_URL}/api/projetos/setores?with_membros=1`);
    state.usuarios = await fetchJson(`${window.API_BASE_URL}/api/projetos/usuarios`);
    state.modelos = (await fetchJson(`${window.API_BASE_URL}/api/projetos/modelos`)).map(m => ({
      ...m,
      id: Number(m.id),
      definicao_json: parseJsonMaybe(m.definicao_json)
    }));
    state.modelosTarefa = (await fetchJson(`${window.API_BASE_URL}/api/projetos/tarefas-modelos`)).map(m => ({
      ...m,
      id: Number(m.id),
      definicao_json: parseJsonMaybe(m.definicao_json)
    }));
    renderSetores();
    renderModelos();
    renderModelosTarefa();
    fillSelects();
  } catch (err) {
    alert(err.message || 'Falha ao carregar dados.');
  }
}

function fillSelects() {
  const userItems = state.usuarios.map(u => ({
    id: u.id,
    label: u.nome,
    sub: u.email || ''
  }));
  const setorItems = state.setores.map(s => ({
    id: s.id,
    label: s.nome,
    sub: s.descricao || ''
  }));

  ensureSelector('selSetorMembros').setItems(userItems);
  ensureSelector('selSetorAprovadores').setItems(userItems);
  ensureSelector('selModeloSetores').setItems(setorItems);
  const setorSelect = qs('tarefaModeloSetor');
  if (setorSelect) {
    setorSelect.innerHTML = '<option value="">Selecione...</option>' +
      setorItems.map(s => `<option value="${s.id}">${s.label}</option>`).join('');
  }

  ensureSelector('selAprovProjUsers').setItems(userItems);
  ensureSelector('selAprovTarefaUsers').setItems(userItems);
  // ensureSelector('selAprovGastoUsers').setItems(userItems);
  // ensureSelector('selAprovCompraUsers').setItems(userItems);

  ensureSelector('selAprovProjSetores').setItems(setorItems);
  ensureSelector('selAprovTarefaSetores').setItems(setorItems);
  // ensureSelector('selAprovGastoSetores').setItems(setorItems);
  // ensureSelector('selAprovCompraSetores').setItems(setorItems);
}

function resetSetorModal() {
  state.editSetorId = null;
  qs('modalSetorTitle').textContent = 'Novo setor';
  qs('setorNome').value = '';
  qs('setorDesc').value = '';
  qs('setorAtivo').checked = true;
  ensureSelector('selSetorMembros').setSelected([]);
  ensureSelector('selSetorAprovadores').setSelected([]);
}

function openSetorModal(id) {
  resetSetorModal();
  if (id) {
    const s = state.setores.find(x => x.id === id);
    if (!s) return;
    state.editSetorId = id;
    qs('modalSetorTitle').textContent = `Editar setor #${id}`;
    qs('setorNome').value = s.nome || '';
    qs('setorDesc').value = s.descricao || '';
    qs('setorAtivo').checked = s.ativo !== false;
    ensureSelector('selSetorMembros').setSelected((s.membros || []).map(m => m.id));
    ensureSelector('selSetorAprovadores').setSelected((s.aprovadores || []).map(m => m.id));
  }
  openModal(qs('modalSetor'), true);
}

async function saveSetor() {
  if (state.savingSetor) return;
  state.savingSetor = true;
  const payload = {
    nome: qs('setorNome').value.trim(),
    descricao: qs('setorDesc').value.trim() || null,
    ativo: qs('setorAtivo').checked
  };
  const membros = ensureSelector('selSetorMembros').getSelected();
  const aprovadores = ensureSelector('selSetorAprovadores').getSelected();

  if (!payload.nome) {
    alert('Nome do setor é obrigatório.');
    return;
  }

  try {
    let setorId = state.editSetorId;
    if (setorId) {
      await fetchJson(`${window.API_BASE_URL}/api/projetos/setores/${setorId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      const created = await fetchJson(`${window.API_BASE_URL}/api/projetos/setores`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setorId = created.id;
    }

    await syncSetorMembros(setorId, membros);
    await syncSetorAprovadores(setorId, aprovadores);
    openModal(qs('modalSetor'), false);
    await loadAll();
  } finally {
    state.savingSetor = false;
  }
}

async function syncSetorMembros(setorId, selected) {
  const setor = state.setores.find(s => s.id === setorId);
  const atuais = (setor?.membros || []).map(m => m.id);
  const toAdd = selected.filter(id => !atuais.includes(id));
  const toRemove = atuais.filter(id => !selected.includes(id));

  for (const userId of toAdd) {
    await fetchJson(`${window.API_BASE_URL}/api/projetos/setores/${setorId}/membros`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    });
  }
  for (const userId of toRemove) {
    await fetchJson(`${window.API_BASE_URL}/api/projetos/setores/${setorId}/membros`, {
      method: 'DELETE',
      body: JSON.stringify({ user_id: userId })
    });
  }
}

async function syncSetorAprovadores(setorId, selected) {
  const setor = state.setores.find(s => s.id === setorId);
  const atuais = (setor?.aprovadores || []).map(m => m.id);
  const toAdd = selected.filter(id => !atuais.includes(id));
  const toRemove = atuais.filter(id => !selected.includes(id));

  for (const userId of toAdd) {
    await fetchJson(`${window.API_BASE_URL}/api/projetos/setores/${setorId}/aprovadores`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    });
  }
  for (const userId of toRemove) {
    await fetchJson(`${window.API_BASE_URL}/api/projetos/setores/${setorId}/aprovadores`, {
      method: 'DELETE',
      body: JSON.stringify({ user_id: userId })
    });
  }
}

async function deleteSetor(id) {
  if (!confirm('Deseja excluir este setor?')) return;
  try {
    await fetchJson(`${window.API_BASE_URL}/api/projetos/setores/${id}`, { method: 'DELETE' });
    await loadAll();
  } catch (err) {
    const detalhes = err?.data?.detalhes;
    if (err?.status === 409 && detalhes) {
      const detalheTxt = formatDetalhesVinculos(detalhes);
      alert(`${err?.data?.error || 'Não foi possível excluir.'}${detalheTxt ? `\n${detalheTxt}` : ''}`);
    } else {
      alert(err.message || 'Falha ao excluir setor.');
    }
  }
}

async function toggleSetor(id) {
  const setor = state.setores.find(s => s.id === id);
  if (!setor) return;
  const ativo = !(setor.ativo !== false);
  await fetchJson(`${window.API_BASE_URL}/api/projetos/setores/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ativo })
  });
  await loadAll();
}

async function deleteModelo(id) {
  if (!confirm('Deseja excluir este modelo?')) return;
  try {
    await fetchJson(`${window.API_BASE_URL}/api/projetos/modelos/${id}`, { method: 'DELETE' });
    await loadAll();
  } catch (err) {
    const detalhes = err?.data?.detalhes;
    if (err?.status === 409 && detalhes) {
      const detalheTxt = formatDetalhesVinculos(detalhes);
      alert(`${err?.data?.error || 'Não foi possível excluir.'}${detalheTxt ? `\n${detalheTxt}` : ''}`);
    } else {
      alert(err.message || 'Falha ao excluir modelo.');
    }
  }
}

async function toggleModelo(id) {
  const modelo = state.modelos.find(m => m.id === id);
  if (!modelo) return;
  const ativo = !(modelo.ativo !== false);
  await fetchJson(`${window.API_BASE_URL}/api/projetos/modelos/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ativo })
  });
  await loadAll();
}

async function deleteModeloTarefa(id) {
  if (!confirm('Deseja excluir este modelo de tarefa?')) return;
  try {
    await fetchJson(`${window.API_BASE_URL}/api/projetos/tarefas-modelos/${id}`, { method: 'DELETE' });
    await loadAll();
  } catch (err) {
    const detalhes = err?.data?.detalhes;
    if (err?.status === 409 && detalhes) {
      const detalheTxt = formatDetalhesVinculos(detalhes);
      alert(`${err?.data?.error || 'Não foi possível excluir.'}${detalheTxt ? `\n${detalheTxt}` : ''}`);
    } else {
      alert(err.message || 'Falha ao excluir modelo de tarefa.');
    }
  }
}

async function toggleModeloTarefa(id) {
  const modelo = state.modelosTarefa.find(m => m.id === id);
  if (!modelo) return;
  const ativo = !(modelo.ativo !== false);
  await fetchJson(`${window.API_BASE_URL}/api/projetos/tarefas-modelos/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ativo })
  });
  await loadAll();
}

function resetModeloModal() {
  state.editModeloId = null;
  qs('modalModeloTitle').textContent = 'Novo modelo';
  qs('modeloNome').value = '';
  qs('modeloDesc').value = '';
  qs('modeloPrioridade').value = 'MEDIA';
  qs('modeloAtivo').value = 'true';
  qs('modeloExigeNome').value = 'true';
  qs('modeloExigePrazo').value = 'false';
  qs('etapasList').innerHTML = '';
  qs('camposProjetoList').innerHTML = '';
  qs('camposTarefaList').innerHTML = '';
  ensureSelector('selModeloSetores').setSelected([]);
  ensureSelector('selAprovProjUsers').setSelected([]);
  ensureSelector('selAprovProjSetores').setSelected([]);
  ensureSelector('selAprovTarefaUsers').setSelected([]);
  ensureSelector('selAprovTarefaSetores').setSelected([]);
  // ensureSelector('selAprovGastoUsers').setSelected([]);
  // ensureSelector('selAprovGastoSetores').setSelected([]);
  // ensureSelector('selAprovCompraUsers').setSelected([]);
  // ensureSelector('selAprovCompraSetores').setSelected([]);
  qs('aprovProjObrig').checked = false;
  qs('aprovTarefaObrig').checked = false;
  // qs('aprovGastoObrig').checked = false;
  // qs('aprovCompraObrig').checked = false;
}

function resetModeloTarefaModal() {
  state.editModeloTarefaId = null;
  qs('modalModeloTarefaTitle').textContent = 'Novo modelo de tarefa';
  qs('tarefaModeloNome').value = '';
  qs('tarefaModeloDesc').value = '';
  qs('tarefaModeloAtivo').value = 'true';
  qs('tarefaModeloSetor').value = '';
  qs('tarefaCamposList').innerHTML = '';
  qs('tarefaRequerAprov').checked = false;
  qs('tarefaRequerUpload').checked = false;
  qs('tarefaSlaBaixa').value = '';
  qs('tarefaSlaMedia').value = '';
  qs('tarefaSlaUrgente').value = '';
}

function addEtapaRow(data = {}) {
  const row = document.createElement('div');
  row.className = 'row-item row-etapa';
  row.innerHTML = `
    <input class="e-nome" placeholder="Nome da etapa" value="${data.nome || ''}" />
    <select class="e-setor"></select>
    <select class="e-prio">
      <option value="BAIXA">Baixa</option>
      <option value="MEDIA">Média</option>
      <option value="ALTA">Alta</option>
      <option value="URGENTE">Urgente</option>
    </select>
    <button class="btn ghost c-remove" type="button"><i class="ph ph-trash"></i></button>
  `;
  const setorSel = row.querySelector('.e-setor');
  setorSel.innerHTML = `<option value="">(sem setor)</option>` + state.setores.map(s => `<option value="${s.id}">${s.nome}</option>`).join('');
  setorSel.value = data.setor_id || '';
  row.querySelector('.e-prio').value = data.prioridade_padrao || 'MEDIA';
  row.querySelector('.c-remove').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    row.remove();
  });
  qs('etapasList').appendChild(row);
}

function addCampoRow(containerId, data = {}) {
  const row = document.createElement('div');
  row.className = 'row-item row-campo';
  row.innerHTML = `
    <div style="display:flex; gap:0.5rem; width:100%;">
      <input class="c-label" placeholder="Nome do campo" value="${data.label || data.nome || ''}" />
      <select class="c-tipo">
        <option value="texto">Texto</option>
        <option value="numero">Número</option>
        <option value="data">Data</option>
        <option value="select">Seleção</option>
        <option value="textarea">Texto longo</option>
        <option value="moeda">Moeda</option>
              <option value=\"upload\">Upload</option>
      </select>
      <button class="btn ghost c-remove" type="button"><i class="ph ph-trash"></i></button>
    </div>
    <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.5rem;">
      <label class="chk-inline"><input class="c-obrig" type="checkbox" /> Obrigatório</label>
    </div>
    <div class="c-opcoes-wrap">
      <div class="c-opcoes-chips"></div>
      <div class="c-opcoes-input">
        <input class="c-opcao-input" placeholder="Adicionar opção e pressionar Enter" />
        <button class="btn secondary c-opcao-add" type="button">Adicionar</button>
      </div>
    </div>
  `;
  row.querySelector('.c-tipo').value = data.tipo || 'texto';
  row.querySelector('.c-obrig').checked = !!data.obrigatorio;
  initOpcoesRow(row, data.opcoes || [], ['select']);
  row.querySelector('.c-remove').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    row.remove();
  });
  qs(containerId).appendChild(row);
}

function addTarefaCampoRow(data = {}) {
  const row = document.createElement('div');
  row.className = 'row-item row-campo';
  row.innerHTML = `
    <div style="display:flex; gap:0.5rem; width:100%;">
      <input class="c-label" placeholder="Nome do campo" value="${data.label || ''}" />
      <select class="c-tipo">
        <option value="texto">Texto</option>
        <option value="numero">Número</option>
        <option value="data">Data</option>
        <option value="selecao">Seleção</option>
        <option value="upload">Upload</option>
      </select>
      <button class="btn ghost c-remove" type="button"><i class="ph ph-trash"></i></button>
    </div>
    <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.5rem;">
      <label class="chk-inline"><input class="c-obrig" type="checkbox" /> Obrigatório</label>
    </div>
    <div class="c-opcoes-wrap">
      <div class="c-opcoes-chips"></div>
      <div class="c-opcoes-input">
        <input class="c-opcao-input" placeholder="Adicionar opção e pressionar Enter" />
        <button class="btn secondary c-opcao-add" type="button">Adicionar</button>
      </div>
    </div>
  `;
  row.querySelector('.c-tipo').value = data.tipo || 'texto';
  row.querySelector('.c-obrig').checked = !!data.obrigatorio;
  initOpcoesRow(row, data.opcoes || [], ['selecao']);
  row.querySelector('.c-remove').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    row.remove();
  });
  qs('tarefaCamposList').appendChild(row);
}

async function openModeloTarefaModal(id) {
  resetModeloTarefaModal();
  state.editModeloTarefaId = id || null;

  if (id) {
    const modelo = state.modelosTarefa.find(m => Number(m.id) === Number(id));
    qs('modalModeloTarefaTitle').textContent = `Editar modelo de tarefa #${id}`;
    qs('tarefaModeloNome').value = modelo?.nome || '';
    qs('tarefaModeloDesc').value = modelo?.descricao || '';
    qs('tarefaModeloAtivo').value = modelo?.ativo ? 'true' : 'false';
    qs('tarefaModeloSetor').value = modelo?.setor_id || '';
    const def = parseJsonMaybe(modelo?.definicao_json);
    (def.campos || []).forEach(c => addTarefaCampoRow(c));
    qs('tarefaRequerAprov').checked = !!def.requer_aprovacao;
    qs('tarefaRequerUpload').checked = !!def.requer_upload;
    const sla = def.sla_regras || {};
    qs('tarefaSlaBaixa').value = sla.BAIXA ?? '';
    qs('tarefaSlaMedia').value = sla.MEDIA ?? '';
    qs('tarefaSlaUrgente').value = sla.URGENTE ?? '';
  }

  if (!id) {
    addTarefaCampoRow({ key: 'descricao', label: 'Descrição', tipo: 'texto' });
  }

  openModal(qs('modalModeloTarefa'), true);
}

function collectTarefaCampos() {
  return Array.from(qs('tarefaCamposList').querySelectorAll('.row-campo')).map(row => {
    const label = row.querySelector('.c-label').value.trim();
    const tipo = row.querySelector('.c-tipo').value;
    return {
      key: (label || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      label: label,
      tipo: tipo,
      obrigatorio: row.querySelector('.c-obrig').checked,
      opcoes: tipo === 'selecao' ? getOpcoesFromRow(row) : []
    };
  }).filter(c => c.label);
}

async function saveModeloTarefa() {
  if (state.savingModeloTarefa) return;
  state.savingModeloTarefa = true;
  const nome = qs('tarefaModeloNome').value.trim();
  if (!nome) { alert('Nome do modelo de tarefa é obrigatório.'); state.savingModeloTarefa = false; return; }
  const setorId = Number(qs('tarefaModeloSetor').value || 0);
  if (!setorId) { alert('Setor é obrigatório.'); state.savingModeloTarefa = false; return; }
  const definicao_json = {
    campos: collectTarefaCampos(),
    requer_aprovacao: qs('tarefaRequerAprov').checked,
    requer_upload: qs('tarefaRequerUpload').checked,
    sla_regras: {
      BAIXA: Number(qs('tarefaSlaBaixa').value || 0),
      MEDIA: Number(qs('tarefaSlaMedia').value || 0),
      URGENTE: Number(qs('tarefaSlaUrgente').value || 0)
    }
  };
  try {
    if (state.editModeloTarefaId) {
      await fetchJson(`${window.API_BASE_URL}/api/projetos/tarefas-modelos/${state.editModeloTarefaId}`, {
        method: 'PUT',
        body: JSON.stringify({
          nome,
          descricao: qs('tarefaModeloDesc').value.trim() || null,
          ativo: qs('tarefaModeloAtivo').value === 'true',
          setor_id: setorId,
          definicao_json
        })
      });
    } else {
      await fetchJson(`${window.API_BASE_URL}/api/projetos/tarefas-modelos`, {
        method: 'POST',
        body: JSON.stringify({
          nome,
          descricao: qs('tarefaModeloDesc').value.trim() || null,
          ativo: qs('tarefaModeloAtivo').value === 'true',
          setor_id: setorId,
          definicao_json
        })
      });
    }
    openModal(qs('modalModeloTarefa'), false);
    await loadAll();
  } finally {
    state.savingModeloTarefa = false;
  }
}

async function openModeloModal(id) {
  resetModeloModal();
  state.editModeloId = id || null;

  if (id) {
    const modelo = state.modelos.find(m => Number(m.id) === Number(id));
    qs('modalModeloTitle').textContent = `Editar modelo #${id}`;
    qs('modeloNome').value = modelo?.nome || '';
    qs('modeloDesc').value = modelo?.descricao || '';
    qs('modeloAtivo').value = modelo?.ativo ? 'true' : 'false';
    const def = parseJsonMaybe(modelo?.definicao_json);
    qs('modeloPrioridade').value = def.prioridade_inicial || 'MEDIA';
    const cfg = def.config || {};
    qs('modeloExigeNome').value = cfg.exigir_nome_projeto === false ? 'false' : 'true';
    qs('modeloExigePrazo').value = cfg.exigir_prazo_final ? 'true' : 'false';

    (def.etapas || []).forEach(c => addEtapaRow(c));
    (def.campos_projeto || []).forEach(c => addCampoRow('camposProjetoList', c));
    (def.campos_tarefa || []).forEach(c => addCampoRow('camposTarefaList', c));
    ensureSelector('selModeloSetores').setSelected(def.setores_permitidos || []);

    const ap = def.aprovacoes_regras || {};
    fillAprovSection('Proj', ap.projeto);
    fillAprovSection('Tarefa', ap.tarefa);
    // fillAprovSection('Gasto', ap.gasto);
    // fillAprovSection('Compra', ap.compra);
  }

  if (!id) {
    addEtapaRow({ nome: 'Solicitado', prioridade_padrao: 'MEDIA' });
    addEtapaRow({ nome: 'Em andamento', prioridade_padrao: 'MEDIA' });
    addEtapaRow({ nome: 'Concluído', prioridade_padrao: 'BAIXA' });
  }

  openModal(qs('modalModelo'), true);
}

function fillAprovSection(prefix, data = {}) {
  qs(`aprov${prefix}Obrig`).checked = !!data?.obrigatoria;
  ensureSelector(`selAprov${prefix}Users`).setSelected(data?.usuarios || []);
  ensureSelector(`selAprov${prefix}Setores`).setSelected(data?.setores || []);
}

function collectEtapas() {
  return Array.from(qs('etapasList').querySelectorAll('.row-etapa')).map((row, idx) => ({
    nome: row.querySelector('.e-nome').value.trim() || `Etapa ${idx + 1}`,
    setor_id: Number(row.querySelector('.e-setor').value || 0) || null,
    prioridade_padrao: row.querySelector('.e-prio').value || 'MEDIA'
  }));
}

function collectCampos(containerId) {
  return Array.from(qs(containerId).querySelectorAll('.row-campo')).map(row => ({
    label: row.querySelector('.c-label').value.trim(),
    tipo: row.querySelector('.c-tipo').value,
    obrigatorio: row.querySelector('.c-obrig').checked,
    opcoes: row.querySelector('.c-tipo').value === 'select' ? getOpcoesFromRow(row) : []
  })).map(c => {
    c.key = c.label ? c.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') : '';
    return c;
  }).filter(c => c.key || c.label);
}

function collectAprov(prefix) {
  return {
    obrigatoria: qs(`aprov${prefix}Obrig`).checked,
    usuarios: ensureSelector(`selAprov${prefix}Users`).getSelected(),
    setores: ensureSelector(`selAprov${prefix}Setores`).getSelected()
  };
}

async function saveModelo() {
  if (state.savingModelo) return;
  state.savingModelo = true;
  const nome = qs('modeloNome').value.trim();
  if (!nome) {
    alert('Nome do modelo é obrigatório.');
    state.savingModelo = false;
    return;
  }
  const definicao_json = {
    etapas: collectEtapas(),
    setores_permitidos: ensureSelector('selModeloSetores').getSelected(),
    campos_projeto: collectCampos('camposProjetoList'),
    campos_tarefa: collectCampos('camposTarefaList'),
    prioridade_inicial: qs('modeloPrioridade').value || 'MEDIA',
    config: {
      exigir_nome_projeto: qs('modeloExigeNome').value === 'true',
      exigir_prazo_final: qs('modeloExigePrazo').value === 'true'
    },
    aprovacoes_regras: {
      projeto: collectAprov('Proj'),
      tarefa: collectAprov('Tarefa'),
      // gasto: collectAprov('Gasto'),
      // compra: collectAprov('Compra')
    }
  };

  try {
    if (state.editModeloId) {
      await fetchJson(`${window.API_BASE_URL}/api/projetos/modelos/${state.editModeloId}`, {
        method: 'PUT',
        body: JSON.stringify({
          nome,
          descricao: qs('modeloDesc').value.trim() || null,
          ativo: qs('modeloAtivo').value === 'true',
          definicao_json
        })
      });
    } else {
      await fetchJson(`${window.API_BASE_URL}/api/projetos/modelos`, {
        method: 'POST',
        body: JSON.stringify({
          nome,
          descricao: qs('modeloDesc').value.trim() || null,
          ativo: qs('modeloAtivo').value === 'true',
          definicao_json
        })
      });
    }

    openModal(qs('modalModelo'), false);
    await loadAll();
  } finally {
    state.savingModelo = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!guardProjetosAdmin()) return;
  fillUserSidebar();
  hideAdminLinks();

  ['camposProjetoList', 'camposTarefaList', 'tarefaCamposList'].forEach(id => {
    const el = qs(id);
    if (!el) return;
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('.c-remove');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const row = btn.closest('.row-campo');
      if (row) row.remove();
    });
  });

  qs('btnVoltar').addEventListener('click', () => history.back());
  qs('btnReload').addEventListener('click', loadAll);

  qs('btnNovoSetor').addEventListener('click', () => openSetorModal());
  qs('closeSetor').addEventListener('click', () => openModal(qs('modalSetor'), false));
  qs('cancelSetor').addEventListener('click', () => openModal(qs('modalSetor'), false));
  qs('saveSetor').addEventListener('click', saveSetor);

  qs('btnNovoModelo').addEventListener('click', () => openModeloModal());
  qs('closeModelo').addEventListener('click', () => openModal(qs('modalModelo'), false));
  qs('cancelModelo').addEventListener('click', () => openModal(qs('modalModelo'), false));
  qs('saveModelo').addEventListener('click', saveModelo);

  qs('addEtapa').addEventListener('click', () => addEtapaRow());
  qs('addCampoProjeto').addEventListener('click', () => addCampoRow('camposProjetoList'));
  qs('addCampoTarefa').addEventListener('click', () => addCampoRow('camposTarefaList'));

  qs('btnNovoModeloTarefa').addEventListener('click', () => openModeloTarefaModal());
  qs('closeModeloTarefa').addEventListener('click', () => openModal(qs('modalModeloTarefa'), false));
  qs('cancelModeloTarefa').addEventListener('click', () => openModal(qs('modalModeloTarefa'), false));
  qs('saveModeloTarefa').addEventListener('click', saveModeloTarefa);
  qs('addTarefaCampo').addEventListener('click', () => addTarefaCampoRow());


  await loadAll();
});
