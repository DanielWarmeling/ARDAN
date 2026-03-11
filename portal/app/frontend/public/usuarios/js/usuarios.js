document.addEventListener('DOMContentLoaded', async () => {
  await Auth.requireAuth();

  const user = Auth.getUser();
  document.getElementById('user-name').textContent = user.name || user.username || user.email || 'Usuário';

  const isAdmin = Auth.hasRole('portal_admin') || Auth.hasRole('usuarios_admin');
  if (!isAdmin) {
    document.getElementById('acesso-negado').classList.remove('hidden');
    document.getElementById('card-empresas').classList.add('hidden');
  }

  // Debug token
  document.getElementById('token').textContent = JSON.stringify(user.raw, null, 2);

  const msg = (t, ok=true) => {
    const el = document.getElementById('msg');
    el.classList.remove('hidden');
    el.textContent = t;
    el.style.background = ok ? '#0d3b1f' : '#3b0d0d';
    el.style.color = '#fff';
    el.style.padding = '10px';
    el.style.borderRadius = '10px';
  };

  async function carregarTabela() {
    const tbody = document.getElementById('tbody');
    tbody.innerHTML = '';

    // Lista “minhas” empresas (vem do Keycloak)
    const empresas = await Auth.fetchJSON(`${window.API_BASE_URL}/api/empresas/minhas`);
    if (!Array.isArray(empresas) || empresas.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="2" style="opacity:.7; padding:10px;">Nenhuma empresa no seu token. Crie grupos no Keycloak: /empresas/SLUG e adicione seu usuário.</td>';
      tbody.appendChild(tr);
      return;
    }

    for (const e of empresas) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td style="padding:10px;">${e.slug}</td><td style="padding:10px;">${e.nome}</td>`;
      tbody.appendChild(tr);
    }
  }

  if (isAdmin) {
    document.getElementById('btn-salvar').addEventListener('click', async () => {
      const slug = document.getElementById('empresa-slug').value.trim();
      const nome = document.getElementById('empresa-nome').value.trim();
      if (!slug || !nome) return msg('Informe slug e nome.', false);

      await Auth.fetchJSON(`${window.API_BASE_URL}/api/empresas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, nome })
      });

      msg('Salvo com sucesso ✅', true);
      await carregarTabela();
    });
  }

  try { await carregarTabela(); } catch (e) { msg('Erro ao carregar: ' + e.message, false); }
});
