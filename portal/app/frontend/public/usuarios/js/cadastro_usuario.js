// cadastro_usuario.js
// Tela: /usuarios/cadastro_usuario.html
// Regras: "aprovar" só faz sentido se "acesso-simulacoes" estiver ligado.
// Importante: username/senha SEMPRE iniciam em branco (nunca preencher automático).

function getToken() {
  return localStorage.getItem('token') || '';
}

const $ = (s) => document.querySelector(s);

// Exigir ADMIN
function ensureAdminOrRedirect() {
  // Preferir o helper global (padrão do projeto), se existir
  if (typeof enforceAdminPage === 'function') {
    try {
      enforceAdminPage();
      return;
    } catch {}
  }

  const token = getToken();
  if (!token) {
    window.location.href = '../login.html';
    return;
  }

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload || !payload.isAdmin) {
      alert('Acesso restrito a administradores.');
      window.location.href = '../home.html';
    }
  } catch {
    window.location.href = '../login.html';
  }
}

const inpBusca  = $('#buscar-dwh');
const boxSug    = $('#sugestoes');
const inpCodigo = $('#dwh-codigo');
const inpNome   = $('#nome');
const inpEmail  = $('#email');
const msgDwh    = $('#msg-dwh');
const msgForm   = $('#msg-form');
const inpUser   = $('#username');

let selecionado = null;

// Busca no DWH
async function buscarCadastrosDwh(q) {
  const url = `${API_BASE_URL}/api/representantes-dwh/cadastros?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { Authorization: getToken() }
  });
  if (!res.ok) throw new Error('Falha ao buscar no DWH');
  return res.json();
}

function renderSugestoes(items) {
  if (!items || items.length === 0) {
    boxSug.innerHTML = '<div class="suggest-item muted">Sem resultados</div>';
    boxSug.classList.remove('hidden');
    return;
  }

  boxSug.innerHTML = items.map(it => `
    <div class="suggest-item"
         data-id="${String(it.id || '').replace(/"/g,'&quot;')}"
         data-nome="${String(it.nome || '').replace(/"/g,'&quot;')}"
         data-email="${String(it.email || '').replace(/"/g,'&quot;')}">
      <div><strong>${it.nome || '(sem razão social)'}</strong></div>
      <div class="muted">
        Código: ${it.id || '—'} &nbsp;|&nbsp; ${it.email || 'sem e-mail'}
      </div>
    </div>
  `).join('');

  boxSug.classList.remove('hidden');
}

function aplicarSelecao({ id, nome, email }) {
  selecionado = { id, nome, email };
  inpCodigo.value = id || '';
  inpNome.value   = nome || '';
  inpEmail.value  = email || '';

  if (!email || String(email).trim() === '') {
    inpEmail.classList.remove('input-resultado');
    inpEmail.readOnly = false;
  } else {
    inpEmail.classList.add('input-resultado');
    inpEmail.readOnly = true;
  }

  boxSug.classList.add('hidden');
  msgDwh.classList.add('hidden');
  msgDwh.textContent = '';
}

function limparSelecaoDwh() {
  selecionado = null;
  inpBusca.value  = '';
  inpCodigo.value = '';
  inpNome.value   = '';
  inpEmail.value  = '';

  inpEmail.classList.add('input-resultado');
  inpEmail.readOnly = true;

  boxSug.classList.add('hidden');
  msgDwh.classList.add('hidden');
  msgDwh.textContent = '';
}

// UI: toggles + chips
function setToggleText(inputId, textId) {
  const el = document.getElementById(inputId);
  const txt = document.getElementById(textId);
  if (!el || !txt) return;
  txt.textContent = el.checked ? 'Sim' : 'Não';
}

function updateAdminChip() {
  const isAdmin = document.getElementById('isadmin');
  const chip = document.getElementById('chip-admin');
  if (!isAdmin || !chip) return;
  chip.textContent = isAdmin.checked ? 'Admin' : 'Usuário';
  chip.classList.toggle('chip-on', !!isAdmin.checked);
}

function updatePermissoesChip() {
  const chip = document.getElementById('chip-permissoes');
  if (!chip) return;
  const checks = Array.from(document.querySelectorAll('input[data-permissao="1"]'));
  const ativas = checks.filter(c => c.checked).length;
  chip.textContent = `${ativas} ativas`;
  chip.classList.toggle('chip-on', ativas > 0);
}

function marcarTodasPermissoes(v) {
  const checks = Array.from(document.querySelectorAll('input[data-permissao="1"]'));
  checks.forEach(c => { c.checked = !!v; });

  // se ligar todas, simulações fica ligado e mostra o “aprovar” (mas NÃO marca aprovar automaticamente)
  syncAprovarSimulacaoUI();
  syncMetasUI();
  syncProjetosAdminUI();
  syncMetasUI();
  syncProjetosAdminUI();

  updatePermissoesChip();
}

// Senha
function gerarSenhaForte(tamanho = 14) {
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const nums  = '0123456789';
  const sym   = '!@#$%*-_=+?';

  const all = lower + upper + nums + sym;
  const pick = (s) => s[Math.floor(Math.random() * s.length)];

  let out = [pick(lower), pick(upper), pick(nums), pick(sym)];
  while (out.length < tamanho) out.push(pick(all));

  out = out.sort(() => Math.random() - 0.5);
  return out.join('');
}

function limparCredenciais() {
  // Nunca deixar nada preenchido por padrão
  if (inpUser) inpUser.value = '';

  const senha = document.getElementById('senha');
  const conf  = document.getElementById('confirmar');
  if (senha) senha.value = '';
  if (conf)  conf.value  = '';

  const btnToggle = document.getElementById('btn-toggle-senha');
  if (btnToggle) btnToggle.textContent = 'Mostrar';

  if (senha) senha.type = 'password';
  if (conf)  conf.type  = 'password';
}

function syncAprovarSimulacaoUI() {
  const swSim = document.getElementById('acesso-simulacoes');
  const swApr = document.getElementById('aprovar');
  const wrap  = document.getElementById('wrap-aprovar');

  const simOn = !!swSim?.checked;

  if (wrap) wrap.classList.toggle('hidden', !simOn);

  // regra dura: sem simulações, sem aprovar
  if (!simOn && swApr) swApr.checked = false;

  // habilita/desabilita
  if (swApr) swApr.disabled = !simOn;
}

function syncProjetosAdminUI() {
  const swProj = document.getElementById('acesso-projetos');
  const swAdmin = document.getElementById('projetos-admin');
  const wrap = document.getElementById('wrap-projetos-admin');

  const on = !!swProj?.checked;
  if (wrap) wrap.classList.toggle('hidden', !on);
  if (!on && swAdmin) swAdmin.checked = false;
  if (swAdmin) swAdmin.disabled = !on;
}

function syncMetasUI() {
  const swMetas = document.getElementById('acesso-metas');
  const wrap = document.getElementById('wrap-metas');
  const swAdmin = document.getElementById('metas-admin');
  const selFrom = document.getElementById('metas-from');
  const selUntil = document.getElementById('metas-until');

  const metasOn = !!swMetas?.checked;
  if (wrap) wrap.classList.toggle('hidden', !metasOn);

  if (!metasOn && swAdmin) swAdmin.checked = false;

  const adminOn = !!swAdmin?.checked;
  if (selFrom) selFrom.disabled = !metasOn || adminOn;
  if (selUntil) selUntil.disabled = !metasOn || adminOn;
  if (swAdmin) swAdmin.disabled = !metasOn;
}

function limparFormulario() {
  const linha = document.getElementById('linha');
  if (linha) linha.value = 'todas';

  const isAdmin = document.getElementById('isadmin');
  if (isAdmin) isAdmin.checked = false;

  // Permissões: desmarca tudo (inclusive simulações)
  marcarTodasPermissoes(false);

  // Aprovar sempre falso (e escondido pq simulações ficará off)
  const aprovar = document.getElementById('aprovar');
  if (aprovar) aprovar.checked = false;

  const metasAdmin = document.getElementById('metas-admin');
  const metasFrom = document.getElementById('metas-from');
  const metasUntil = document.getElementById('metas-until');
  if (metasAdmin) metasAdmin.checked = false;
  if (metasFrom) metasFrom.value = '2';
  if (metasUntil) metasUntil.value = '5';

  const projAdmin = document.getElementById('projetos-admin');
  if (projAdmin) projAdmin.checked = false;

  setToggleText('isadmin', 'txt-isadmin');
  updateAdminChip();
  updatePermissoesChip();
  syncAprovarSimulacaoUI();
  syncMetasUI();
  syncProjetosAdminUI();

  // Credenciais SEMPRE limpas
  limparCredenciais();

  if (msgForm) {
    msgForm.classList.add('hidden');
    msgForm.textContent = '';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof checkAuth === 'function') checkAuth();
  ensureAdminOrRedirect();

  // Blindar autofill básico nas credenciais (evita navegador preencher sozinho)
  setTimeout(limparCredenciais, 50);
  setTimeout(limparCredenciais, 250);

  // DWH
  let timer = null;

  inpBusca.addEventListener('input', () => {
    const termo = (inpBusca.value || '').trim();
    if (timer) clearTimeout(timer);

    if (termo.length < 2) {
      boxSug.classList.add('hidden');
      return;
    }

    timer = setTimeout(async () => {
      try {
        const lista = await buscarCadastrosDwh(termo);
        renderSugestoes(lista);
        msgDwh.classList.add('hidden');
      } catch {
        boxSug.classList.add('hidden');
        msgDwh.textContent = 'Não consegui buscar no DWH. Verifique o endpoint /api/representantes-dwh/cadastros.';
        msgDwh.classList.remove('hidden');
      }
    }, 250);
  });

  boxSug.addEventListener('click', (ev) => {
    const el = ev.target.closest('.suggest-item');
    if (!el) return;

    aplicarSelecao({
      id:    el.dataset.id   || '',
      nome:  el.dataset.nome || '',
      email: el.dataset.email|| ''
    });
    inpBusca.value = el.dataset.nome || '';
  });

  const btnLimparDwh = document.getElementById('btn-limpar-dwh');
  if (btnLimparDwh) btnLimparDwh.addEventListener('click', limparSelecaoDwh);

  // UI: perfil
  const isAdmin = document.getElementById('isadmin');
  if (isAdmin) {
    isAdmin.addEventListener('change', () => {
      setToggleText('isadmin', 'txt-isadmin');
      updateAdminChip();
    });
  }

  // UI: permissões
  Array.from(document.querySelectorAll('input[data-permissao="1"]')).forEach(el => {
    el.addEventListener('change', () => {
      updatePermissoesChip();
      if (el.id === 'acesso-simulacoes') syncAprovarSimulacaoUI();
      if (el.id === 'acesso-metas') syncMetasUI();
      if (el.id === 'acesso-projetos') syncProjetosAdminUI();
    });
  });

  const swMetasAdmin = document.getElementById('metas-admin');
  if (swMetasAdmin) swMetasAdmin.addEventListener('change', syncMetasUI);

  const btnMarcar = document.getElementById('btn-marcar-todas');
  const btnLimpar = document.getElementById('btn-desmarcar-todas');
  if (btnMarcar) btnMarcar.addEventListener('click', () => marcarTodasPermissoes(true));
  if (btnLimpar) btnLimpar.addEventListener('click', () => marcarTodasPermissoes(false));

  // UI: senha
  const btnGerar = document.getElementById('btn-gerar-senha');
  const btnToggle = document.getElementById('btn-toggle-senha');
  const inpSenha = document.getElementById('senha');
  const inpConf  = document.getElementById('confirmar');

  if (btnGerar && inpSenha && inpConf) {
    btnGerar.addEventListener('click', () => {
      const s = gerarSenhaForte(14);
      inpSenha.value = s;
      inpConf.value = s;
    });
  }

  if (btnToggle && inpSenha && inpConf) {
    btnToggle.addEventListener('click', () => {
      const show = inpSenha.type === 'password';
      inpSenha.type = show ? 'text' : 'password';
      inpConf.type  = show ? 'text' : 'password';
      btnToggle.textContent = show ? 'Esconder' : 'Mostrar';
    });
  }

  // Limpar formulário
  const btnLimparForm = document.getElementById('btn-limpar-form');
  if (btnLimparForm) btnLimparForm.addEventListener('click', limparFormulario);

  // Estado inicial
  setToggleText('isadmin', 'txt-isadmin');
  updateAdminChip();
  updatePermissoesChip();
  syncAprovarSimulacaoUI();

  // Garantir que não começa com nada em credenciais
  limparCredenciais();

  // Salvar usuário
  document.getElementById('btn-salvar').addEventListener('click', async () => {
    msgForm.classList.add('hidden');
    msgForm.textContent = '';

    if (!selecionado || !selecionado.id) {
      msgForm.textContent = 'Selecione um cadastro no DWH antes de salvar.';
      msgForm.classList.remove('hidden');
      return;
    }

    const senha = (inpSenha ? inpSenha.value : '') || '';
    const conf  = (inpConf  ? inpConf.value  : '') || '';

    if (!senha || !conf || senha !== conf) {
      msgForm.textContent = 'As senhas não coincidem ou estão vazias.';
      msgForm.classList.remove('hidden');
      return;
    }

    const emailFinal = (inpEmail.value || '').trim();
    if (!emailFinal) {
      msgForm.textContent = 'Informe um e-mail válido.';
      msgForm.classList.remove('hidden');
      return;
    }

    const username = (inpUser.value || '').trim();
    if (!username) {
      msgForm.textContent = 'Informe o nome de usuário.';
      msgForm.classList.remove('hidden');
      return;
    }

    const reUser = /^[a-zA-Z0-9._-]{3,32}$/;
    if (!reUser.test(username)) {
      msgForm.textContent = 'Nome de usuário inválido. Use 3–32 caracteres: letras, números, ponto, underline ou hífen.';
      msgForm.classList.remove('hidden');
      return;
    }

    const simOn = !!document.getElementById('acesso-simulacoes')?.checked;
    const aprovarSim = simOn ? !!document.getElementById('aprovar')?.checked : false;

    const metasOn = !!document.getElementById('acesso-metas')?.checked;
    const metasAdmin = metasOn ? !!document.getElementById('metas-admin')?.checked : false;
    const metasFrom = Number(document.getElementById('metas-from')?.value || 2);
    const metasUntil = Number(document.getElementById('metas-until')?.value || 5);
    if (metasOn && !metasAdmin && metasFrom > metasUntil) {
      msgForm.textContent = 'Metas: nível "de" não pode ser maior que nível "até".';
      msgForm.classList.remove('hidden');
      return;
    }

    const projetosOn = !!document.getElementById('acesso-projetos')?.checked;
    const projetosAdmin = projetosOn ? !!document.getElementById('projetos-admin')?.checked : false;

    const body = {
      dwhCodigo: selecionado.id,
      email: emailFinal,
      nome: selecionado.nome,
      username,
      linha: document.getElementById('linha').value,

      isAdmin: !!document.getElementById('isadmin')?.checked,
      aprovarSimulacao: aprovarSim,

      // Módulos
      acessoRh: !!document.getElementById('acesso-rh')?.checked,
      acessoContratos: !!document.getElementById('acesso-contratos')?.checked,
      acessoComissoes: !!document.getElementById('acesso-comissoes')?.checked,
      acessoInadimplencia: !!document.getElementById('acesso-inadimplencia')?.checked,
      acessoSac: !!document.getElementById('acesso-sac')?.checked,
      acessoLinks: !!document.getElementById('acesso-links')?.checked,
      acessoSimulacoes: simOn,
      acessoRegioes: !!document.getElementById('acesso-regioes')?.checked,
      acessoProjetos: projetosOn,
      projetosAdmin,
      acessoMetas: metasOn,
      metasAdmin,
      metasEditFromLevel: metasFrom,
      metasEditUntilLevel: metasUntil,

      senha
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/usuarios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': getToken()
        },
        body: JSON.stringify(body)
      });

      const out = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409 && out?.field === 'email') throw new Error('Já existe um usuário com este e-mail.');
        if (res.status === 409 && out?.field === 'dwh_codigo') throw new Error('Já existe um usuário vinculado a este código do DWH.');
        if (res.status === 409 && out?.field === 'username') throw new Error('Este nome de usuário já está em uso.');
        throw new Error(out.error || 'Erro ao cadastrar usuário');
      }

      alert('Usuário cadastrado com sucesso!');
      window.location.href = 'usuarios.html';
    } catch (e) {
      msgForm.textContent = e.message;
      msgForm.classList.remove('hidden');
    }
  });
});
