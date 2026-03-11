document.addEventListener('DOMContentLoaded', async () => {
  await Auth.requireAuth();

  const user = Auth.getUser();
  const publicCfg = await Auth.getPublicConfig().catch(() => ({}));
  const chatwootUrl = publicCfg?.integrations?.chatwootUrl || '';
  const chatwootCard = document.getElementById('card-chatwoot');
  if (chatwootCard && chatwootUrl) {
    chatwootCard.dataset.url = chatwootUrl;
    chatwootCard.style.display = '';
  }

  const userNameEl = document.getElementById('user-name');
  if (userNameEl) userNameEl.textContent = user.name || user.username || user.email || 'Usuário';

  const empresaSelect = document.getElementById('empresa-select');
  try {
    const empresas = await Auth.fetchJSON(`${window.API_BASE_URL}/api/empresas/minhas`);

    if (empresaSelect) {
      empresaSelect.innerHTML = '';
      if (!Array.isArray(empresas) || empresas.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Nenhuma empresa vinculada';
        empresaSelect.appendChild(opt);
        empresaSelect.disabled = true;
      } else {
        const active = Auth.getEmpresaAtivaSlug() || empresas[0].slug;
        for (const e of empresas) {
          const opt = document.createElement('option');
          opt.value = e.slug;
          opt.textContent = e.nome;
          if (e.slug === active) opt.selected = true;
          empresaSelect.appendChild(opt);
        }
        Auth.setEmpresaAtivaSlug(active);
        empresaSelect.disabled = false;

        empresaSelect.addEventListener('change', () => {
          Auth.setEmpresaAtivaSlug(empresaSelect.value);
          window.location.reload();
        });
      }
    }
  } catch (err) {
    console.warn('Falha ao carregar empresas:', err);
    if (empresaSelect) {
      empresaSelect.innerHTML = '<option value="">Erro ao carregar</option>';
      empresaSelect.disabled = true;
    }
  }

  document.querySelectorAll('.home-card[data-role]').forEach((card) => {
    const role = card.getAttribute('data-role');
    if (!(Auth.hasRole(role) || Auth.hasRole('portal_admin'))) card.remove();
  });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => Auth.logout());
});
