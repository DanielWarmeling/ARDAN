function getUserFromPortal() {
  const user = window.Auth?.getUser ? Auth.getUser() : {};
  const name = user.name || user.username || user.email || 'Usuário';
  return {
    id: user.sub || null,
    nome: name,
    isAdmin: !!(window.Auth?.hasRole && Auth.hasRole('portal_admin')),
    acessoProjetos: !!(window.Auth?.hasRole && (Auth.hasRole('projetos') || Auth.hasRole('projetos_admin') || Auth.hasRole('portal_admin'))),
    projetosAdmin: !!(window.Auth?.hasRole && (Auth.hasRole('projetos_admin') || Auth.hasRole('portal_admin')))
  };
}

function guardProjetos() {
  if (window.Auth?.requireAuth) window.Auth.requireAuth();
  const u = getUserFromPortal();
  if (!(u.isAdmin || u.acessoProjetos)) {
    alert('Sem permissão para acessar Projetos.');
    window.location.href = '/home.html';
    return false;
  }
  return true;
}

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

function formatDate(dt) {
  if (!dt) return '-';
  const d = new Date(dt);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR');
}

function statusBadge(status) {
  let type = 'neutral';
  if (status === 'APROVADO') type = 'success';
  if (status === 'REPROVADO') type = 'danger';
  if (status === 'PENDENTE') type = 'warn';
  return `<span class="badge ${type}">${status}</span>`;
}

async function loadAprovacoes() {
  const status = document.getElementById('f-status').value;
  const tipo = document.getElementById('f-tipo').value;
  const url = new URL(`${window.API_BASE_URL}/api/projetos/aprovacoes`);
  if (status) url.searchParams.set('status', status);
  if (tipo) url.searchParams.set('tipo', tipo);
  
  try {
    const data = await fetchJson(url.toString());
    renderAprovacoes(data);
  } catch (err) {
    console.error(err);
    alert('Erro ao carregar aprovações.');
  }
}

function renderAprovacoes(lista) {
  const tbody = document.getElementById('tbodyAprovacoes');
  tbody.innerHTML = '';
  
  if (!lista || !lista.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-secondary);">Nenhuma aprovação encontrada.</td></tr>';
    return;
  }

  lista.forEach(a => {
    const tr = document.createElement('tr');
    const motivo = a.motivo ? a.motivo : '-';
    const solicitante = a.solicitante_nome || a.solicitado_por || '-';
    
    let actions = '-';
    if (a.status === 'PENDENTE') {
      actions = `
        <div style="display:flex; gap:0.5rem;">
          <button class="btn primary" style="padding:0.4rem 0.8rem; font-size:0.75rem;" data-aprovar="${a.id}">Aprovar</button>
          <button class="btn danger" style="padding:0.4rem 0.8rem; font-size:0.75rem;" data-reprovar="${a.id}">Reprovar</button>
        </div>
      `;
    }

    tr.innerHTML = `
      <td><span class="badge neutral">${a.tipo || '-'}</span></td>
      <td>
        <div style="font-weight:600;">${a.projeto_nome || '-'}</div>
        <div class="muted" style="font-size:0.75rem;">ID: ${a.projeto_id || '-'}</div>
      </td>
      <td>${statusBadge(a.status)}</td>
      <td>${solicitante}</td>
      <td>${formatDate(a.solicitado_em)}</td>
      <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${motivo}">${motivo}</td>
      <td>${actions}</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-aprovar]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Confirmar aprovação?')) return;
      const id = btn.dataset.aprovar;
      try {
        await fetchJson(`${window.API_BASE_URL}/api/projetos/aprovacoes/${id}/aprovar`, { method: 'POST' });
        loadAprovacoes();
      } catch (e) {
        alert(e.message || 'Erro ao aprovar.');
      }
    });
  });

  tbody.querySelectorAll('[data-reprovar]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const motivo = prompt('Motivo da reprovação:');
      if (!motivo) return;
      const id = btn.dataset.reprovar;
      try {
        await fetchJson(`${window.API_BASE_URL}/api/projetos/aprovacoes/${id}/reprovar`, {
          method: 'POST',
          body: JSON.stringify({ motivo })
        });
        loadAprovacoes();
      } catch (e) {
        alert(e.message || 'Erro ao reprovar.');
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (!guardProjetos()) return;
  
  const u = getUserFromPortal();
  document.getElementById('sidebarUserName').textContent = u.nome;
  document.getElementById('sidebarUserRole').textContent = u.isAdmin ? 'Admin' : 'Usuário';
  document.getElementById('sidebarAvatar').textContent = (u.nome || 'U').trim().charAt(0).toUpperCase();

  document.getElementById('btnReload').addEventListener('click', loadAprovacoes);
  document.getElementById('btnVoltar').addEventListener('click', () => history.back());
  document.getElementById('f-status').addEventListener('change', loadAprovacoes);
  document.getElementById('f-tipo').addEventListener('change', loadAprovacoes);

  loadAprovacoes();
});
