document.addEventListener('DOMContentLoaded', async () => {
  await Auth.requireAuth();

  const user = Auth.getUser();
  document.getElementById('user-name').textContent = user.name || user.username || user.email || 'Usuário';

  const isAdmin = Auth.hasRole('portal_admin') || Auth.hasRole('usuarios_admin');
  if (!isAdmin) {
    document.getElementById('acesso-negado').classList.remove('hidden');
    document.getElementById('card-modulos').classList.add('hidden');
    return;
  }

  const refs = {
    sub: document.getElementById('kc-sub'),
    nome: document.getElementById('kc-nome'),
    projetos: document.getElementById('mod-projetos'),
    contratos: document.getElementById('mod-contratos'),
    links: document.getElementById('mod-links'),
    vagas: document.getElementById('mod-vagas'),
    msg: document.getElementById('msg'),
    tbody: document.getElementById('tbody'),
    btnSalvar: document.getElementById('btn-salvar'),
    btnLimpar: document.getElementById('btn-limpar'),
  };

  const showMsg = (text, ok = true) => {
    refs.msg.classList.remove('hidden');
    refs.msg.textContent = text;
    refs.msg.style.background = ok ? '#0d3b1f' : '#3b0d0d';
    refs.msg.style.color = '#fff';
    refs.msg.style.padding = '10px';
    refs.msg.style.borderRadius = '10px';
  };

  const clearForm = () => {
    refs.sub.value = '';
    refs.nome.value = '';
    refs.projetos.checked = false;
    refs.contratos.checked = false;
    refs.links.checked = false;
    refs.vagas.checked = false;
  };

  const fillForm = (row) => {
    refs.sub.value = row.keycloak_sub || '';
    refs.nome.value = row.nome_usuario || '';
    const p = row.permissoes || {};
    refs.projetos.checked = !!p.projetos;
    refs.contratos.checked = !!p.contratos;
    refs.links.checked = !!p.links;
    refs.vagas.checked = !!p.vagas;
  };

  const listRows = async () => {
    refs.tbody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';
    const data = await Auth.fetchJSON(`${window.API_BASE_URL}/api/usuarios/modulos`);
    const rows = Array.isArray(data?.items) ? data.items : [];

    if (!rows.length) {
      refs.tbody.innerHTML = '<tr><td colspan="4" style="opacity:.7;">Nenhum usuário com permissão personalizada nesta empresa.</td></tr>';
      return;
    }

    refs.tbody.innerHTML = '';
    for (const row of rows) {
      const p = row.permissoes || {};
      const mods = ['projetos', 'contratos', 'links', 'vagas'].filter((m) => p[m]).join(', ') || '-';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:10px;">${row.nome_usuario || '-'}</td>
        <td style="padding:10px; font-family:monospace;">${row.keycloak_sub}</td>
        <td style="padding:10px;">${mods}</td>
        <td style="padding:10px;"><button class="btn-voltar" data-sub="${row.keycloak_sub}">Editar</button></td>
      `;
      tr.querySelector('button').addEventListener('click', () => fillForm(row));
      refs.tbody.appendChild(tr);
    }
  };

  refs.btnSalvar.addEventListener('click', async () => {
    try {
      const sub = refs.sub.value.trim();
      const nome = refs.nome.value.trim();
      if (!sub) return showMsg('Informe o sub do Keycloak.', false);

      await Auth.fetchJSON(`${window.API_BASE_URL}/api/usuarios/modulos/${encodeURIComponent(sub)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome_usuario: nome || null,
          permissoes: {
            projetos: refs.projetos.checked,
            contratos: refs.contratos.checked,
            links: refs.links.checked,
            vagas: refs.vagas.checked,
          },
        }),
      });

      showMsg('Permissões salvas com sucesso.');
      await listRows();
    } catch (e) {
      showMsg(`Erro ao salvar: ${e.message}`, false);
    }
  });

  refs.btnLimpar.addEventListener('click', clearForm);

  try {
    await listRows();
  } catch (e) {
    showMsg(`Erro ao carregar permissões: ${e.message}`, false);
  }
});
