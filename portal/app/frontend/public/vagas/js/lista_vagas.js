/* globals window, document, history, URLSearchParams, fetch */
(() => {
  const API = '/api/rh/vagas-publicas'; // endpoint público

  const grid = document.getElementById('gridVagas');
  const empty = document.getElementById('empty');
  const errorEl = document.getElementById('error');
  const qInput = document.getElementById('q');
  const btnSearch = document.getElementById('btnSearch');

  // ========= utils =========
  const fmtData = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  };

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Detecta marca: 'arquitech' | 'metasul' | 'mix'
  function brandInfo(linhaRaw) {
    if (Array.isArray(linhaRaw)) {
      const hasArq = linhaRaw.some(x => String(x).toLowerCase().includes('arquitech'));
      const hasMet = linhaRaw.some(x => String(x).toLowerCase().includes('metasul'));
      if (hasArq && hasMet) return { type: 'mix', label: 'ARQUITECH • METASUL' };
      if (hasMet) return { type: 'metasul', label: 'METASUL' };
      return { type: 'arquitech', label: 'ARQUITECH' };
    }
    const v = String(linhaRaw || '').trim();
    const low = v.toLowerCase();
    const both =
      (low.includes('arquitech') && low.includes('metasul')) ||
      /ambas|ibmf|geral|todas/.test(low);
    if (both) return { type: 'mix', label: 'ARQUITECH • METASUL' };
    if (/metasul/.test(low)) return { type: 'metasul', label: 'METASUL' };
    return { type: 'arquitech', label: 'ARQUITECH' };
  }

  // ========= estado inicial da URL =========
  const urlParams = new URLSearchParams(window.location.search);
  const qStart = urlParams.get('q') || '';
  const linhaStart = (urlParams.get('linha') || '').trim().toLowerCase();

  if (qStart) qInput.value = qStart;

  // ========= atualização segura da URL =========
  function setQueryInURL(q, linha) {
    try {
      const url = new URL(window.location.href);

      if (q && q.trim()) {
        url.searchParams.set('q', q.trim());
      } else {
        url.searchParams.delete('q');
      }

      if (linha && linha.trim()) {
        url.searchParams.set('linha', linha.trim().toLowerCase());
      } else {
        url.searchParams.delete('linha');
      }

      window.history.replaceState({}, '', url.toString());
    } catch (e) {
      // Não deixa esse erro quebrar o carregamento das vagas
      console.warn('Ignorando erro ao atualizar URL:', e);
    }
  }

  // ========= render =========
  function renderSkeleton(n = 6) {
    grid.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const s = document.createElement('div');
      s.className = 'skel';
      s.innerHTML = `
        <div class="sbar"></div>
        <div class="sline" style="width:60%"></div>
        <div class="sline" style="width:40%"></div>
      `;
      grid.appendChild(s);
    }
    empty.classList.add('hidden');
    errorEl.classList.add('hidden');
  }

  function renderList(rows) {
    grid.innerHTML = '';

    if (!rows || rows.length === 0) {
      empty.classList.remove('hidden');
      errorEl.classList.add('hidden');
      return;
    }

    empty.classList.add('hidden');
    errorEl.classList.add('hidden');

    rows.forEach((v) => {
      const b = brandInfo(v.linha);
      const linhaTxt = (b.label || 'ARQUITECH').toString().toUpperCase();
      const pcdTxt =
        (v.pcd === true ||
         String(v.pcd).toLowerCase() === '1' ||
         String(v.pcd).toLowerCase() === 'true')
          ? 'Sim'
          : 'Não';

      const card = document.createElement('article');
      card.className = 'card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Abrir vaga ${v.titulo || v.id}`);

      const go = () => {
        window.location.href = `./detalhe_vaga.html?id=${encodeURIComponent(v.id)}`;
      };
      card.addEventListener('click', go);
      card.addEventListener('keypress', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          go();
        }
      });

      const brandBlock = (b.type === 'mix')
        ? `<div class="linha-badge">
             <span class="dot dual"></span>
             <span class="linha">${linhaTxt}</span>
           </div>`
        : `<div class="linha-badge">
             <span class="dot ${b.type}"></span>
             <span class="linha">${linhaTxt}</span>
           </div>`;

      card.innerHTML = `
        ${brandBlock}

        <h3 class="title">${escapeHtml(v.titulo || '')}</h3>

        <div class="info-cards">
          <div class="mini-card" title="${escapeHtml(v.local_trabalho || '—')}">
            <div class="mini-icon">📍</div>
            <div class="mini-text">
              <div class="mini-label">Local</div>
              <div class="mini-value">${escapeHtml(v.local_trabalho || '—')}</div>
            </div>
          </div>

          <div class="mini-card">
            <div class="mini-icon">🧾</div>
            <div class="mini-text">
              <div class="mini-label">Vínculo</div>
              <div class="mini-value">${escapeHtml(v.vinculo || 'Efetivo')}</div>
            </div>
          </div>

          <div class="mini-card">
            <div class="mini-icon">💼</div>
            <div class="mini-text">
              <div class="mini-label">Modelo</div>
              <div class="mini-value">${escapeHtml(v.modalidade || 'Presencial')}</div>
            </div>
          </div>

          <div class="mini-card">
            <div class="mini-icon">✚</div>
            <div class="mini-text">
              <div class="mini-label">PcD</div>
              <div class="mini-value">${pcdTxt}</div>
            </div>
          </div>
        </div>
      `;

      grid.appendChild(card);
    });
  }

  // ========= carregar =========
  async function load(opts = {}) {
    const qVal = (typeof opts.q === 'string')
      ? opts.q.trim()
      : qInput.value.trim();

    // linha: usa da URL inicial se vier, ou do opts se um dia tiver filtro
    const linhaParam = (typeof opts.linha === 'string')
      ? opts.linha.trim().toLowerCase()
      : linhaStart;

    try {
      renderSkeleton(6);

      const p = new URLSearchParams();
      p.set('ativas', '1');
      if (qVal) p.set('q', qVal);
      if (linhaParam === 'arquitech' || linhaParam === 'metasul') {
        p.set('linha', linhaParam);
      }

      const resp = await fetch(`${API}?${p.toString()}`, { method: 'GET' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);

      const data = await resp.json();

      const rows = (data || []).map((v) => ({
        id: v.id,
        titulo: v.titulo,
        linha: v.linha || null,
        local_trabalho: v.local_trabalho || null,
        modalidade: v.modalidade || 'Presencial',
        vinculo: v.vinculo || 'Efetivo',
        pcd: v.pcd,
        criada_em: v.criada_em || v.publicada_em || v.atualizada_em || v.criadaEm
          ? fmtData(v.criada_em || v.publicada_em || v.atualizada_em || v.criadaEm)
          : null
      }));

      renderList(rows);
      setQueryInURL(qVal, linhaParam);
    } catch (e) {
      console.error('Falha ao carregar vagas:', e);
      grid.innerHTML = '';
      empty.classList.add('hidden');
      errorEl.classList.remove('hidden');
    }
  }

  // ========= eventos =========
  let t = null;

  function doSearch() {
    clearTimeout(t);
    t = setTimeout(() => load(), 350);
  }

  qInput.addEventListener('input', doSearch);
  btnSearch.addEventListener('click', () => load());
  qInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') load();
  });

  // primeira carga
  load();
})();
