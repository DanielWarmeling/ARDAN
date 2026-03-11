// ./js/candidatos.js  (apenas fluxo NOVO; legado removido)
// Requer login: todas as chamadas usam Authorization: Bearer <token>

(function () {
  // ===== Helpers =====
  const $  = (s) => document.querySelector(s);
  const toast = (m) => alert(m);

  const getToken = () => localStorage.getItem('token') || '';
  function redirectToLogin(msg) {
    try { if (msg) console.warn(msg); } catch {}
    window.location.href = '/login.html';
  }
  async function fetchAuth(url, opt = {}) {
    const token = getToken();
    if (!token) {
      redirectToLogin('Sem token');
      return new Response(null, { status: 401 });
    }
    const headers = Object.assign(
      { 'Authorization': `Bearer ${token}` },
      opt.headers || {}
    );
    // Não definir Content-Type para fetch GET/Blob automaticamente
    return fetch(url, { ...opt, headers });
  }

  // ===== Vaga ID pela URL (aceita varias chaves) =====
  function getVagaIdFromURL() {
    const qs = new URLSearchParams(window.location.search);
    let v = qs.get('vaga') || qs.get('vaga_id') || qs.get('id') || qs.get('v');
    if (v == null) return '';
    v = String(parseInt(String(v).trim(), 10));
    return /^\d+$/.test(v) ? v : '';
  }
  const vagaId = getVagaIdFromURL();

  if (!vagaId) {
    toast('ID da vaga ausente na URL. Use ?vaga=ID.');
    history.replaceState(null, '', './cadastro_vagas.html');
    return;
  }

  // ===== DOM =====
  const vagaTitulo = $('#vagaTitulo');
  const vagaResumo = $('#vagaResumo');

  const qInput     = $('#q');
  const btnClear   = $('#btnClear');

  const tblUpBody  = $('#tblUp tbody');
  const upEmpty    = $('#upEmpty');

  // ===== Utils =====
  const fmtDate = (s) => {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d)) return '—';
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  };
  const safe = (s) => String(s ?? '').trim();

  // ===== Carrega resumo da vaga =====
  async function loadVaga() {
    try {
      // rota pública
      let r = await fetch(`/api/rh/vagas-publicas/${encodeURIComponent(vagaId)}`);
      if (!r.ok) {
        // fallback protegido
        const allR = await fetchAuth('/api/rh/vagas?ativas=');
        if (!allR.ok) throw new Error('Falha ao obter vaga');
        const all = await allR.json();
        const v = Array.isArray(all) ? all.find(x => String(x.id) === String(vagaId)) : null;
        if (!v) throw new Error('Vaga não encontrada');
        renderVaga(v);
        return;
      }
      const v = await r.json();
      renderVaga(v);
    } catch (e) {
      console.error('loadVaga', e);
      vagaResumo.innerHTML = '<div class="muted">Vaga não encontrada.</div>';
      vagaTitulo.textContent = `Candidatos — #${vagaId}`;
    }
  }

  function renderVaga(v) {
    vagaTitulo.textContent = `Candidatos — ${v.titulo || v.id}`;
    vagaResumo.innerHTML = `
      <div class="vaga-grid">
        <div><strong>Título:</strong> ${safe(v.titulo)}</div>
        <div><strong>Local:</strong> ${safe(v.local_trabalho)}</div>
        <div><strong>Modelo:</strong> ${safe(v.modalidade || '—')}</div>
        <div><strong>Vínculo:</strong> ${safe(v.vinculo || '—')}</div>
        <div><strong>Linha:</strong> ${safe(v.linha || '—')}</div>
        <div><strong>Inscrições até:</strong> ${fmtDate(v.inscricoes_ate)}</div>
      </div>
    `;
  }

  // ===== Candidaturas (UPLOAD NOVO) =====
  let dataUp = [];
  async function loadCandidaturasUpload() {
    tblUpBody.innerHTML = `<tr><td colspan="8" class="muted">Carregando…</td></tr>`;
    upEmpty.textContent = '';
    try {
      const r = await fetchAuth(`/api/rh/candidaturas-upload?vaga_id=${encodeURIComponent(vagaId)}`);
      if (!r.ok) {
        tblUpBody.innerHTML = '';
        upEmpty.textContent = 'Nenhuma candidatura via upload (rota indisponível ou sem registros).';
        dataUp = [];
        return;
      }
      const rows = await r.json();
      dataUp = Array.isArray(rows) ? rows : [];
      renderUp(dataUp);
    } catch (e) {
      console.error('loadCandidaturasUpload', e);
      tblUpBody.innerHTML = '';
      upEmpty.textContent = 'Erro ao carregar candidaturas (upload).';
      dataUp = [];
    }
  }

  // download seguro com Authorization, via Blob
  async function openArquivoComToken(candidaturaId) {
    try {
      const resp = await fetchAuth(`/api/rh/candidaturas-upload/${encodeURIComponent(candidaturaId)}/arquivo`, {
        method: 'GET'
      });
      if (!resp.ok) {
        const t = await resp.text().catch(()=>'');
        throw new Error(t || `HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      // abre em nova aba
      window.open(url, '_blank', 'noopener');
      // libera memória depois
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      console.error('openArquivoComToken', e);
      toast('Não foi possível abrir o currículo (verifique autenticação/permissões).');
    }
  }

  function renderUp(rows) {
    const q = safe(qInput.value).toLowerCase();
    const list = rows.filter(x =>
      !q ||
      safe(x.nome).toLowerCase().includes(q) ||
      safe(x.email).toLowerCase().includes(q) ||
      safe(x.origem).toLowerCase().includes(q)
    );
    if (list.length === 0) {
      tblUpBody.innerHTML = '';
      upEmpty.textContent = 'Sem registros.';
      return;
    }
    upEmpty.textContent = '';
    tblUpBody.innerHTML = '';
    list.forEach((r) => {
      const tr = document.createElement('tr');
      const td = (t) => { const c=document.createElement('td'); c.textContent=t; return c; };

      tr.appendChild(td(r.id));
      tr.appendChild(td(safe(r.nome)));
      tr.appendChild(td(safe(r.email)));
      tr.appendChild(td(safe(r.whatsapp || '—')));
      tr.appendChild(td(safe(r.origem || '—')));
      tr.appendChild(td(r.lgpd_ok ? 'LGPD OK' : '—'));
      tr.appendChild(td(fmtDate(r.created_at)));

      const ac = document.createElement('td');
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.type = 'button';
      btn.textContent = 'Ver currículo';
      btn.addEventListener('click', () => openArquivoComToken(r.id));
      ac.appendChild(btn);
      tr.appendChild(ac);

      tblUpBody.appendChild(tr);
    });
  }

  // ===== Filtros =====
  qInput?.addEventListener('input', () => renderUp(dataUp));
  btnClear?.addEventListener('click', () => {
    qInput.value = '';
    renderUp(dataUp);
  });

  // ===== Boot =====
  if (!getToken()) {
    redirectToLogin('Sem token');
    return;
  }
  loadVaga();
  loadCandidaturasUpload();
})();
