document.addEventListener('DOMContentLoaded', async () => {
  const box = document.getElementById('links');
  const msg = document.getElementById('msg');

  box.innerHTML = '';
  msg.textContent = 'Carregando...';

  // ✅ pega marca da URL (metasul | arquitech | ibmf)
  const marca = getMarcaFromUrl(); // default: ibmf
  setTituloMarca(marca);

  try {
    // ✅ IMPORTANTÍSSIMO: mandar a marca pro backend (senão ele retorna ibmf por padrão)
    const res = await fetch(`${API_BASE_URL}/api/links/public?marca=${encodeURIComponent(marca)}`);
    const data = await res.json().catch(() => []);
    if (!res.ok) throw new Error(data?.error || 'Falha ao carregar links');

    if (!Array.isArray(data) || data.length === 0) {
      msg.textContent = 'Nenhum link disponível no momento.';
      return;
    }

    // ✅ ainda mantém filtro local (não atrapalha e ajuda em caso de dados antigos)
    const itens = data
      .filter(l => l && (typeof l.ativo === 'undefined' ? true : isAtivo(l.ativo)))
      .filter(l => matchMarca(l, marca))
      .sort((a, b) => {
        const oa = Number(a?.ordem || 0);
        const ob = Number(b?.ordem || 0);
        if (oa !== ob) return oa - ob;
        return String(a?.titulo || '').localeCompare(String(b?.titulo || ''), 'pt-BR');
      });

    if (itens.length === 0) {
      msg.textContent = 'Nenhum link disponível no momento.';
      return;
    }

    msg.textContent = '';
    box.innerHTML = '';

    itens.forEach(l => {
      const a = document.createElement('a');
      a.className = 'link-card';
      a.href = String(l.url || '');
      a.target = '_blank';
      a.rel = 'noopener noreferrer';

      const titulo = escapeHtml(l.titulo || 'Link');
      const urlTxt = escapeHtml(l.url || '');

      a.innerHTML = `
        <div class="link-title">${titulo}</div>
        <div class="link-url">${urlTxt}</div>
      `;

      box.appendChild(a);
    });
  } catch (err) {
    console.error(err);
    msg.textContent = err?.message || 'Erro ao carregar links.';
  }
});

function getMarcaFromUrl() {
  const p = new URLSearchParams(window.location.search);
  const m = String(p.get('marca') || '').trim().toLowerCase();
  if (m === 'metasul') return 'metasul';
  if (m === 'arquitech') return 'arquitech';
  return 'ibmf';
}

function setTituloMarca(marca) {
  // Troca o título grande (h1.hero-title) e o <title>
  const map = {
    metasul: 'Metasul',
    arquitech: 'Arquitech',
    ibmf: 'IBMF'
  };
  const label = map[marca] || 'IBMF';

  document.title = label;
  const h1 = document.querySelector('.hero-title');
  if (h1) h1.textContent = label;
}

function matchMarca(link, marca) {
  // prioridade: campo "marca"
  const v = String(link?.marca || '').trim().toLowerCase();
  if (v) return v === marca;

  // fallback: se você salvar como "linha" no backend, também funciona
  const l = String(link?.linha || '').trim().toLowerCase();
  if (l) return l === marca;

  // se não tiver nada, assume IBMF (pra não sumir com links antigos)
  return marca === 'ibmf';
}

function isAtivo(v) {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === 'number') return v === 1;

  const s = String(v).trim().toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === '1') return true;
  if (s === '0') return false;

  return true;
}

function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}
