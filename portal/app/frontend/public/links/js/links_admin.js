document.addEventListener('DOMContentLoaded', async () => {
  // 🔒 exige login
  await Auth.requireAuth();

  // 🔒 exige permissão (admin OU acessoLinks)
  if (typeof Auth.guardLinksAccess === 'function') {
    Auth.guardLinksAccess();
  } else {
    const admin = (typeof isAdmin === 'function') ? isAdmin() : false;
    const links = (typeof Auth.hasLinksAccess === 'function') ? Auth.hasLinksAccess() : false;
    if (!admin && !links) {
      alert('Você não tem permissão para acessar esta página.');
      window.location.href = '../home.html';
      return;
    }
  }

  // Elementos
  const el = {
    // form
    marca: document.getElementById('marca'),
    titulo: document.getElementById('titulo'),
    url: document.getElementById('url'),
    descricao: document.getElementById('descricao'),
    categoria: document.getElementById('categoria'),
    ordem: document.getElementById('ordem'),
    ativo: document.getElementById('ativo'),

    // actions
    btnCriar: document.getElementById('btn-criar'),
    btnRecarregar: document.getElementById('btn-recarregar'),
    msg: document.getElementById('msg'),
    lista: document.getElementById('lista'),
    btnVoltar: document.getElementById('btn-voltar'),
    btnSair: document.getElementById('btn-sair'),

    // open brand pages
    btnOpenMetasul: document.getElementById('btn-open-metasul'),
    btnOpenArquitech: document.getElementById('btn-open-arquitech'),
    btnOpenIbmf: document.getElementById('btn-open-ibmf')
  };

  // Topo
  if (el.btnVoltar) el.btnVoltar.addEventListener('click', () => {
    window.location.href = '../home.html';
  });

  if (el.btnSair) el.btnSair.addEventListener('click', () => {
    Auth.logout();
  });

  // ✅ Botões abrir páginas públicas por marca
  if (el.btnOpenMetasul) {
    el.btnOpenMetasul.addEventListener('click', () => {
      window.open(
        'https://links.metasul.ind.br/links/links.html?marca=metasul',
        '_blank'
      );
    });
  }

  if (el.btnOpenArquitech) {
    el.btnOpenArquitech.addEventListener('click', () => {
      window.open(
        'https://links.arquitech.com.br/links/links.html?marca=arquitech',
        '_blank'
      );
    });
  }

  if (el.btnOpenIbmf) el.btnOpenIbmf.addEventListener('click', () => {
    window.open(`./links.html?marca=ibmf`, '_blank');
  });

  if (el.btnCriar) el.btnCriar.addEventListener('click', criarLink);
  if (el.btnRecarregar) el.btnRecarregar.addEventListener('click', carregarLinks);

  // ✅ se vier ?marca=... na URL do admin, a listagem já abre filtrada
  const marcaFiltroUrl = getMarcaFiltroAdminFromUrl();

  // Primeira carga
  await carregarLinks();

  // Helpers
  function setMsg(texto, tipo = 'info') {
    if (!el.msg) return;
    el.msg.textContent = texto || '';
    el.msg.dataset.tipo = tipo;
  }

  function limparForm() {
    if (el.marca) el.marca.value = 'ibmf';
    el.titulo.value = '';
    el.url.value = '';
    el.descricao.value = '';
    el.categoria.value = '';
    el.ordem.value = 0;
    el.ativo.value = 'true';
  }

  function normalizarMarca(v) {
    const s = String(v || '').trim().toLowerCase();
    if (s === 'metasul') return 'metasul';
    if (s === 'arquitech') return 'arquitech';
    return 'ibmf';
  }

  function labelMarca(v) {
    const m = normalizarMarca(v);
    if (m === 'metasul') return 'Metasul';
    if (m === 'arquitech') return 'Arquitech';
    return 'IBMF';
  }

  function montarPayloadFromForm() {
    return {
      marca: normalizarMarca(el.marca ? el.marca.value : 'ibmf'),
      titulo: (el.titulo.value || '').trim(),
      url: (el.url.value || '').trim(),
      descricao: (el.descricao.value || '').trim() || null,
      categoria: (el.categoria.value || '').trim() || null,
      ordem: Number(el.ordem.value || 0),
      ativo: el.ativo.value === 'true'
    };
  }

  function validarPayload(p) {
    if (!p.marca) return 'Marca é obrigatória.';
    if (!p.titulo) return 'Nome do link é obrigatório.';
    if (!p.url) return 'URL é obrigatória.';
    if (!/^https?:\/\//i.test(p.url)) return 'URL deve começar com http:// ou https://';
    return '';
  }

  function getMarcaFiltroAdminFromUrl() {
    const p = new URLSearchParams(window.location.search);
    const m = String(p.get('marca') || '').trim().toLowerCase();
    if (m === 'metasul') return 'metasul';
    if (m === 'arquitech') return 'arquitech';
    if (m === 'ibmf') return 'ibmf';
    return null;
  }

  async function criarLink() {
    setMsg('');

    const payload = montarPayloadFromForm();
    const erro = validarPayload(payload);
    if (erro) {
      setMsg(erro, 'erro');
      return;
    }

    el.btnCriar.disabled = true;
    try {
      const res = await Auth.fetch(`${API_BASE_URL}/api/links`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar link.');

      limparForm();
      setMsg('Link cadastrado com sucesso.', 'ok');
      await carregarLinks();
    } catch (err) {
      setMsg(err.message || 'Erro ao cadastrar link.', 'erro');
    } finally {
      el.btnCriar.disabled = false;
    }
  }

  async function carregarLinks() {
    if (!el.lista) return;

    el.lista.innerHTML = `<div class="muted">Carregando...</div>`;
    setMsg('');

    try {
      const url = marcaFiltroUrl
        ? `${API_BASE_URL}/api/links?marca=${encodeURIComponent(marcaFiltroUrl)}`
        : `${API_BASE_URL}/api/links`;

      const res = await Auth.fetch(url);
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.error || 'Erro ao listar links.');

      const arr = Array.isArray(data) ? data : (Array.isArray(data.links) ? data.links : []);
      if (!arr || arr.length === 0) {
        el.lista.innerHTML = `<div class="muted">Nenhum link cadastrado.</div>`;
        return;
      }

      arr.sort((a, b) => {
        const oa = Number(a?.ordem || 0);
        const ob = Number(b?.ordem || 0);
        if (oa !== ob) return oa - ob;
        return String(a?.titulo || '').localeCompare(String(b?.titulo || ''), 'pt-BR');
      });

      el.lista.innerHTML = '';
      arr.forEach(link => el.lista.appendChild(renderLinha(link)));
    } catch (err) {
      el.lista.innerHTML = `<div class="muted">${err.message || 'Erro ao carregar.'}</div>`;
    }
  }

  function renderLinha(l) {
    const row = document.createElement('div');
    row.className = 'link-row';
    row.dataset.id = String(l.id);

    const safe = (v) => (v == null ? '' : String(v));

    const base = {
      id: l.id,
      marca: normalizarMarca(l.marca || l.linha || 'ibmf'),
      titulo: safe(l.titulo),
      url: safe(l.url),
      descricao: l.descricao == null ? '' : safe(l.descricao),
      categoria: l.categoria == null ? '' : safe(l.categoria),
      ordem: Number(l.ordem || 0),
      ativo: !!l.ativo
    };

    row.innerHTML = `
      <div class="link-main">
        <div class="link-top">
          <div class="mini-badge">${labelMarca(base.marca)}</div>
          <span class="status ${base.ativo ? 'st-on' : 'st-off'}">${base.ativo ? 'Ativo' : 'Inativo'}</span>
        </div>

        <div class="link-grid">
          <div class="col">
            <label class="lbl">Marca</label>
            <select class="in-marca" disabled>
              <option value="metasul">Metasul</option>
              <option value="arquitech">Arquitech</option>
              <option value="ibmf">IBMF</option>
            </select>
          </div>

          <div class="col">
            <label class="lbl">Ordem</label>
            <input class="in-ordem" type="number" min="0" disabled />
          </div>

          <div class="col">
            <label class="lbl">Ativo</label>
            <select class="in-ativo" disabled>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <label class="lbl">Nome do link</label>
          <input class="in-titulo" type="text" disabled />
        </div>

        <div class="form-row">
          <label class="lbl">URL</label>
          <input class="in-url" type="text" disabled />
        </div>

        <div class="link-grid2">
          <div class="col">
            <label class="lbl">Categoria</label>
            <input class="in-categoria" type="text" disabled />
          </div>
          <div class="col">
            <label class="lbl">Descrição</label>
            <input class="in-descricao" type="text" disabled />
          </div>
        </div>

        <div class="row-actions">
          <button class="btn btn-editar" type="button">Editar</button>
          <button class="btn btn-salvar hidden" type="button">Salvar</button>
          <button class="btn btn-cancelar hidden" type="button">Cancelar</button>

          <button class="btn btn-copiar" type="button">Copiar URL</button>
          <button class="btn btn-excluir" type="button">Excluir</button>
        </div>

        <div class="row-msg muted"></div>
      </div>
    `;

    const inMarca = row.querySelector('.in-marca');
    const inOrdem = row.querySelector('.in-ordem');
    const inAtivo = row.querySelector('.in-ativo');
    const inTitulo = row.querySelector('.in-titulo');
    const inUrl = row.querySelector('.in-url');
    const inCategoria = row.querySelector('.in-categoria');
    const inDescricao = row.querySelector('.in-descricao');

    const btnEditar = row.querySelector('.btn-editar');
    const btnSalvar = row.querySelector('.btn-salvar');
    const btnCancelar = row.querySelector('.btn-cancelar');
    const btnExcluir = row.querySelector('.btn-excluir');
    const btnCopiar = row.querySelector('.btn-copiar');
    const rowMsg = row.querySelector('.row-msg');

    inMarca.value = base.marca;
    inOrdem.value = String(base.ordem);
    inAtivo.value = base.ativo ? 'true' : 'false';
    inTitulo.value = base.titulo;
    inUrl.value = base.url;
    inCategoria.value = base.categoria;
    inDescricao.value = base.descricao;

    function setRowMsg(txt, tipo = 'info') {
      if (!rowMsg) return;
      rowMsg.textContent = txt || '';
      rowMsg.dataset.tipo = tipo;
    }

    function atualizarTopo() {
      const mini = row.querySelector('.mini-badge');
      const st = row.querySelector('.status');
      if (mini) mini.textContent = labelMarca(inMarca.value);

      if (st) {
        const ativo = inAtivo.value === 'true';
        st.textContent = ativo ? 'Ativo' : 'Inativo';
        st.classList.toggle('st-on', ativo);
        st.classList.toggle('st-off', !ativo);
      }
    }

    function setEdit(on) {
      inMarca.disabled = !on;
      inOrdem.disabled = !on;
      inAtivo.disabled = !on;
      inTitulo.disabled = !on;
      inUrl.disabled = !on;
      inCategoria.disabled = !on;
      inDescricao.disabled = !on;

      btnEditar.classList.toggle('hidden', on);
      btnSalvar.classList.toggle('hidden', !on);
      btnCancelar.classList.toggle('hidden', !on);
    }

    function reset() {
      inMarca.value = base.marca;
      inOrdem.value = String(base.ordem);
      inAtivo.value = base.ativo ? 'true' : 'false';
      inTitulo.value = base.titulo;
      inUrl.value = base.url;
      inCategoria.value = base.categoria;
      inDescricao.value = base.descricao;

      atualizarTopo();
      setRowMsg('');
      setEdit(false);
    }

    btnEditar.addEventListener('click', () => setEdit(true));
    btnCancelar.addEventListener('click', reset);

    btnCopiar.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(inUrl.value || '');
        setRowMsg('URL copiada!', 'ok');
        setTimeout(() => setRowMsg(''), 800);
      } catch {
        setRowMsg('Não consegui copiar (bloqueio do navegador).', 'erro');
      }
    });

    btnExcluir.addEventListener('click', async () => {
      if (!confirm('Excluir este link?')) return;

      btnExcluir.disabled = true;
      try {
        const res = await Auth.fetch(`${API_BASE_URL}/api/links/${base.id}`, {
          method: 'DELETE'
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Erro ao excluir link.');

        row.remove();
        setMsg('Link excluído.', 'ok');
      } catch (err) {
        setRowMsg(err.message || 'Erro ao excluir.', 'erro');
      } finally {
        btnExcluir.disabled = false;
      }
    });

    inMarca.addEventListener('change', atualizarTopo);
    inAtivo.addEventListener('change', atualizarTopo);

    btnSalvar.addEventListener('click', async () => {
      setRowMsg('');

      const payload = {
        marca: normalizarMarca(inMarca.value),
        titulo: (inTitulo.value || '').trim(),
        url: (inUrl.value || '').trim(),
        descricao: (inDescricao.value || '').trim() || null,
        categoria: (inCategoria.value || '').trim() || null,
        ordem: Number(inOrdem.value || 0),
        ativo: inAtivo.value === 'true'
      };

      const erro = validarPayload(payload);
      if (erro) {
        setRowMsg(erro, 'erro');
        return;
      }

      const mudou =
        payload.marca !== base.marca ||
        payload.titulo !== base.titulo ||
        payload.url !== base.url ||
        (payload.descricao || '') !== (base.descricao || '') ||
        (payload.categoria || '') !== (base.categoria || '') ||
        payload.ordem !== base.ordem ||
        payload.ativo !== base.ativo;

      if (!mudou) {
        setRowMsg('Nenhuma alteração.', 'info');
        setEdit(false);
        return;
      }

      btnSalvar.disabled = true;
      try {
        const res = await Auth.fetch(`${API_BASE_URL}/api/links/${base.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Erro ao salvar.');

        base.marca = payload.marca;
        base.titulo = payload.titulo;
        base.url = payload.url;
        base.descricao = payload.descricao || '';
        base.categoria = payload.categoria || '';
        base.ordem = payload.ordem;
        base.ativo = payload.ativo;

        atualizarTopo();
        setRowMsg('Salvo!', 'ok');
        setEdit(false);

        await carregarLinks();
      } catch (err) {
        setRowMsg(err.message || 'Erro ao salvar.', 'erro');
      } finally {
        btnSalvar.disabled = false;
      }
    });

    return row;
  }
});
