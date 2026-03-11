// cadastro_vagas.js
(function () {
  // ===== Helpers =====
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const toast = (m) => alert(m);

  const getToken = () => (window.Auth?.getToken?.() || localStorage.getItem('token') || '');

  // Redireciona para login quando não há token ou quando o back rejeita (401/403)
  function redirectToLogin(msg) {
    try { if (msg) console.warn(msg); } catch {}
    window.location.href = '/login.html';
  }

  // Fetch com Authorization + tratamento de 401/403
  async function fetchAuth(url, opt = {}) {
    if (window.Auth?.fetch) {
      const headers = Object.assign({ 'Content-Type': 'application/json' }, opt.headers || {});
      const resp = await window.Auth.fetch(url, { ...opt, headers });
      if (resp.status === 401 || resp.status === 403) {
        redirectToLogin('Token inválido/expirado');
      }
      return resp;
    }

    const token = getToken();
    if (!token) {
      redirectToLogin('Sem token na storage');
      return new Response(null, { status: 401 });
    }
    const headers = Object.assign(
      { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      opt.headers || {}
    );
    const resp = await fetch(url, { ...opt, headers });
    if (resp.status === 401 || resp.status === 403) {
      redirectToLogin('Token inválido/expirado');
      return resp;
    }
    return resp;
  }

  const fmtDate = (s) => {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d)) return '';
    return d.toISOString().slice(0,10);
  };

  // ===== Linha (marca) — normalização para single | mix =====
  function normalizeLinhaArray(raw) {
    if (raw == null) return new Set();
    if (Array.isArray(raw)) {
      return new Set(
        raw.map(x => String(x).trim().toUpperCase()).filter(Boolean)
      );
    }
    const s = String(raw).trim();
    if (!s) return new Set();
    const low = s.toLowerCase();
    if (/(ambas|ibmf|geral|todas)/.test(low)) return new Set(['ARQUITECH','METASUL']);
    const parts = s.split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
    return new Set(parts.length ? parts : [s.toUpperCase()]);
  }

  function toLinhaSelectValue(raw) {
    const set = normalizeLinhaArray(raw);
    const hasArq = set.has('ARQUITECH');
    const hasMet = set.has('METASUL');
    if (hasArq && hasMet) return 'ARQUITECH,METASUL';
    if (hasMet) return 'METASUL';
    if (hasArq) return 'ARQUITECH';
    return '';
  }

  function linhaLabel(raw) {
    const v = toLinhaSelectValue(raw);
    if (v === 'ARQUITECH,METASUL') return 'IBMF';
    if (v === 'METASUL') return 'METASUL';
    if (v === 'ARQUITECH') return 'ARQUITECH';
    return '—';
  }

  // ===== DOM refs =====
  const form = $('#formVaga');
  const btnCancelarEdicao = $('#btnCancelarEdicao');
  const fAtivas = $('#fAtivas');
  const tbody = $('#tblVagas tbody');

  const campos = {
    id:               $('#vagaId'),
    titulo:           $('#titulo'),
    lead:             $('#lead'),
    descricao:        $('#descricao'),
    local_trabalho:   $('#local_trabalho'),
    linha:            $('#linha'),
    vinculo:          $('#vinculo'),
    modalidade:       $('#modalidade'),
    pcd:              $('#pcd'),
    inscricoes_ate:   $('#inscricoes_ate'),
    responsabilidades:$('#responsabilidades'),
    requisitos:       $('#requisitos'),
    informacoes:      $('#informacoes'),
  };

  // ===== Padrões Globais (com fallback de rota) =====
  const formGlobais = $('#formGlobais');
  const etapasPadrao = $('#etapas_padrao');
  const sobrePadrao = $('#sobre_ibmf_padrao');
  const globaisMsg = $('#globaisMsg');

  async function fetchWithFallback(getOrPut, payload) {
    const primary = '/api/rh/site-config';
    const fallback = '/api/rh/vagas-config';

    try {
      const r = await fetchAuth(primary, {
        method: getOrPut.method,
        body: getOrPut.method === 'PUT' ? JSON.stringify(payload) : undefined
      });
      if (r.ok) return r;
      const r2 = await fetchAuth(fallback, {
        method: getOrPut.method,
        body: getOrPut.method === 'PUT' ? JSON.stringify(payload) : undefined
      });
      return r2;
    } catch (e) {
      return await fetchAuth(fallback, {
        method: getOrPut.method,
        body: getOrPut.method === 'PUT' ? JSON.stringify(payload) : undefined
      });
    }
  }

  async function carregarGlobais() {
    try {
      const r = await fetchWithFallback({ method: 'GET' });
      if (!r.ok) throw new Error();
      const cfg = await r.json();
      etapasPadrao.value = cfg.etapas_padrao || cfg.etapas || '';
      sobrePadrao.value  = cfg.sobre_ibmf_padrao || cfg.sobre_ibmf || '';
      globaisMsg.textContent = '';
    } catch {
      globaisMsg.textContent = 'Obs.: endpoints de padrões globais indisponíveis.';
    }
  }

  async function salvarGlobais(e) {
    e.preventDefault();
    try {
      const body = {
        etapas_padrao: etapasPadrao.value || '',
        sobre_ibmf:    sobrePadrao.value || ''
      };
      const r = await fetchWithFallback({ method: 'PUT' }, body);
      if (!r.ok) throw new Error(await r.text());
      toast('Padrões salvos!');
      globaisMsg.textContent = '';
    } catch (err) {
      console.error(err);
      globaisMsg.textContent = 'Não foi possível salvar padrões (ver backend).';
    }
  }
  formGlobais?.addEventListener('submit', salvarGlobais);

  // ===== Listagem =====
  async function listarVagas() {
    tbody.innerHTML = '<tr><td colspan="8" class="muted">Carregando...</td></tr>';
    const qs = fAtivas?.checked ? '?ativas=1' : '';
    try {
      const r = await fetchAuth(`/api/rh/vagas${qs}`, { method: 'GET' });
      if (!r.ok) {
        const txt = await r.text().catch(()=> '');
        throw new Error(txt || `HTTP ${r.status}`);
      }
      const rows = await r.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="muted">Nenhuma vaga encontrada.</td></tr>';
        return;
      }
      tbody.innerHTML = '';
      rows.forEach((v) => tbody.appendChild(trVaga(v)));
    } catch (e) {
      console.error('listarVagas', e);
      tbody.innerHTML = '<tr><td colspan="8" class="muted">Erro ao carregar vagas.</td></tr>';
    }
  }

  function trVaga(v) {
    const tr = document.createElement('tr');

    const td = (t) => { const c=document.createElement('td'); c.textContent=t; return c; };
    const yesNo = (b) => b ? 'Sim' : 'Não';

    tr.appendChild(td(v.id));
    tr.appendChild(td(v.titulo || '—'));
    tr.appendChild(td(linhaLabel(v.linha)));
    tr.appendChild(td(v.vinculo || '—'));
    tr.appendChild(td(v.modalidade || '—'));
    tr.appendChild(td(yesNo(v.pcd === true || v.pcd === '1')));
    tr.appendChild(td((v.criada_em || '').toString().slice(0,10)));

    const ac = document.createElement('td');
    ac.className = 'actions-col';

    const bEdit = btnIcon('✎','primary', () => abrirEdicao(v));

    // ✅ classe do botão power conforme o estado (ativa => verde | inativa => vermelho)
    const toggleClass = (v.ativa === true || v.ativa === '1') ? 'green' : 'red';
    const bToggle = btnIcon('⏻', toggleClass, () => toggleAtiva(v));
    bToggle.title = (v.ativa === true || v.ativa === '1') ? 'Inativar vaga' : 'Ativar vaga';

    // 👉 abre a página dentro de /vagas
    const bCand = btnIcon('👥','amber', () => {
      window.location.href = `/vagas/candidatos.html?vaga_id=${encodeURIComponent(v.id)}`;
    });

    const bDel  = btnIcon('🗑','red', () => excluirVaga(v));

    ac.append(bEdit, bToggle, bCand, bDel);
    tr.appendChild(ac);

    return tr;
  }

  function btnIcon(txt, cls, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `icon-btn ${cls}`;
    const i = document.createElement('span');
    i.className = 'icon';
    i.textContent = txt;
    b.appendChild(i);
    b.addEventListener('click', fn);
    return b;
  }

  // ===== CRUD =====
  function buildPayload() {
    const linhaRaw = (campos.linha.value || '').trim().toUpperCase();
    const linhaCompat = linhaRaw === 'ARQUITECH,METASUL' ? 'IBMF' : (linhaRaw || null);

    return {
      titulo:            campos.titulo.value?.trim() || null,
      lead:              campos.lead.value?.trim() || null,
      descricao:         campos.descricao.value?.trim() || null,
      local_trabalho:    campos.local_trabalho.value?.trim() || null,
      linha:             linhaCompat,
      vinculo:           campos.vinculo.value || null,
      modalidade:        campos.modalidade.value || null,
      pcd:               !!campos.pcd.checked,
      inscricoes_ate:    campos.inscricoes_ate.value || null,
      responsabilidades: campos.responsabilidades.value || null,
      requisitos:        campos.requisitos.value || null,
      informacoes:       campos.informacoes.value || null
    };
  }

  async function criarVaga(body) {
    const r = await fetchAuth('/api/rh/vagas', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async function atualizarVaga(id, body) {
    const r = await fetchAuth(`/api/rh/vagas/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async function excluirVaga(v) {
    if (!confirm(`Excluir a vaga "${v.titulo}"? Esta ação é permanente.`)) return;
    try {
      let r = await fetchAuth(`/api/rh/vagas/${encodeURIComponent(v.id)}`, { method: 'DELETE' });
      if (!r.ok) {
        r = await fetchAuth(`/api/rh/vagas/${encodeURIComponent(v.id)}`, {
          method: 'PUT',
          body: JSON.stringify({ ativa: false })
        });
        if (!r.ok) throw new Error(await r.text());
      }
      toast('Vaga excluída/inativada.');
      listarVagas();
    } catch (e) {
      console.error('excluirVaga', e);
      toast('Não foi possível excluir (ver rotas do backend).');
    }
  }

  async function toggleAtiva(v) {
    try {
      const r = await fetchAuth(`/api/rh/vagas/${encodeURIComponent(v.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ ativa: !v.ativa })
      });
      if (!r.ok) throw new Error(await r.text());
      listarVagas();
    } catch (e) {
      console.error('toggleAtiva', e);
      toast('Falha ao ativar/inativar.');
    }
  }

  // ===== Form fluxo =====
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = campos.id.value;
    const body = buildPayload();

    try {
      if (id) {
        await atualizarVaga(id, body);
        toast('Vaga atualizada!');
      } else {
        await criarVaga(body);
        toast('Vaga criada!');
      }
      form.reset();
      campos.id.value = '';
      $('#formTitle').textContent = 'Nova vaga';
      btnCancelarEdicao?.classList.add('hide');
      listarVagas();
    } catch (err) {
      console.error('salvar', err);
      toast('Erro ao salvar a vaga.');
    }
  });

  function abrirEdicao(v) {
    $('#formTitle').textContent = `Editando: ${v.titulo || v.id}`;
    btnCancelarEdicao?.classList.remove('hide');

    campos.id.value             = v.id;
    campos.titulo.value         = v.titulo || '';
    campos.lead.value           = v.lead || '';
    campos.descricao.value      = v.descricao || '';
    campos.local_trabalho.value = v.local_trabalho || '';
    campos.linha.value          = toLinhaSelectValue(v.linha);
    campos.vinculo.value        = v.vinculo || '';
    campos.modalidade.value     = v.modalidade || '';
    campos.pcd.checked          = (v.pcd === true || v.pcd === '1');
    campos.inscricoes_ate.value = fmtDate(v.inscricoes_ate);
    campos.responsabilidades.value = v.responsabilidades || '';
    campos.requisitos.value        = v.requisitos || '';
    campos.informacoes.value       = v.informacoes || '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  btnCancelarEdicao?.addEventListener('click', () => {
    form.reset();
    campos.id.value = '';
    $('#formTitle').textContent = 'Nova vaga';
    btnCancelarEdicao?.classList.add('hide');
  });

  // Filtro
  fAtivas?.addEventListener('change', listarVagas);

  // ===== Boot =====
  (async () => {
    if (window.Auth?.requireAuth) {
      try { await window.Auth.requireAuth(); }
      catch { redirectToLogin('Sessão inválida'); return; }
    } else if (!getToken()) {
      redirectToLogin('Sem token na storage');
      return;
    }

    carregarGlobais();
    listarVagas();
  })();
})();
