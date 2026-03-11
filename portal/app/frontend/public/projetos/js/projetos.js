function getUserFromPortal() {
  const user = window.Auth?.getUser ? Auth.getUser() : {};
  const name = user.name || user.username || user.email || 'Usuário';
  return {
    id: user.sub || null,
    nome: name,
    isAdmin: !!(window.Auth?.hasRole && Auth.hasRole('portal_admin')),
    acessoProjetos: !!(window.Auth?.hasRole && (Auth.hasRole('projetos') || Auth.hasRole('projetos_admin') || Auth.hasRole('portal_admin'))),
    projetosAdmin: !!(window.Auth?.hasRole && (Auth.hasRole('projetos_admin') || Auth.hasRole('portal_admin')))
  };
}

function guardProjetos() {
  if (window.Auth?.requireAuth) window.Auth.requireAuth();
  else if (typeof checkAuth === 'function') checkAuth();

  const u = getUserFromPortal();
  if (!(u.isAdmin || u.acessoProjetos)) {
    alert('Sem permissão para acessar Projetos.');
    window.location.href = '/home.html';
    return false;
  }
  return true;
}

function moneyBR(v){
  const n = Number(v||0);
  return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}

function tagStatus(status){
  const s = String(status || '').toUpperCase();
  if (s === 'CONCLUIDO' || s === 'CONCLUÍDO') return `<span class="tag ok">Concluído</span>`;
  if (s === 'ATRASADO') return `<span class="tag bad">Atrasado</span>`;
  if (s === 'PAUSADO') return `<span class="tag warn">Pausado</span>`;
  if (s === 'PENDENTE_APROVACAO') return `<span class="tag warn">Aguardando aprovação</span>`;
  if (s === 'FINALIZADO') return `<span class="tag ok">Finalizado</span>`;
  if (s === 'CANCELADO') return `<span class="tag muted">Cancelado</span>`;
  if (s === 'DESATIVADO') return `<span class="tag muted">Desativado</span>`;
  return `<span class="tag ok">Em andamento</span>`;
}

function stageLabel(id){
  return id || '-';
}

const app = {
  projects: [],
  modelos: [],
  setores: [],
  userSetores: [],
  modelDef: null,
  view: 'acompanhar',

  async init() {
    if (!guardProjetos()) return;

    const u = getUserFromPortal();
    document.getElementById('sidebarUserName').textContent = u.nome;
    document.getElementById('sidebarUserRole').textContent = u.isAdmin ? 'Admin' : 'Usuário';

    const avatar = document.getElementById('sidebarAvatar');
    avatar.textContent = (u.nome || 'U').trim().charAt(0).toUpperCase();

    if (!(u.isAdmin || u.projetosAdmin)) {
      document.querySelectorAll('[data-projetos-admin="1"]').forEach(el => el.remove());
    }

    await this.loadSetores();
    await this.loadUserSetores();
    await this.loadModelos();
    await this.loadProjects();

    this.bind();
    this.render();
  },

  bind() {
    document.getElementById('btnReload').addEventListener('click', async () => {
      await this.loadProjects();
      this.render();
    });

    const btnAprov = document.getElementById('btnAprovacoes');
    if (btnAprov) btnAprov.addEventListener('click', () => {
      window.location.href = '/projetos/aprovacoes.html';
    });
    const btnConfig = document.getElementById('btnConfig');
    if (btnConfig) btnConfig.addEventListener('click', () => {
      window.location.href = '/projetos/configuracoes.html';
    });

    document.getElementById('btnNewProject').addEventListener('click', () => this.openModal(true));
    document.getElementById('btnCloseModal').addEventListener('click', () => this.openModal(false));
    document.getElementById('btnCancelModal').addEventListener('click', () => this.openModal(false));

    document.getElementById('modalNew').addEventListener('click', (e) => {
      if (e.target.id === 'modalNew') this.openModal(false);
    });

    ['fSearch','fStatus','fModel','fSector'].forEach(id=>{
      document.getElementById(id).addEventListener('input', () => this.render());
    });

    document.querySelectorAll('.tab[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab[data-view]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.view = btn.dataset.view;
        this.render();
      });
    });

    const u = getUserFromPortal();
    document.querySelector('#formNew input[name="owner"]').value = u.nome;
    const solicit = document.getElementById('m-solicitante');
    if (solicit) solicit.value = u.nome;
    const abertura = document.getElementById('m-data-abertura');
    if (abertura) abertura.value = new Date().toLocaleDateString('pt-BR');

    const modelSelect = document.getElementById('m-modelo');
    if (modelSelect) {
      modelSelect.addEventListener('change', async () => {
        await this.loadModelDef(modelSelect.value);
        this.renderDynamicFields();
      });
    }

    document.getElementById('btnNextStep').addEventListener('click', () => this.goStep(2));
    document.getElementById('btnBackStep').addEventListener('click', () => this.goStep(1));

    document.getElementById('formNew').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.createProject(new FormData(e.target));
      e.target.reset();
      document.querySelector('#formNew input[name="owner"]').value = u.nome;
      if (solicit) solicit.value = u.nome;
      if (abertura) abertura.value = new Date().toLocaleDateString('pt-BR');
      this.openModal(false);
      this.goStep(1);
    });
  },

  async loadModelos() {
    const res = await Auth.fetch(`${window.API_BASE_URL}/api/projetos/modelos?with_def=1`);
    const data = await res.json().catch(() => []);
    const raw = Array.isArray(data) ? data : [];
    const u = getUserFromPortal();
    const setoresUser = new Set(this.userSetores || []);
    this.modelos = raw.map(m => ({
      ...m,
      definicao_json: (() => {
        if (!m?.definicao_json) return {};
        if (typeof m.definicao_json === 'string') {
          try { return JSON.parse(m.definicao_json); } catch { return {}; }
        }
        return m.definicao_json;
      })()
    })).filter(m => {
      if (u.isAdmin || u.projetosAdmin) return true;
      const def = m.definicao_json || {};
      const permitidos = Array.isArray(def.setores_permitidos) ? def.setores_permitidos : [];
      if (!permitidos.length) return false;
      return permitidos.some(id => setoresUser.has(id));
    });

    const select = document.getElementById('m-modelo');
    if (select) {
      select.innerHTML = this.modelos.map(m => `<option value="${m.id}">${m.nome}</option>`).join('');
    }

    const filter = document.getElementById('fModel');
    if (filter) {
      filter.innerHTML = '<option value="">Todos</option>' +
        this.modelos.map(m => `<option value="${m.id}">${m.nome}</option>`).join('');
    }

    if (this.modelos.length) {
      await this.loadModelDef(this.modelos[0].id);
      this.renderDynamicFields();
    }
  },

  async loadModelDef(modeloId) {
    if (!modeloId) { this.modelDef = null; return; }
    const model = (this.modelos || []).find(m => String(m.id) === String(modeloId));
    let def = model?.definicao_json || null;
    if (typeof def === 'string') {
      try { def = JSON.parse(def); } catch { def = null; }
    }
    this.modelDef = def;
  },

  async loadSetores() {
    const res = await Auth.fetch(`${window.API_BASE_URL}/api/projetos/setores`);
    const data = await res.json().catch(() => []);
    this.setores = Array.isArray(data) ? data : [];

    const filter = document.getElementById('fSector');
    if (filter) {
      filter.innerHTML = '<option value="">Todos</option>' +
        this.setores.map(s => `<option value="${s.id}">${s.nome}</option>`).join('');
    }
  },

  async loadUserSetores() {
    const res = await Auth.fetch(`${window.API_BASE_URL}/api/projetos/setores/me`);
    const data = await res.json().catch(() => []);
    this.userSetores = Array.isArray(data) ? data : [];
  },

  async loadProjects() {
    const res = await Auth.fetch(`${window.API_BASE_URL}/api/projetos`);
    const data = await res.json().catch(() => []);
    this.projects = Array.isArray(data) ? data : [];
  },

  openModal(show){
    document.getElementById('modalNew').classList.toggle('show', !!show);
    if (show) this.goStep(1);
  },

  renderDynamicFields(){
    const root = document.getElementById('m-dyn-fields');
    if (!root) return;
    root.innerHTML = '';
    const fields = Array.isArray(this.modelDef?.campos_projeto) ? this.modelDef.campos_projeto : [];
    const cfg = this.modelDef?.config || {};
    const exigeNome = String(cfg.exigir_nome_projeto).toLowerCase() !== 'false';
    const exigePrazo = String(cfg.exigir_prazo_final).toLowerCase() === 'true';

    const fieldNome = document.getElementById('fieldProjectName');
    const inputNome = document.getElementById('m-nome');
    if (fieldNome && inputNome) {
      fieldNome.style.display = exigeNome ? 'block' : 'none';
      inputNome.required = exigeNome;
      if (!exigeNome) inputNome.value = '';
    }

    const fieldCodigo = document.getElementById('fieldProjectCode');
    const inputCodigo = document.getElementById('m-codigo');
    if (fieldCodigo && inputCodigo) {
      fieldCodigo.style.display = exigeNome ? 'block' : 'none';
      if (!exigeNome) inputCodigo.value = '';
    }

    const fieldPrazo = document.getElementById('fieldProjectDeadline');
    const inputPrazo = document.getElementById('m-prazo-final');
    if (fieldPrazo && inputPrazo) {
      fieldPrazo.style.display = exigePrazo ? 'block' : 'none';
      inputPrazo.required = exigePrazo;
      if (!exigePrazo) inputPrazo.value = '';
    }

    fields.forEach(f => {
      const type = (f.tipo || 'texto').toLowerCase();
      const key = f.key || f.nome || '';
      const id = `dyn_${key}`;
      const label = f.label || f.nome || 'Campo';
      const required = !!f.obrigatorio;
      const wrap = document.createElement('div');
      wrap.className = 'field';
      let input = '';
      if (type === 'textarea') {
        input = `<textarea id="${id}" data-dyn="1" data-key="${key}" ${required ? 'required' : ''}></textarea>`;
      } else if (type === 'select' && Array.isArray(f.opcoes)) {
        input = `<select id="${id}" data-dyn="1" data-key="${key}" ${required ? 'required' : ''}>
          <option value="">Selecione</option>
          ${f.opcoes.map(o => `<option value="${o}">${o}</option>`).join('')}
        </select>`;
      } else if (type === 'data') {
        input = `<input type="date" id="${id}" data-dyn="1" data-key="${key}" ${required ? 'required' : ''} />`;
      } else if (type === 'numero' || type === 'moeda') {
        input = `<input type="number" id="${id}" data-dyn="1" data-key="${key}" ${required ? 'required' : ''} />`;
      } else {
        input = `<input type="text" id="${id}" data-dyn="1" data-key="${key}" ${required ? 'required' : ''} />`;
      }
      wrap.innerHTML = `<label>${label}</label>${input}`;
      root.appendChild(wrap);
    });
  },

  goStep(step){
    const s1 = document.getElementById('step1');
    const s2 = document.getElementById('step2');
    if (!s1 || !s2) return;
    if (step === 2) {
      const modelo = document.getElementById('m-modelo').value;
      if (!modelo) { alert('Selecione um modelo.'); return; }
      s1.classList.add('hidden');
      s2.classList.remove('hidden');
    } else {
      s2.classList.add('hidden');
      s1.classList.remove('hidden');
    }
  },

  async createProject(fd){
    const nome = String(fd.get('name')||'').trim();
    const modeloId = Number(fd.get('model_id') || 0);
    const exigeNome = String(this.modelDef?.config?.exigir_nome_projeto).toLowerCase() !== 'false';
    if (!modeloId) { alert('Informe o modelo do projeto.'); return; }
    if (exigeNome && !nome) { alert('Informe o nome do projeto.'); return; }
    const exigePrazo = String(this.modelDef?.config?.exigir_prazo_final).toLowerCase() === 'true';
    if (exigePrazo && !fd.get('deadline')) { alert('Informe o prazo final.'); return; }

    const u = getUserFromPortal();
    if (u?.id && Array.isArray(this.projects) && this.projects.length) {
      const hoje = new Date().toDateString();
      const duplicados = this.projects.filter(p => {
        if (Number(p.modelo_id) !== Number(modeloId)) return false;
        if (Number(p.dono_user_id) !== Number(u.id)) return false;
        if (!p.created_at) return false;
        return new Date(p.created_at).toDateString() === hoje;
      });
      if (duplicados.length) {
        const ok = confirm('Você já abriu um chamado deste tipo hoje. Deseja criar outro?');
        if (!ok) return;
      }
    }

    const camposJson = {};
    document.querySelectorAll('[data-dyn="1"]').forEach(el => {
      const key = el.dataset.key;
      if (!key) return;
      if (el.type === 'checkbox') camposJson[key] = !!el.checked;
      else camposJson[key] = el.value;
    });

    const body = {
      modelo_id: modeloId,
      nome: nome || null,
      codigo: String(fd.get('code')||'').trim() || null,
      prazo_fim: fd.get('deadline') || null,
      campos_json: camposJson
    };

    const res = await Auth.fetch(`${window.API_BASE_URL}/api/projetos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const out = await res.json().catch(()=>({}));
    if (!res.ok) {
      alert(out.error || 'Erro ao criar projeto');
      return;
    }

    await this.loadProjects();
    this.render();
  },

  getFiltered(){
    const s = (document.getElementById('fSearch').value||'').toLowerCase().trim();
    const st = (document.getElementById('fStatus').value||'').trim();
    const t = (document.getElementById('fModel').value||'').trim();
    const sec = (document.getElementById('fSector').value||'').trim();
    const secId = sec ? Number(sec) : null;
    const u = getUserFromPortal();

    return this.projects.filter(p=>{
      const okS = !s || (p.nome||'').toLowerCase().includes(s) || (p.codigo||'').toLowerCase().includes(s);
      const okSt = !st || p.status === st;
      const okT = !t || String(p.modelo_id||'') === t;
      const okSec = !secId || (p.setores||[]).includes(secId);
      let okView = true;
      if (this.view === 'acompanhar') {
        okView = (p.dono_user_id && p.dono_user_id === u.id) ||
          (p.responsavel_user_id && p.responsavel_user_id === u.id) ||
          (u.isAdmin || u.projetosAdmin);
      } else if (this.view === 'agir') {
        okView = (this.userSetores || []).includes(p.etapa_setor_id);
      }
      return okS && okSt && okT && okSec && okView;
    });
  },

  render(){
    const active = this.projects.filter(p => ['EM_ANDAMENTO','PENDENTE_APROVACAO'].includes(String(p.status || '').toUpperCase())).length;
    const delayed = this.projects.filter(p => String(p.status || '').toUpperCase() === 'ATRASADO').length;

    const kpiActive = document.getElementById('kpiActive');
    const kpiDelayed = document.getElementById('kpiDelayed');
    const kpiTasksDue = document.getElementById('kpiTasksDue');
    if (kpiActive) kpiActive.textContent = active;
    if (kpiDelayed) kpiDelayed.textContent = delayed;
    if (kpiTasksDue) kpiTasksDue.textContent = 0;

    const tbody = document.getElementById('projectsTbody');
    tbody.innerHTML = '';

    this.getFiltered().forEach(p=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="font-weight:600; color:var(--text-primary)">${p.nome}</div>
          <div class="muted" style="font-size:12px">${p.codigo || '-'}</div>
        </td>
        <td>${p.modelo_nome ? `<span class="badge neutral">${p.modelo_nome}</span>` : `-`}</td>
        <td>${tagStatus(p.status)}</td>
        <td>${stageLabel(p.etapa)}</td>
        <td>${p.responsavel_nome || '-'}</td>
        <td>${p.prazo_fim ? new Date(p.prazo_fim).toLocaleDateString('pt-BR') : '-'}</td>
      `;
      tr.addEventListener('click', () => {
        window.location.href = `projeto_detalhe.html?id=${encodeURIComponent(p.id)}`;
      });
      tbody.appendChild(tr);
    });
  },

  showDashboard(){ /* compat */ }
};

document.addEventListener('DOMContentLoaded', () => app.init());
