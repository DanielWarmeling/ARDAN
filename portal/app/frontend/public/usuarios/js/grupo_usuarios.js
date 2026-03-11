// grupo_usuarios.js
// Mesma lógica do HTML original, apenas extraída para arquivo próprio.

const $ = (id) => document.getElementById(id);

function getToken() {
  return localStorage.getItem('token') || '';
}

function decodePayload(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return {};
  }
}

async function fetchJSON(url, opts) {
  const token = getToken();
  const headers = Object.assign(
    { 'Authorization': token },
    (opts && opts.headers) || {}
  );

  const response = await fetch(url, Object.assign({}, opts, { headers }));
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || 'Falha na requisição');
  }

  return data;
}

let gruposCache = [];
let usuariosCache = [];
let grupoSel = null;

// Carrega usuários para o select de membros
async function carregarUsuarios() {
  const data = await fetchJSON(`${API_BASE_URL}/api/usuarios`);
  usuariosCache = data;

  const sel = $('m-usuarios');
  sel.innerHTML = '';

  usuariosCache.forEach((u) => {
    const o = document.createElement('option');
    o.value = u.id; // compatível com backend
    o.dataset.dwh = u.dwh_codigo || '';
    o.textContent = `${u.nome} • ${u.username || '-'} • ${u.email} • DWH:${u.dwh_codigo || '-'}`;
    sel.appendChild(o);
  });
}

// Lista grupos
async function listarGrupos() {
  const q = $('g-busca').value.trim();
  const url = q
    ? `${API_BASE_URL}/api/grupos?q=${encodeURIComponent(q)}`
    : `${API_BASE_URL}/api/grupos`;

  const data = await fetchJSON(url);
  gruposCache = data;
  renderGrupos();
}

// Renderiza tabela de grupos
function renderGrupos() {
  const tb = $('g-tbody');
  tb.innerHTML = '';

  gruposCache.forEach((g) => {
    const tr = document.createElement('tr');

    const tdNome = document.createElement('td');
    tdNome.textContent = g.nome;

    const tdDesc = document.createElement('td');
    tdDesc.textContent = g.descricao || '';

    const tdStatus = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = 'pill ' + (g.ativo ? 'on' : 'off');
    pill.textContent = g.ativo ? 'Ativo' : 'Inativo';
    tdStatus.appendChild(pill);

    const tdAcoes = document.createElement('td');

    const btnSel = document.createElement('button');
    btnSel.className = 'btn btn-primary btn-sm';
    btnSel.textContent = 'Gerenciar membros';
    btnSel.onclick = () => selecionarGrupo(g);

    const btnRenomear = document.createElement('button');
    btnRenomear.className = 'btn btn-light btn-sm';
    btnRenomear.textContent = 'Renomear';
    btnRenomear.onclick = () => renomear(g);

    const btnOnOff = document.createElement('button');
    btnOnOff.className = 'btn btn-light btn-sm';
    btnOnOff.textContent = g.ativo ? 'Inativar' : 'Ativar';
    btnOnOff.onclick = () => ativarInativar(g);

    tdAcoes.appendChild(btnSel);
    tdAcoes.appendChild(btnRenomear);
    tdAcoes.appendChild(btnOnOff);

    tr.appendChild(tdNome);
    tr.appendChild(tdDesc);
    tr.appendChild(tdStatus);
    tr.appendChild(tdAcoes);

    tb.appendChild(tr);
  });
}

// Criar grupo
async function criarGrupo() {
  const nome = $('g-nome').value.trim();
  const descricao = $('g-desc').value.trim();

  if (!nome) {
    alert('Informe o nome do grupo');
    return;
  }

  await fetchJSON(`${API_BASE_URL}/api/grupos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, descricao })
  });

  $('g-nome').value = '';
  $('g-desc').value = '';

  await listarGrupos();
}

// Renomear grupo
async function renomear(g) {
  const nome = prompt('Novo nome do grupo:', g.nome);
  if (nome == null) return;

  const descricao = prompt('Descrição (opcional):', g.descricao || '');
  await fetchJSON(`${API_BASE_URL}/api/grupos/${g.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nome: nome.trim(),
      descricao: (descricao || '').trim()
    })
  });

  await listarGrupos();
}

// Ativar / Inativar grupo
async function ativarInativar(g) {
  await fetchJSON(`${API_BASE_URL}/api/grupos/${g.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ativo: !g.ativo })
  });

  await listarGrupos();
}

// Selecionar grupo para gerenciar membros
async function selecionarGrupo(g) {
  grupoSel = g;
  $('m-grupo-nome').textContent = g.nome;
  $('membros-card').classList.remove('hidden');

  await carregarUsuarios();
  await listarMembros();
}

// Buscar membros do grupo selecionado
async function listarMembros() {
  if (!grupoSel) return;
  const data = await fetchJSON(`${API_BASE_URL}/api/grupos/${grupoSel.id}/membros`);
  renderMembros(data);
}

// Renderiza tabela de membros
function renderMembros(rows) {
  const tb = $('m-tbody');
  tb.innerHTML = '';

  rows.forEach((m) => {
    const tr = document.createElement('tr');

    const tdU = document.createElement('td');
    tdU.textContent = m.nome;

    const tdUN = document.createElement('td');
    tdUN.textContent = m.username || '-';

    const tdE = document.createElement('td');
    tdE.textContent = m.email;

    const tdC = document.createElement('td');
    tdC.textContent = m.dwh_codigo || '-';

    const tdP = document.createElement('td');
    tdP.textContent = m.isadmin ? 'Admin' : 'Padrão';

    const tdA = document.createElement('td');
    const btnRem = document.createElement('button');
    btnRem.className = 'btn btn-danger btn-sm';
    btnRem.textContent = 'Remover';
    btnRem.onclick = () => removerMembro(m.usuario_id, m.dwh_codigo);

    tdA.appendChild(btnRem);

    tr.appendChild(tdU);
    tr.appendChild(tdUN);
    tr.appendChild(tdE);
    tr.appendChild(tdC);
    tr.appendChild(tdP);
    tr.appendChild(tdA);

    tb.appendChild(tr);
  });
}

// Adicionar membro ao grupo
async function adicionarMembro() {
  if (!grupoSel) return;

  const sel = $('m-usuarios');
  const usuarioId = Number(sel.value);
  const dwhCodigo = sel.options[sel.selectedIndex]?.dataset?.dwh || null;

  await fetchJSON(`${API_BASE_URL}/api/grupos/${grupoSel.id}/membros`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuarioId, dwhCodigo })
  });

  await listarMembros();
}

// Remover membro do grupo
async function removerMembro(usuarioId, dwhCodigo) {
  if (!grupoSel) return;

  await fetchJSON(`${API_BASE_URL}/api/grupos/${grupoSel.id}/membros/${usuarioId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dwhCodigo })
  });

  await listarMembros();
}

// Boot
document.addEventListener('DOMContentLoaded', async () => {
  // exige auth e admin (mesmo comportamento do original)
  if (typeof checkAuth === 'function') {
    checkAuth();
  }

  const token = getToken();
  const payload = decodePayload(token);

  if (!payload.isAdmin) {
    $('acesso-negado').classList.remove('hidden');
    return;
  }

  $('g-criar').onclick = criarGrupo;
  $('g-filtrar').onclick = listarGrupos;
  $('m-add').onclick = adicionarMembro;

  await listarGrupos();
});
