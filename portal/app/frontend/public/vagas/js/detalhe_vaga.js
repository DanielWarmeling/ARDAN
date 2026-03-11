// detalhe_vaga.js
(function () {
  const qs = new URLSearchParams(location.search);
  const id = qs.get('id');

  const $ = (sel) => document.querySelector(sel);

  const fmt = (dStr) => {
    if (!dStr) return '—';
    const d = new Date(dStr);
    if (isNaN(d)) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  };

  const isTrue = (v) =>
    v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === '1';

  // Detecta marca
  function brandInfo(linhaRaw) {
    if (Array.isArray(linhaRaw)) {
      const hasArq = linhaRaw.some(x => String(x).toLowerCase().includes('arquitech'));
      const hasMet = linhaRaw.some(x => String(x).toLowerCase().includes('metasul'));
      if (hasArq && hasMet) return { type: 'mix', label: 'ARQUITECH • METASUL' };
      if (hasMet) return { type: 'metasul', label: 'METASUL' };
      return { type: 'arquitech', label: 'ARQUITECH' };
    }
    const s = String(linhaRaw || '').trim().toLowerCase();
    const both = (s.includes('arquitech') && s.includes('metasul')) || /ambas|ibmf|geral|todas|mix/.test(s);
    if (both) return { type: 'mix', label: 'ARQUITECH • METASUL' };
    if (s.includes('metasul')) return { type: 'metasul', label: 'METASUL' };
    return { type: 'arquitech', label: 'ARQUITECH' };
  }

  // Aplica accent no card do título: arquitech | metasul | mix
  function setHeroAccentByBrand(info) {
    const hero = $('#heroAccent');
    if (!hero) return;
    hero.classList.remove('soft--arquitech', 'soft--metasul', 'soft--mix');
    if (info.type === 'metasul') hero.classList.add('soft--metasul');
    else if (info.type === 'mix') hero.classList.add('soft--mix');
    else hero.classList.add('soft--arquitech');
  }

  // Render de listas
  function setList(ulEl, arr) {
    if (!ulEl) return;
    ulEl.innerHTML = '';
    const block = ulEl.closest('.block');
    if (!Array.isArray(arr) || arr.length === 0) {
      block?.classList.add('hide');
      return;
    }
    arr.forEach((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      ulEl.appendChild(li);
    });
    block?.classList.remove('hide');
  }

  function toArray(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
      const s = v.replace(/\r/g, '').split(/\n|;/).map(x => x.trim()).filter(Boolean);
      return s.length ? s : null;
    }
    return null;
  }

  function setLinks(links) {
    const { site, linkedin, facebook, instagram, glassdoor } = links || {};
    [
      ['#lkSite', site],
      ['#lkLinkedin', linkedin],
      ['#lkFacebook', facebook],
      ['#lkInstagram', instagram],
      ['#lkGlassdoor', glassdoor],
    ].forEach(([sel, url]) => {
      const a = $(sel);
      if (!a) return;
      if (url) { a.href = url; a.classList.remove('hide'); }
      else a.classList.add('hide');
    });
  }

  function enableCopyButtons() {
    const doCopy = () => {
      navigator.clipboard
        .writeText(location.href)
        .then(() => alert('Link copiado!'))
        .catch(() => alert('Não foi possível copiar o link.'));
    };
    $('#btnCopyLinkTop')?.addEventListener('click', doCopy);
    $('#btnCopyLinkBottom')?.addEventListener('click', doCopy);
  }

  // === Modal "Como deseja candidatar-se?" ===
  function enableApplyUI() {
    const modal = $('#candModal');
    if (!modal) return;

    const btnTop = $('#btnCandidatarTop');
    const btnBottom = $('#btnCandidatarBottom');
    const closeEls = modal.querySelectorAll('[data-close="1"]');
    const cardUpload = $('#cardUpload');
    const cardGerar = $('#cardGerar');

    const vagaId = id || '';

    const openModal = () => modal.setAttribute('aria-hidden', 'false');
    const closeModal = () => modal.setAttribute('aria-hidden', 'true');

    btnTop?.addEventListener('click', openModal);
    btnBottom?.addEventListener('click', openModal);
    closeEls.forEach(el => el.addEventListener('click', closeModal));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

    if (cardUpload) {
      const goUpload = () => {
        const url = `/vagas/candidatar_upload.html?vaga_id=${encodeURIComponent(vagaId)}`;
        window.location.href = url;
      };
      cardUpload.addEventListener('click', goUpload);
      cardUpload.querySelector('.cand-btn')?.addEventListener('click', (e) => { e.stopPropagation(); goUpload(); });
    }

    if (cardGerar) {
      const goGerar = () => {
        const url = `/vagas/candidatar_gerar.html?vaga_id=${encodeURIComponent(vagaId)}`;
        window.location.href = url;
      };
      cardGerar.addEventListener('click', goGerar);
      cardGerar.querySelector('.cand-btn')?.addEventListener('click', (e) => { e.stopPropagation(); goGerar(); });
    }
  }

  async function loadSiteConfigPublic() {
    try {
      const r = await fetch('/api/rh/site-config-public');
      if (!r.ok) return { etapas_padrao: null, sobre_ibmf: null };
      const cfg = await r.json();
      return { etapas_padrao: cfg?.etapas_padrao || null, sobre_ibmf: cfg?.sobre_ibmf || null };
    } catch {
      return { etapas_padrao: null, sobre_ibmf: null };
    }
  }

  // ===== Load =====
  async function loadVaga() {
    if (!id) { alert('Vaga não especificada'); return; }
    try {
      const [vagaResp, cfg] = await Promise.all([
        fetch(`/api/rh/vagas-publicas/${encodeURIComponent(id)}`),
        loadSiteConfigPublic(),
      ]);
      if (!vagaResp.ok) throw new Error('Falha ao carregar vaga');
      const vaga = await vagaResp.json();

      // Brand detection
      const b = brandInfo(vaga.linha);

      // >>> OPCIONAL (ativado): pintar Topbar conforme a marca da vaga
      //     Isto aciona as variações de cor no CSS via body[data-brand].
      document.body.dataset.brand = b.type; // 'arquitech' | 'metasul' | 'mix'

      // Título/lead/descrição
      $('#vagaTitulo').textContent = vaga.titulo || '—';
      document.title = (vaga.titulo ? `${vaga.titulo} · ` : '') + 'Vagas | IBMF';
      $('#vagaLead').textContent =
        vaga.lead || 'Texto institucional fictício para compor o layout.';
      $('#descricaoVaga').textContent = vaga.descricao || '—';

      // Linha no cartão da direita (nome + dot/duplo)
      $('#linhaNome').textContent = b.label;
      const dot = $('#linhaDot');
      if (dot) {
        dot.className = 'dot'; // reset
        if (b.type === 'mix') {
          dot.classList.add('dual');
        } else {
          dot.classList.add(b.type === 'metasul' ? 'metasul' : 'arquitech');
        }
      }

      // Accent no card do TÍTULO
      setHeroAccentByBrand(b);

      // Mini-cards
      $('#infoLocal').textContent  = vaga.local_trabalho || '—';
      $('#infoVinculo').textContent= vaga.vinculo || '—';
      $('#infoModelo').textContent = vaga.modalidade || '—';
      $('#infoPcD').textContent    = isTrue(vaga.pcd) ? 'Sim' : 'Não';

      // Datas
      $('#dtPublicada').textContent = fmt(vaga.criada_em || vaga.publicada_em || vaga.atualizada_em);
      if (vaga.inscricoes_ate) {
        $('#inscricoesWrap')?.classList.remove('hide');
        $('#dtInscricoes').textContent = fmt(vaga.inscricoes_ate);
      } else {
        $('#inscricoesWrap')?.classList.add('hide');
      }

      // Blocos
      const respArr   = toArray(vaga.responsabilidades);
      const reqArr    = toArray(vaga.requisitos);
      const infoArr   = toArray(vaga.informacoes);
      const etapasArr = toArray(vaga.etapas) || toArray(cfg.etapas_padrao);

      setList($('#respLista'), respArr);
      setList($('#reqLista'),  reqArr);
      setList($('#infoLista'), infoArr);
      setList($('#etapasLista'), etapasArr);

      // Links + CTAs
      setLinks(vaga.links);
      enableCopyButtons();
      enableApplyUI(); // abre modal e navega para as novas páginas

      // Sobre
      const sobreText = vaga.sobre_ibmf || cfg.sobre_ibmf || null;
      if (sobreText) $('#sobreIbmf').textContent = sobreText;
    } catch (err) {
      console.error(err);
      alert('Não foi possível carregar os dados da vaga.');
    }
  }

  loadVaga();
})();
