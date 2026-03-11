(() => {
  const API_ROOT = `${window.API_BASE_URL}/api/contratos`;
  const CADASTROS_API = `${window.API_BASE_URL}/api/representantes-dwh/cadastros`;

  const state = {
    page: 1,
    pageSize: 10,
    total: 0,
    filters: { q: '', representanteId: '' },
    rows: []
  };

  let repSelecionado = null;
  let sugestoes = [];
  let regioesDisponiveis = [];
  let regiaoSelecionada = null;

const FALLBACK_REGIAO = { linha: 'IBMF', regiao: 'IBMF' };

  const els = {
    btnVoltar: document.getElementById('btn-voltar'),
    buscaRep: document.getElementById('busca-rep'),
    sugestoesRep: document.getElementById('sugestoes-rep'),
    blocoRep: document.getElementById('rep-selecionado'),
    inputArquivo: document.getElementById('arquivo-contrato'),
    inputObs: document.getElementById('observacoes'),
    btnUpload: document.getElementById('btn-upload'),
    btnLimparRep: document.getElementById('btn-limpar-rep'),
    msgUpload: document.getElementById('msg-upload'),
    selectRegiao: document.getElementById('regiao-opcoes'),
    msgRegiao: document.getElementById('msg-regiao'),
    filtroBusca: document.getElementById('f-busca'),
    filtroRep: document.getElementById('f-rep'),
    btnFiltrar: document.getElementById('btn-filtrar'),
    btnLimpar: document.getElementById('btn-limpar'),
    tbody: document.getElementById('tbody-contratos'),
    vazio: document.getElementById('lista-vazia'),
    pagInfo: document.getElementById('pag-info'),
    pagPrev: document.getElementById('pag-prev'),
    pagNext: document.getElementById('pag-next')
  };

  function debounce(fn, wait = 250) {
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

  function renderRepSelecionado() {
    if (!repSelecionado) {
      els.blocoRep.innerHTML = '<span class="muted">Nenhum representante selecionado.</span>';
      return;
    }
    els.blocoRep.innerHTML = `
      <div class="badge">
        <span>${repSelecionado.nome || '(sem nome)'}</span>
      </div>
      <div class="muted">Código: ${repSelecionado.id || '-'}${repSelecionado.email ? ` • ${repSelecionado.email}` : ''}</div>
      <div class="muted">Linha vinculada: ${repSelecionado.linhaPortal || '—'} • Região: ${repSelecionado.regiaoPortal || '—'}</div>
    `;
  }

  function resetRegiaoSelect(message = 'Selecione um representante para carregar as opções.') {
    regioesDisponiveis = [];
    regiaoSelecionada = null;
    if (els.selectRegiao) {
      els.selectRegiao.innerHTML = '<option value="">Selecione um representante</option>';
      els.selectRegiao.disabled = true;
    }
    if (els.msgRegiao) els.msgRegiao.textContent = message;
    if (repSelecionado) {
      repSelecionado.linhaPortal = null;
      repSelecionado.regiaoPortal = null;
      renderRepSelecionado();
    }
  }

  function aplicarFallbackRegiao(message = 'Esse representante não está vinculado em Regiões. Usaremos IBMF.') {
    regioesDisponiveis = [];
    regiaoSelecionada = { ...FALLBACK_REGIAO };
    if (els.selectRegiao) {
      els.selectRegiao.innerHTML = '<option value="">IBMF</option>';
      els.selectRegiao.disabled = true;
    }
    if (els.msgRegiao) els.msgRegiao.textContent = message;
    if (repSelecionado) {
      repSelecionado.linhaPortal = FALLBACK_REGIAO.linha;
      repSelecionado.regiaoPortal = FALLBACK_REGIAO.regiao;
      renderRepSelecionado();
    }
  }

  function aplicarSelecaoRegiao(idx) {
    if (idx === null || idx === undefined || idx === '') {
      regiaoSelecionada = null;
      if (repSelecionado) {
        repSelecionado.linhaPortal = null;
        repSelecionado.regiaoPortal = null;
        renderRepSelecionado();
      }
      if (els.selectRegiao) els.selectRegiao.value = '';
      return;
    }

    const index = Number(idx);
    if (Number.isNaN(index) || index < 0 || index >= regioesDisponiveis.length) {
      regiaoSelecionada = null;
      if (els.selectRegiao) els.selectRegiao.value = '';
      return;
    }

    const option = regioesDisponiveis[index];
    regiaoSelecionada = option || null;
    if (els.selectRegiao) els.selectRegiao.value = String(index);
    if (repSelecionado) {
      repSelecionado.linhaPortal = option?.linha || null;
      repSelecionado.regiaoPortal = option?.regiao || null;
      renderRepSelecionado();
    }
  }

  function preencherOpcoesRegiao(lista = []) {
    regioesDisponiveis = Array.isArray(lista) ? lista : [];
    regiaoSelecionada = null;
    if (!els.selectRegiao) return;

    if (!regioesDisponiveis.length) {
      aplicarFallbackRegiao('Esse representante ainda não está vinculado em Regiões. Usaremos IBMF.');
      return;
    }

    const options = regioesDisponiveis.map((item, idx) => {
      const linha = item.linha || '—';
      const regiao = item.regiao || '—';
      return `<option value="${idx}">${linha} • ${regiao}</option>`;
    });
    els.selectRegiao.innerHTML = '<option value="">Selecione</option>' + options.join('');
    els.selectRegiao.disabled = false;
    if (els.msgRegiao) els.msgRegiao.textContent = 'Selecione a linha/região correta antes de enviar.';

    if (regioesDisponiveis.length === 1) {
      els.selectRegiao.selectedIndex = 1;
      aplicarSelecaoRegiao(0);
    } else {
      aplicarSelecaoRegiao(null);
    }
  }

  async function carregarRegiaoDoRepresentante(repId) {
    if (!repId || !repSelecionado || repSelecionado.id !== repId) return;
    aplicarSelecaoRegiao(null);
    if (els.selectRegiao) {
      els.selectRegiao.disabled = true;
      els.selectRegiao.innerHTML = '<option value="">Carregando…</option>';
    }
    if (els.msgRegiao) els.msgRegiao.textContent = 'Buscando linhas/regiões vinculadas…';

    try {
      const res = await Auth.fetch(`${API_ROOT}/representantes/${repId}/regiao`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (repSelecionado && repSelecionado.id === repId) {
        preencherOpcoesRegiao(data);
      }
    } catch {
      if (repSelecionado && repSelecionado.id === repId) {
        aplicarFallbackRegiao('Não consegui carregar as linhas/regiões desse representante. Usaremos IBMF.');
      }
    }
  }

  function renderSugestoes(lista) {
    if (!lista || !lista.length) {
      els.sugestoesRep.innerHTML = '<div class="suggest-item muted">Nenhum cadastro encontrado.</div>';
      els.sugestoesRep.classList.remove('hidden');
      return;
    }
    els.sugestoesRep.innerHTML = lista.map((item, idx) => `
      <div class="suggest-item" data-idx="${idx}">
        <div><strong>${item.nome || '(sem razão social)'}</strong></div>
        <div class="muted">Código: ${item.id || '-'}${item.email ? ` • ${item.email}` : ''}</div>
      </div>
    `).join('');
    els.sugestoesRep.classList.remove('hidden');
  }

  const buscarCadastros = debounce(async () => {
    const termo = (els.buscaRep.value || '').trim();
    if (termo.length < 3) {
      els.sugestoesRep.classList.add('hidden');
      return;
    }

    try {
      const url = `${CADASTROS_API}?q=${encodeURIComponent(termo)}`;
      const res = await Auth.fetch(url);
      sugestoes = await res.json();
      renderSugestoes(sugestoes);
    } catch (err) {
      console.error('Falha ao buscar cadastros', err);
      els.sugestoesRep.innerHTML = '<div class="suggest-item muted">Erro ao consultar o DWH.</div>';
      els.sugestoesRep.classList.remove('hidden');
    }
  }, 300);

  function limparSelecao() {
    repSelecionado = null;
    els.buscaRep.value = '';
    resetRegiaoSelect();
    renderRepSelecionado();
  }

  function setMsgUpload(msg, ok = false) {
    if (!els.msgUpload) return;
    if (!msg) {
      els.msgUpload.classList.add('hidden');
      els.msgUpload.textContent = '';
      els.msgUpload.classList.remove('ok');
      return;
    }
    els.msgUpload.textContent = msg;
    els.msgUpload.classList.toggle('ok', ok);
    els.msgUpload.classList.remove('hidden');
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

  async function enviarContrato() {
    setMsgUpload('');
    if (!repSelecionado || !repSelecionado.id) {
      setMsgUpload('Selecione um representante antes de enviar o contrato.');
      return;
    }

    const file = els.inputArquivo?.files?.[0];
    if (!file) {
      setMsgUpload('Escolha o arquivo PDF assinado.');
      return;
    }
    if (!/\.pdf$/i.test(file.name)) {
      setMsgUpload('Apenas arquivos PDF assinados são aceitos.');
      return;
    }

    if (!regiaoSelecionada) {
      setMsgUpload('Selecione a linha/região correta antes de enviar.');
      return;
    }

    const formData = new FormData();
    formData.append('representanteId', repSelecionado.id);
    formData.append('linhaRegiao', regiaoSelecionada.linha || '');
    formData.append('regiao', regiaoSelecionada.regiao || '');
    formData.append('observacoes', (els.inputObs.value || '').trim());
    formData.append('arquivo', file);

    els.btnUpload.disabled = true;
    els.btnUpload.textContent = 'Enviando...';

    try {
      const res = await fetch(API_ROOT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenHeader()}` },
        body: formData
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao enviar o contrato.');

      setMsgUpload(`Contrato enviado (ID ${data.id}).`, true);
      els.inputArquivo.value = '';
      els.inputObs.value = '';
      await carregarContratos(1);
    } catch (err) {
      console.error('Upload contrato', err);
      setMsgUpload(err.message || 'Falha ao enviar o contrato.');
    } finally {
      els.btnUpload.disabled = false;
      els.btnUpload.textContent = 'Enviar contrato';
    }
  }

  function renderTabela() {
    if (!els.tbody) return;
    if (!state.rows.length) {
      els.tbody.innerHTML = '';
      els.vazio.classList.remove('hidden');
      els.pagInfo.textContent = '0 registros';
      return;
    }
    els.vazio.classList.add('hidden');

    els.tbody.innerHTML = state.rows.map((row) => {
      return `
        <tr>
          <td>#${row.id}</td>
          <td>
            <div>${row.representanteNome || '(sem nome)'}</div>
            <small class="muted">${row.representanteId || ''}${row.representanteEmail ? ` • ${row.representanteEmail}` : ''}</small>
          </td>
          <td>
            <div>${row.arquivoNome || '-'}</div>
            <small class="muted">${formatBytes(row.arquivoTamanho)}</small>
          </td>
          <td>
            <div>${row.linhaRegiao || '—'}</div>
            <small class="muted">${row.regiao || '—'}</small>
          </td>
          <td>${formatDate(row.createdAt)}</td>
          <td class="acoes">
            <button class="btn-acao" data-detalhes="${row.id}">Ver detalhes</button>
          </td>
        </tr>
      `;
    }).join('');

    const inicio = (state.page - 1) * state.pageSize + 1;
    const fim = Math.min(state.total, state.page * state.pageSize);
    els.pagInfo.textContent = `Mostrando ${inicio}-${fim} de ${state.total}`;

    els.pagPrev.disabled = state.page <= 1;
    els.pagNext.disabled = state.page * state.pageSize >= state.total;
  }

  async function carregarContratos(page = 1) {
    const params = new URLSearchParams();
    params.set('page', page);
    params.set('pageSize', state.pageSize);
    if (state.filters.q) params.set('q', state.filters.q);
    if (state.filters.representanteId) params.set('representanteId', state.filters.representanteId);

    try {
      const res = await Auth.fetch(`${API_ROOT}?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar contratos');
      state.rows = data.rows || [];
      state.total = Number(data.total || 0);
      state.page = Number(data.page || page);
      renderTabela();
    } catch (err) {
      console.error('Falha ao carregar contratos', err);
      els.vazio.textContent = 'Erro ao carregar contratos. Tente novamente mais tarde.';
      els.vazio.classList.remove('hidden');
      els.tbody.innerHTML = '';
      els.pagInfo.textContent = '';
    }
  }

  async function baixarContrato(id, fonte = 'portal', nomeArquivo) {
    try {
      const url = `${API_ROOT}/${id}/download?fonte=${fonte}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${tokenHeader()}` }
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Falha ao baixar o contrato.');
      }
      const blob = await res.blob();
      const link = document.createElement('a');
      const nome = nomeArquivo || `contrato-${id}.pdf`;
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

  function aplicarFiltros() {
    state.filters.q = (els.filtroBusca.value || '').trim();
    state.filters.representanteId = (els.filtroRep.value || '').replace(/\D+/g, '');
    carregarContratos(1);
  }

  function limparFiltros() {
    els.filtroBusca.value = '';
    els.filtroRep.value = '';
    state.filters = { q: '', representanteId: '' };
    carregarContratos(1);
  }

  function anexarEventos() {
    if (els.btnVoltar) {
      els.btnVoltar.addEventListener('click', () => {
        window.location.href = '../home.html';
      });
    }

    els.selectRegiao?.addEventListener('change', (ev) => {
      const value = ev.target.value;
      if (value === '') {
        aplicarSelecaoRegiao(null);
        return;
      }
      const idx = Number(value);
      if (Number.isNaN(idx)) {
        aplicarSelecaoRegiao(null);
        return;
      }
      aplicarSelecaoRegiao(idx);
    });

    els.buscaRep?.addEventListener('input', () => buscarCadastros());

    els.sugestoesRep?.addEventListener('click', (ev) => {
      const item = ev.target.closest('.suggest-item');
      if (!item) return;
      const idx = Number(item.dataset.idx);
      const rep = sugestoes[idx];
      if (!rep) return;
      repSelecionado = { ...rep, linhaPortal: null, regiaoPortal: null };
      renderRepSelecionado();
      els.buscaRep.value = rep.nome || rep.id || '';
      els.sugestoesRep.classList.add('hidden');
      carregarRegiaoDoRepresentante(repSelecionado.id);
    });

    els.btnLimparRep?.addEventListener('click', limparSelecao);
    els.btnUpload?.addEventListener('click', enviarContrato);

    els.btnFiltrar?.addEventListener('click', aplicarFiltros);
    els.btnLimpar?.addEventListener('click', limparFiltros);

    els.pagPrev?.addEventListener('click', () => {
      if (state.page > 1) carregarContratos(state.page - 1);
    });
    els.pagNext?.addEventListener('click', () => {
      if (state.page * state.pageSize < state.total) carregarContratos(state.page + 1);
    });

    els.tbody?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-detalhes]');
      if (!btn) return;
      const id = btn.dataset.detalhes;
      if (!id) return;
      // mesma pasta, nova página de detalhes
      window.location.href = `contrato_detalhe.html?id=${encodeURIComponent(id)}`;
    });

  }

  document.addEventListener('DOMContentLoaded', async () => {
    Auth.requireAuth?.();
    if (typeof Auth.guardContratosAccess === 'function') {
      Auth.guardContratosAccess();
    } else if (typeof window.guardContratosAccess === 'function') {
      window.guardContratosAccess();
    }

    anexarEventos();
    resetRegiaoSelect();
    renderRepSelecionado();
    await carregarContratos();
  });
})();
