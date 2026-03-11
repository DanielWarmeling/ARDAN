/* =========================================================
   Candidatura — Enviar currículo (UPLOAD) + hCaptcha + LGPD
   ========================================================= */
(() => {
  const qs = new URLSearchParams(location.search);
  const vagaId = qs.get('vaga_id') || '';

  // ---- CONTROLE DE VERSÃO DO TERMO (para o backend registrar) ----
  const TERMO_VERSION = 'v1-2025-10-31';

  // Atalhos
  const $ = (sel) => document.querySelector(sel);
  const msg = $('#msg');

  // Campos
  const nome   = $('#nome');
  const idade  = $('#idade');
  const whats  = $('#whats');
  const email  = $('#email');
  const origem = $('#origem');
  const origemOutrosWrap = $('#origemOutrosWrap');
  const origemOutros = $('#origemOutros');
  const lgpd   = $('#lgpd');
  const file   = $('#file');

  const btnEnviar   = $('#btnEnviar');
  const btnCancelar = $('#btnCancelar');

  // -------------------------------------------------------
  // Utils de feedback
  // -------------------------------------------------------
  function clearMsg(){ msg.textContent=''; msg.className='msg'; }
  function showOk(t){ msg.textContent=t; msg.className='msg ok'; }
  function showErr(t){ msg.textContent=t; msg.className='msg err'; }

  function setInvalid(el, on=true){
    const fld = el?.closest?.('.field');
    if (fld) fld.classList.toggle('invalid', on);
  }

  // -------------------------------------------------------
  // Máscara simples de WhatsApp
  // -------------------------------------------------------
  whats.addEventListener('input', () => {
    let v = (whats.value || '').replace(/\D/g, '');
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length > 6)      whats.value = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
    else if (v.length > 2) whats.value = `(${v.slice(0,2)}) ${v.slice(2)}`;
    else if (v.length > 0) whats.value = `(${v}`;
  });

  // -------------------------------------------------------
  // Mostrar/esconder "Outros" da origem
  // -------------------------------------------------------
  origem.addEventListener('change', () => {
    if (origem.value === 'Outros'){
      origemOutrosWrap.classList.remove('hide');
      origemOutros.required = true;
    } else {
      origemOutrosWrap.classList.add('hide');
      origemOutros.required = false;
      origemOutros.value = '';
    }
    validate();
  });

  // -------------------------------------------------------
  // Validação de arquivo
  // -------------------------------------------------------
  const OK_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
  ];
  const MAX_MB = 10;

  function validateFile(){
    const f = file.files?.[0];
    if (!f) { setInvalid(file, true); return false; }
    const mb = f.size / (1024*1024);
    if (mb > MAX_MB){
      showErr(`Arquivo acima de ${MAX_MB}MB.`);
      setInvalid(file, true);
      return false;
    }
    if (!OK_TYPES.includes(f.type)){
      showErr('Tipo não suportado. Use PDF, DOC, JPG ou PNG.');
      setInvalid(file, true);
      return false;
    }
    setInvalid(file, false);
    return true;
  }

  // -------------------------------------------------------
  // hCaptcha helpers
  // -------------------------------------------------------
  function captchaPresent(){
    return !!document.querySelector('.h-captcha');
  }

  function getCaptchaTokenFromDom(){
    // hCaptcha injeta um textarea com name="h-captcha-response"
    const t = document.querySelector('textarea[name="h-captcha-response"]');
    return (t && t.value) ? t.value : '';
  }

  function getCaptchaTokenFromApi(){
    try {
      const hc = window.hcaptcha;
      if (!hc || !hc.getResponse) return '';
      // tenta pegar o primeiro widget id
      let wid = null;
      // 1) via dataset (quando auto-render)
      const cont = document.querySelector('.h-captcha');
      if (cont && cont.dataset && cont.dataset.hcaptchaWidgetId) wid = cont.dataset.hcaptchaWidgetId;
      // 2) fallback: 1º widget registrado
      if (!wid && hc.widgets && hc.widgets.getAll) {
        const all = hc.widgets.getAll();
        if (all && all.length) wid = all[0];
      }
      return wid ? (hc.getResponse(wid) || '') : '';
    } catch { return ''; }
  }

  async function getCaptchaToken(){
    if (!captchaPresent()) return '';  // captcha é opcional se não existir no DOM
    // primeiro tenta DOM, depois API
    return getCaptchaTokenFromDom() || getCaptchaTokenFromApi() || '';
  }

  // Quando o script do hCaptcha valida, ele dispara mudança no textarea — revalida o form
  const captchaObserver = new MutationObserver(validate);
  const observeCaptcha = () => {
    const t = document.querySelector('textarea[name="h-captcha-response"]');
    if (t) captchaObserver.observe(t, { attributes: true, attributeFilter: ['value'] });
  };
  // tentar observar alguns ms depois (quando script carregar)
  setTimeout(observeCaptcha, 1200);

  // -------------------------------------------------------
  // Validações básicas
  // -------------------------------------------------------
  function validate(){
    clearMsg();
    let ok = true;

    if (!nome.value.trim()){ setInvalid(nome, true); ok = false; } else setInvalid(nome, false);

    const idadeN = Number(idade.value);
    if (!idade.value || isNaN(idadeN) || idadeN < 14 || idadeN > 100){ setInvalid(idade, true); ok = false; } else setInvalid(idade, false);

    if (!/^\(\d{2}\)\s?\d{4,5}-\d{4}$/.test(whats.value.trim())){ setInvalid(whats, true); ok = false; } else setInvalid(whats, false);

    if (!/^\S+@\S+\.\S+$/.test(email.value.trim())){ setInvalid(email, true); ok = false; } else setInvalid(email, false);

    if (!origem.value){ setInvalid(origem, true); ok = false; } else setInvalid(origem, false);

    if (!origemOutrosWrap.classList.contains('hide') && !origemOutros.value.trim()){
      setInvalid(origemOutros, true); ok = false;
    } else setInvalid(origemOutros, false);

    if (!validateFile()) ok = false;

    if (!lgpd.checked) ok = false;

    // Se houver captcha na tela e ainda não houver token, mantém desabilitado
    if (captchaPresent()) {
      const token = getCaptchaTokenFromDom() || getCaptchaTokenFromApi();
      if (!token) ok = false;
    }

    btnEnviar.disabled = !ok;
    return ok;
  }

  // Listeners de validação
  [nome, idade, whats, email, origem, origemOutros, file, lgpd].forEach(el => {
    el?.addEventListener(el?.type === 'file' ? 'change' : 'input', validate);
  });

  // -------------------------------------------------------
  // Cancelar
  // -------------------------------------------------------
  btnCancelar.addEventListener('click', () => {
    if (vagaId) location.href = `./detalhe_vaga.html?id=${encodeURIComponent(vagaId)}`;
    else history.back();
  });

  // -------------------------------------------------------
  // Envio
  // -------------------------------------------------------
  btnEnviar.addEventListener('click', async () => {
    if (!validate()) return;

    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Enviando...';
    clearMsg();

    try{
      // Token do captcha (se houver)
      const captchaToken = await getCaptchaToken();
      if (captchaPresent() && !captchaToken){
        showErr('Confirme o CAPTCHA para prosseguir.');
        btnEnviar.disabled = false;
        btnEnviar.textContent = 'Enviar candidatura';
        return;
      }

      const fd = new FormData();
      fd.append('vaga_id', vagaId);
      fd.append('nome', nome.value.trim());
      fd.append('idade', idade.value);
      fd.append('whatsapp', whats.value.trim());
      fd.append('email', email.value.trim());
      fd.append('trabalhou_na_empresa', (document.querySelector('input[name="ex"]:checked')?.value || '').trim());
      fd.append('origem', origem.value);
      if (origem.value === 'Outros') fd.append('origem_outros', origemOutros.value.trim());
      fd.append('lgpd_ok', lgpd.checked ? '1' : '0');
      // Consentimento (cliente → backend também grava IP/UTC)
      fd.append('consent_version', TERMO_VERSION);
      fd.append('consent_at_client', new Date().toISOString());
      // Captcha
      if (captchaToken) fd.append('captcha_token', captchaToken);

      const f = file.files[0];
      fd.append('curriculo', f, f.name);

      const resp = await fetch('/api/rh/candidaturas/upload', {
        method: 'POST',
        body: fd
      });

      if (!resp.ok){
        const txt = await resp.text().catch(()=> '');
        throw new Error(txt || 'Falha ao enviar candidatura.');
      }

      showOk('Candidatura enviada com sucesso! Você receberá um e-mail de confirmação.');
      btnEnviar.textContent = 'Enviado ✅';

      setTimeout(() => {
        if (vagaId) location.href = `./detalhe_vaga.html?id=${encodeURIComponent(vagaId)}`;
      }, 1800);

    } catch(err){
      console.error(err);
      showErr(typeof err?.message === 'string' ? err.message : 'Erro inesperado ao enviar.');
      btnEnviar.disabled = false;
      btnEnviar.textContent = 'Enviar candidatura';
    }
  });

  // Validação inicial (inclui estado do captcha/LGPD)
  validate();
})();
