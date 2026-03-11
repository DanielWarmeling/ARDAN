(() => {
  const API_ROOT = `${window.API_BASE_URL}/api/contratos`;

  const state = {
    id: null,
    contrato: null,
    eventos: [],
    eventosFiltrados: [],
    cidades: [],
    cidadeSelecionada: null,
    sugestoesCidades: []
  };

  const els = {
    // topo
    btnVoltar: document.getElementById('btn-voltar'),

    // contrato
    contratoInfo: document.getElementById('contrato-info'),
    btnDownloadPortal: document.getElementById('btn-download-portal'),
    btnDownloadVault: document.getElementById('btn-download-vault'),
    obsContrato: document.getElementById('obs-contrato'),

    // eventos (documentos vinculados)
    tipoEvento: document.getElementById('tipo-evento'),
    arquivoEvento: document.getElementById('arquivo-evento'),
    obsEvento: document.getElementById('obs-evento'),
    btnSalvarEvento: document.getElementById('btn-salvar-evento'),
    msgEvento: document.getElementById('msg-evento'),
    tbodyEventos: document.getElementById('tbody-eventos'),
    eventosVazio: document.getElementById('eventos-vazio'),
    filtroArquivoEvento: document.getElementById('filtro-arquivo-evento'),
    filtroTipoEvento: document.getElementById('filtro-tipo-evento'),
    btnLimparFiltrosEvento: document.getElementById('btn-limpar-filtros-evento'),

    // cidades
    btnGerenciarCidades: document.getElementById('btn-gerenciar-cidades'),
    cardCidades: document.getElementById('card-cidades'),
    buscaCidade: document.getElementById('busca-cidade'),
    sugestoesCidade: document.getElementById('sugestoes-cidade'),
    cidadeSelecionadaInfo: document.getElementById('cidade-selecionada-info'),
    btnAdicionarCidade: document.getElementById('btn-adicionar-cidade'),
    msgCidade: document.getElementById('msg-cidade'),
    tbodyCidades: document.getElementById('tbody-cidades'),
    cidadesVazio: document.getElementById('cidades-vazio')
  };

  // ========= helpers =========

  function debounce(fn, wait = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function tokenHeader() {
    if (window.Auth && typeof Auth.getToken === 'function') {
      return Auth.getToken();
    }
    return localStorage.getItem('token') || '';
  }

  function getIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get('id'));
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let idx = 0;
    let value = bytes;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx++;
    }
    return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
  }

  function formatDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('pt-BR');
  }

  function setFormMessage(el, msg, ok = false) {
    if (!el) return;
    if (!msg) {
      el.classList.add('hidden');
      el.classList.remove('ok');
      el.textContent = '';
      return;
    }
    el.textContent = msg;
    el.classList.toggle('ok', ok);
    el.classList.remove('hidden');
  }

  // ========= render contrato =========

  function renderContrato() {
    const c = state.contrato;
    if (!c) {
      els.contratoInfo.textContent = 'Contrato não encontrado.';
      return;
    }

    els.contratoInfo.innerHTML = `
      <div class="badge">
        <span>${c.representanteNome || '(sem nome)'}</span>
      </div>
      <div class="muted">
        Código: ${c.representanteId || '-'}
        ${c.representanteEmail ? ` • ${c.representanteEmail}` : ''}
      </div>
      <div class="muted">
        Linha: ${c.linhaRegiao || '—'} • Região: ${c.regiao || '—'}
      </div>
      <div style="margin-top:8px;font-size:12px;">
        <div>ID do contrato: #${c.id}</div>
        <div>Arquivo: ${c.arquivoNome || '-'} (${formatBytes(c.arquivoTamanho)})</div>
        ${c.arquivoHash ? `<div class="hash">SHA-256: ${c.arquivoHash}</div>` : ''}
        <div class="muted" style="margin-top:4px;">Registrado em: ${formatDate(c.createdAt)}</div>
      </div>
    `;

    els.obsContrato.value = c.observacoes || '';
  }

  async function carregarContrato() {
    try {
      const res = await Auth.fetch(`${API_ROOT}/${state.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar contrato.');
      state.contrato = data;
      renderContrato();
    } catch (err) {
      console.error(err);
      els.contratoInfo.textContent = err.message || 'Erro ao carregar contrato.';
    }
  }

  // ========= eventos (documentos) =========

  function aplicaFiltrosEventos() {
    const termo = (els.filtroArquivoEvento.value || '').trim().toLowerCase();
    const tipo = (els.filtroTipoEvento.value || '').toUpperCase();

    state.eventosFiltrados = (state.eventos || []).filter(ev => {
      let ok = true;
      if (termo) {
        const nome = (ev.arquivo_nome || '').toLowerCase();
        ok = ok && nome.includes(termo);
      }
      if (tipo) {
        ok = ok && (ev.tipo || '').toUpperCase() === tipo;
      }
      return ok;
    });
  }

  function renderEventos() {
    aplicaFiltrosEventos();
    const lista = state.eventosFiltrados || [];

    if (!lista.length) {
      els.tbodyEventos.innerHTML = '';
      els.eventosVazio.classList.remove('hidden');
      return;
    }
    els.eventosVazio.classList.add('hidden');

    els.tbodyEventos.innerHTML = lista.map(ev => `
      <tr>
        <td>#${ev.id}</td>
        <td>${ev.tipo}</td>
        <td>
          <div>${ev.arquivo_nome || '-'}</div>
          <small class="muted">${formatBytes(ev.arquivo_tamanho)}</small>
        </td>
        <td>${ev.observacoes || '-'}</td>
        <td>${formatDate(ev.created_at)}</td>
        <td class="acoes">
          <button class="btn-acao"
                  data-download-evento="${ev.id}"
                  data-nome="${ev.arquivo_nome || 'evento.pdf'}">
            Download
          </button>
        </td>
      </tr>
    `).join('');
  }

  async function carregarEventos() {
    try {
      const res = await Auth.fetch(`${API_ROOT}/${state.id}/eventos`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar eventos.');
      state.eventos = data || [];
      renderEventos();
    } catch (err) {
      console.error(err);
      els.eventosVazio.textContent = err.message || 'Erro ao carregar documentos.';
      els.eventosVazio.classList.remove('hidden');
      els.tbodyEventos.innerHTML = '';
    }
  }

  async function baixarContratoFonte(fonte) {
    try {
      const url = `${API_ROOT}/${state.id}/download?fonte=${fonte}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${tokenHeader()}` }
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Falha ao baixar o contrato.');
      }
      const blob = await res.blob();
      const link = document.createElement('a');
      const nome = state.contrato?.arquivoNome || `contrato-${state.id}.pdf`;
      link.href = URL.createObjectURL(blob);
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(link.href);
        link.remove();
      }, 0);
    } catch (err) {
      alert(err.message || 'Erro ao baixar o contrato.');
    }
  }

  async function baixarEvento(eventoId, nomeArquivo) {
    try {
      const url = `${API_ROOT}/${state.id}/eventos/${eventoId}/download`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${tokenHeader()}` }
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Falha ao baixar o arquivo.');
      }
      const blob = await res.blob();
      const link = document.createElement('a');
      const nome = nomeArquivo || `evento-${eventoId}.pdf`;
      link.href = URL.createObjectURL(blob);
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(link.href);
        link.remove();
      }, 0);
    } catch (err) {
      alert(err.message || 'Erro ao baixar o arquivo.');
    }
  }

  async function salvarEvento() {
    setFormMessage(els.msgEvento, '');

    const tipo = (els.tipoEvento.value || '').toUpperCase();
    if (!tipo) {
      setFormMessage(els.msgEvento, 'Selecione o tipo de documento.');
      return;
    }

    const file = els.arquivoEvento?.files?.[0];
    if (!file) {
      setFormMessage(els.msgEvento, 'Selecione o arquivo PDF.');
      return;
    }
    if (!/\.pdf$/i.test(file.name)) {
      setFormMessage(els.msgEvento, 'Apenas arquivos PDF são aceitos.');
      return;
    }

    const formData = new FormData();
    formData.append('tipo', tipo);
    formData.append('observacoes', (els.obsEvento.value || '').trim());
    formData.append('arquivo', file);

    els.btnSalvarEvento.disabled = true;
    els.btnSalvarEvento.textContent = 'Vinculando...';

    try {
      const res = await fetch(`${API_ROOT}/${state.id}/eventos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenHeader()}` },
        body: formData
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao vincular documento.');

      els.tipoEvento.value = '';
      els.arquivoEvento.value = '';
      els.obsEvento.value = '';

      await carregarEventos();
      setFormMessage(els.msgEvento, 'Documento vinculado com sucesso.', true);
    } catch (err) {
      console.error(err);
      setFormMessage(els.msgEvento, err.message || 'Erro ao vincular documento.');
    } finally {
      els.btnSalvarEvento.disabled = false;
      els.btnSalvarEvento.textContent = 'Vincular';
    }
  }

  // ========= cidades =========

  function renderCidadeSelecionada() {
    const c = state.cidadeSelecionada;
    if (!c) {
      els.cidadeSelecionadaInfo.innerHTML =
        '<span class="muted">Nenhuma cidade selecionada.</span>';
      return;
    }
    els.cidadeSelecionadaInfo.innerHTML = `
      <div class="badge">
        <span>${c.nome || '(sem nome)'}</span>
      </div>
      <div class="muted">
        IDCIDADE: ${c.idcidade} • IBGE: ${c.municipio_ibge || '—'}
      </div>
    `;
  }

  function renderSugestoesCidades(lista) {
    if (!lista || !lista.length) {
      els.sugestoesCidade.innerHTML =
        '<div class="suggest-item muted">Nenhuma cidade encontrada.</div>';
      els.sugestoesCidade.classList.remove('hidden');
      return;
    }
    els.sugestoesCidade.innerHTML = lista
      .map(
        (cid, idx) => `
      <div class="suggest-item" data-idx="${idx}">
        <div><strong>${cid.nome || '(sem nome)'}</strong></div>
        <div class="muted">IDCIDADE: ${cid.idcidade} • IBGE: ${
          cid.municipio_ibge || '—'
        }</div>
      </div>`
      )
      .join('');
    els.sugestoesCidade.classList.remove('hidden');
  }

  const buscarCidades = debounce(async () => {
    const termo = (els.buscaCidade.value || '').trim();
    if (!termo || termo.length < 2) {
      els.sugestoesCidade.classList.add('hidden');
      state.sugestoesCidades = [];
      return;
    }

    try {
      const url = `${API_ROOT}/cidades/busca?q=${encodeURIComponent(termo)}`;
      const res = await Auth.fetch(url);
      const data = await res.json();
      state.sugestoesCidades = data || [];
      renderSugestoesCidades(state.sugestoesCidades);
    } catch (err) {
      console.error('Falha ao buscar cidades', err);
      els.sugestoesCidade.innerHTML =
        '<div class="suggest-item muted">Erro ao consultar cidades.</div>';
      els.sugestoesCidade.classList.remove('hidden');
    }
  }, 300);

  function renderCidades() {
    const lista = state.cidades || [];
    if (!lista.length) {
      els.tbodyCidades.innerHTML = '';
      els.cidadesVazio.classList.remove('hidden');
      return;
    }
    els.cidadesVazio.classList.add('hidden');

    els.tbodyCidades.innerHTML = lista
      .map(
        (cid) => `
      <tr>
        <td>#${cid.id}</td>
        <td>
          <div>${cid.nome || cid.nome_cidade || '-'}</div>
          <small class="muted">
            IDCIDADE: ${cid.cidadeId || cid.idcidade} • IBGE: ${
          cid.municipioIbge || cid.municipio_ibge || '—'
        }
          </small>
        </td>
        <td>${formatDate(cid.createdAt || cid.created_at)}</td>
        <td class="acoes">
          <button class="btn-acao"
                  data-remover-cidade="${cid.id}">
            Remover
          </button>
        </td>
      </tr>`
      )
      .join('');
  }

  async function carregarCidades() {
    try {
      const res = await Auth.fetch(`${API_ROOT}/${state.id}/cidades`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar cidades.');
      state.cidades = data || [];
      renderCidades();
    } catch (err) {
      console.error(err);
      els.cidadesVazio.textContent =
        err.message || 'Erro ao carregar cidades vinculadas.';
      els.cidadesVazio.classList.remove('hidden');
      els.tbodyCidades.innerHTML = '';
    }
  }

  async function vincularCidadeSingle(idcidade) {
    const body = { idcidade: Number(idcidade) };
    const res = await Auth.fetch(`${API_ROOT}/${state.id}/cidades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Falha ao vincular cidade.');
    return data;
  }

  async function vincularListaCidades(rawText) {
    // quebra por vírgula, ponto e vírgula ou quebra de linha
    const nomes = rawText
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);

    if (!nomes.length) {
      throw new Error('Não encontrei nenhum nome de cidade válido no texto.');
    }

    let sucesso = 0;
    const naoEncontradas = [];

    for (const nome of nomes) {
      try {
        const urlBusca = `${API_ROOT}/cidades/busca?q=${encodeURIComponent(
          nome
        )}`;
        const resBusca = await Auth.fetch(urlBusca);
        const lista = await resBusca.json();
        if (!resBusca.ok || !lista || !lista.length) {
          naoEncontradas.push(nome);
          continue;
        }

        const melhor = lista[0]; // pega o primeiro resultado
        await vincularCidadeSingle(melhor.idcidade);
        sucesso++;
      } catch (err) {
        console.error('Falha ao vincular cidade da lista:', nome, err);
        naoEncontradas.push(nome);
      }
    }

    await carregarCidades();

    let msg = `Vinculadas ${sucesso} cidades.`;
    if (naoEncontradas.length) {
      msg += ` Não encontradas: ${naoEncontradas.join(', ')}.`;
    }
    setFormMessage(els.msgCidade, msg, true);
  }

  async function vincularCidade() {
    setFormMessage(els.msgCidade, '');

    const texto = (els.buscaCidade.value || '').trim();

    // 1) se tiver cidade selecionada pelo autocomplete, usa ela
    if (state.cidadeSelecionada && state.cidadeSelecionada.idcidade) {
      try {
        els.btnAdicionarCidade.disabled = true;
        els.btnAdicionarCidade.textContent = 'Vinculando...';
        await vincularCidadeSingle(state.cidadeSelecionada.idcidade);
        els.buscaCidade.value = '';
        state.cidadeSelecionada = null;
        renderCidadeSelecionada();
        await carregarCidades();
        setFormMessage(els.msgCidade, 'Cidade vinculada com sucesso.', true);
      } catch (err) {
        console.error(err);
        setFormMessage(els.msgCidade, err.message || 'Erro ao vincular cidade.');
      } finally {
        els.btnAdicionarCidade.disabled = false;
        els.btnAdicionarCidade.textContent = 'Vincular cidade';
      }
      return;
    }

    // 2) se não tem cidade selecionada e o texto parece ser lista (vírgula / quebra de linha)
    if (texto && /[,;\n]/.test(texto)) {
      try {
        els.btnAdicionarCidade.disabled = true;
        els.btnAdicionarCidade.textContent = 'Vinculando lista...';
        await vincularListaCidades(texto);
        els.buscaCidade.value = '';
      } catch (err) {
        console.error(err);
        setFormMessage(
          els.msgCidade,
          err.message || 'Erro ao vincular lista de cidades.'
        );
      } finally {
        els.btnAdicionarCidade.disabled = false;
        els.btnAdicionarCidade.textContent = 'Vincular cidade';
      }
      return;
    }

    // 3) modo simples: um nome só, tenta buscar e vincular o primeiro resultado
    if (texto.length < 2) {
      setFormMessage(
        els.msgCidade,
        'Digite pelo menos 2 caracteres ou selecione uma cidade na lista.'
      );
      return;
    }

    try {
      els.btnAdicionarCidade.disabled = true;
      els.btnAdicionarCidade.textContent = 'Vinculando...';

      const urlBusca = `${API_ROOT}/cidades/busca?q=${encodeURIComponent(
        texto
      )}`;
      const resBusca = await Auth.fetch(urlBusca);
      const lista = await resBusca.json();
      if (!resBusca.ok || !lista || !lista.length) {
        throw new Error('Nenhuma cidade encontrada para o texto informado.');
      }
      const melhor = lista[0];
      await vincularCidadeSingle(melhor.idcidade);
      els.buscaCidade.value = '';
      state.cidadeSelecionada = null;
      renderCidadeSelecionada();
      await carregarCidades();
      setFormMessage(els.msgCidade, 'Cidade vinculada com sucesso.', true);
    } catch (err) {
      console.error(err);
      setFormMessage(els.msgCidade, err.message || 'Erro ao vincular cidade.');
    } finally {
      els.btnAdicionarCidade.disabled = false;
      els.btnAdicionarCidade.textContent = 'Vincular cidade';
    }
  }

  async function removerCidade(contratoCidadeId) {
    if (!window.confirm('Remover esta cidade do contrato?')) return;
    try {
      const res = await Auth.fetch(
        `${API_ROOT}/${state.id}/cidades/${contratoCidadeId}`,
        { method: 'DELETE' }
      );
      if (!res.ok && res.status !== 204) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Falha ao remover cidade.');
      }
      await carregarCidades();
    } catch (err) {
      alert(err.message || 'Erro ao remover cidade.');
    }
  }

  // ========= anexar eventos de DOM =========

  function anexarEventosDom() {
    // navegação
    els.btnVoltar?.addEventListener('click', () => {
      window.location.href = 'contratos.html';
    });

    // downloads
    els.btnDownloadPortal?.addEventListener('click', () =>
      baixarContratoFonte('portal')
    );
    els.btnDownloadVault?.addEventListener('click', () =>
      baixarContratoFonte('vault')
    );

    // eventos/documentos
    els.btnSalvarEvento?.addEventListener('click', salvarEvento);

    els.tbodyEventos?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-download-evento]');
      if (!btn) return;
      const id = btn.dataset.downloadEvento;
      const nome = btn.dataset.nome;
      if (!id) return;
      baixarEvento(id, nome);
    });

    els.filtroArquivoEvento?.addEventListener('input', () => renderEventos());
    els.filtroTipoEvento?.addEventListener('change', () => renderEventos());
    els.btnLimparFiltrosEvento?.addEventListener('click', () => {
      if (els.filtroArquivoEvento) els.filtroArquivoEvento.value = '';
      if (els.filtroTipoEvento) els.filtroTipoEvento.value = '';
      renderEventos();
    });

    // cidades: abrir/fechar card
    els.btnGerenciarCidades?.addEventListener('click', () => {
      if (!els.cardCidades) return;
      const hidden = els.cardCidades.classList.toggle('hidden');
      els.btnGerenciarCidades.textContent = hidden
        ? 'Gerenciar cidades'
        : 'Fechar cidades';
    });

    // cidades: busca/autocomplete
    els.buscaCidade?.addEventListener('input', () => buscarCidades());

    els.sugestoesCidade?.addEventListener('click', (ev) => {
      const item = ev.target.closest('.suggest-item');
      if (!item) return;
      const idx = Number(item.dataset.idx);
      const cid = state.sugestoesCidades[idx];
      if (!cid) return;
      state.cidadeSelecionada = cid;
      renderCidadeSelecionada();
      els.sugestoesCidade.classList.add('hidden');
    });

    // cidades: vincular (single ou lista)
    els.btnAdicionarCidade?.addEventListener('click', vincularCidade);

    // cidades: remover
    els.tbodyCidades?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-remover-cidade]');
      if (!btn) return;
      const id = Number(btn.dataset.removerCidade);
      if (!id) return;
      removerCidade(id);
    });
  }

  // ========= init =========

  document.addEventListener('DOMContentLoaded', async () => {
    Auth.requireAuth?.();

    state.id = getIdFromUrl();
    if (!state.id) {
      alert('ID de contrato inválido.');
      window.location.href = 'contratos.html';
      return;
    }

    anexarEventosDom();
    renderCidadeSelecionada();
    await carregarContrato();
    await carregarEventos();
    await carregarCidades();
  });
})();
