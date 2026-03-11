/* globals window, document, fetch */
(() => {
  const qs = new URLSearchParams(window.location.search);
  const vagaId = qs.get('vaga_id') || qs.get('id') || '';

  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const digits = (s) => String(s || '').replace(/\D+/g, '');

  const form        = $('#formCandidatura');
  const msg         = $('#msg');
  const btnEnviar   = $('#btnEnviar');
  const btnCancelar = $('#btnCancelar');

  const vagaIdI   = $('#vagaId');
  const nomeI     = $('#nome_completo');
  const cpfI      = $('#cpf');
  const dataNascI = $('#data_nasc');
  const dddI      = $('#ddd');
  const telI      = $('#telefone');
  const emailI    = $('#email');
  const endI      = $('#endereco');
  const bairroI   = $('#bairro');
  const cidadeI   = $('#cidade');
  const grauI     = $('#grau_instrucao');
  const expI      = $('#experiencias');
  const horarioI  = $('#horario');
  const lgpdCk    = $('#lgpd');
  const origemVagaI = $('#origem_vaga');
  const jaTrabalhouRadios = $$('input[name="ja_trabalhou"]');

  function clearMsg(){ msg.textContent = ''; msg.className = 'msg'; }
  function showOk(t){ msg.textContent = t;  msg.className = 'msg ok'; }
  function showErr(t){ msg.textContent = t; msg.className = 'msg err'; }

  const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const reData  = /^(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\/\d{4}$/;

  // ========= hCaptcha =========
  let captchaToken = '';

  window.onHCaptchaSuccess = function(token) {
    captchaToken = token || '';
    validate();
  };
  window.onHCaptchaExpired = function() {
    captchaToken = '';
    validate();
  };
  window.onHCaptchaError = function() {
    captchaToken = '';
    validate();
  };

  function getCaptchaTokenFromDom() {
    const t = document.querySelector('textarea[name="h-captcha-response"]');
    return (t && t.value) ? t.value.trim() : '';
  }

  const captchaObserver = new MutationObserver(() => validate());
  (function watchCaptcha(){
    const t = document.querySelector('textarea[name="h-captcha-response"]');
    if (t) {
      captchaObserver.observe(t, { attributes: true, attributeFilter: ['value'] });
    } else {
      setTimeout(watchCaptcha, 400);
    }
  })();

  // ========= Máscaras =========
  dataNascI.addEventListener('input', (e) => {
    const d = digits(e.target.value).slice(0, 8);
    let out = d;
    if (d.length > 4) out = d.slice(0,2) + '/' + d.slice(2,4) + '/' + d.slice(4);
    else if (d.length > 2) out = d.slice(0,2) + '/' + d.slice(2);
    e.target.value = out;
    validate();
  });

  function onlyDigits(el, max){
    el.addEventListener('input', (e) => {
      e.target.value = digits(e.target.value).slice(0, max);
      validate();
    });
  }
  onlyDigits(cpfI, 11);
  onlyDigits(dddI, 2);
  onlyDigits(telI, 9);

  // ========= Helpers extras =========
  function getJaTrabalhou() {
    const r = jaTrabalhouRadios.find(x => x.checked);
    return r ? r.value : '';
  }

  // ========= Validação =========
  function validate() {
    const nomeOk   = nomeI.value.trim().length >= 3;
    const cpfOk    = /^\d{11}$/.test(digits(cpfI.value));
    const nascOk   = reData.test((dataNascI.value || '').trim());
    const dddOk    = /^\d{2}$/.test(digits(dddI.value));
    const telOk    = /^\d{8,9}$/.test(digits(telI.value));
    const emailOk  = reEmail.test((emailI.value || '').trim());
    const endOk    = endI.value.trim().length >= 3;
    const bairroOk = bairroI.value.trim().length >= 2;
    const cidadeOk = cidadeI.value.trim().length >= 2;
    const grauOk   = !!grauI.value;
    const expOk    = expI.value.trim().length >= 5;
    const horOk    = !!horarioI.value;
    const lgpdOk   = lgpdCk.checked;
    const origemOk = !!origemVagaI.value;
    const jaTrabOk = !!getJaTrabalhou();

    const tokenAny = captchaToken || getCaptchaTokenFromDom();
    const captchaOk = !!tokenAny;

    const checks = {
      nomeOk, cpfOk, nascOk, dddOk, telOk, emailOk,
      endOk, bairroOk, cidadeOk, grauOk, expOk, horOk,
      origemOk, jaTrabOk,
      lgpdOk, captchaOk
    };

    const ok = Object.values(checks).every(Boolean);
    btnEnviar.disabled = !ok;

    if (!ok) {
      const faltando = Object.entries(checks)
        .filter(([,v]) => !v)
        .map(([k]) => k.replace('Ok',''))
        .join(', ');
      btnEnviar.title = 'Campos pendentes: ' + faltando;
    } else {
      btnEnviar.title = '';
    }

    window.__candidatar_gerar_state = () => ({...checks, btnDisabled: btnEnviar.disabled});
    return ok;
  }

  // Revalida em mudanças de campos
  $$('#formCandidatura input, #formCandidatura select, #formCandidatura textarea')
    .forEach(el => el.addEventListener('input', validate));

  jaTrabalhouRadios.forEach(r =>
    r.addEventListener('change', validate)
  );
  origemVagaI.addEventListener('change', validate);

  // ========= Geração do PDF (currículo) =========
  function gerarPdfBlob() {
    const jaTrab = getJaTrabalhou();
    const origem = origemVagaI.value || '';
    const dddVal = digits(dddI.value);
    const telVal = digits(telI.value);
    const telefoneFmt = telVal ? `(${dddVal || '--'}) ${telVal}` : '';
    const enderecoFmt = [(endI.value || '').trim(), (bairroI.value || '').trim(), (cidadeI.value || '').trim()]
      .filter(Boolean)
      .join(' - ');
    const MAX_LINE_CHARS = 85;

    const breakText = (text, maxLen = MAX_LINE_CHARS, placeholder = '-') => {
      const raw = String(text ?? '').replace(/\r/g, '');
      const paragraphs = raw.split('\n');
      const out = [];
      const chunkWord = (word) => {
        const parts = [];
        let rest = word;
        while (rest.length > maxLen) {
          parts.push(rest.slice(0, maxLen));
          rest = rest.slice(maxLen);
        }
        if (rest) parts.push(rest);
        return parts;
      };
      paragraphs.forEach((para, idx) => {
        const words = para.trim().split(/\s+/).filter(Boolean);
        if (!words.length) {
          if (idx !== paragraphs.length - 1) out.push('');
          return;
        }
        let line = '';
        words.forEach((word) => {
          let currentWord = word;
          const candidate = line ? `${line} ${currentWord}` : currentWord;
          if (candidate.length > maxLen) {
            if (line) out.push(line);
            if (currentWord.length > maxLen) {
              const pieces = chunkWord(currentWord);
              while (pieces.length > 1) out.push(pieces.shift());
              line = pieces[0] || '';
            } else {
              line = currentWord;
            }
          } else {
            line = candidate;
          }
        });
        if (line) out.push(line);
        if (idx !== paragraphs.length - 1) out.push('');
      });
      return out.length ? out : (placeholder === '' ? [] : [placeholder]);
    };

    // 1) Tenta com jsPDF
    try {
      const jp = window.jspdf;
      if (jp && jp.jsPDF) {
        const doc = new jp.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const margin = 12;
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();
        const lineHeight = 6;
        const maxWidth = pageWidth - margin * 2;
        let y = margin;

        const ensureSpace = () => {
          if (y > pageHeight - margin) {
            doc.addPage();
            doc.setFontSize(11);
            y = margin;
          }
        };

        const writeLines = (text, extraGap = 0, placeholder = '—') => {
          const hasContent = String(text ?? '').trim().length > 0;
          const lines = breakText(text, MAX_LINE_CHARS, hasContent ? '' : placeholder);
          if (!lines.length && !hasContent) lines.push('');
          lines.forEach((line) => {
            ensureSpace();
            if (line) {
              doc.text(line, margin, y);
            }
            y += lineHeight;
          });
          if (extraGap) {
            y += extraGap;
            ensureSpace();
          }
        };

        const writeField = (label, value, fallback = 'Não informado') => {
          const val = (value || '').trim();
          const lines = breakText(val || fallback, MAX_LINE_CHARS, fallback);
          const first = lines.shift();
          writeLines(`${label}${first || fallback}`);
          lines.forEach((line) => writeLines(line, 0, ''));
        };

        doc.setFontSize(16);
        doc.text('Candidatura - IBMF', margin, y);
        y += 8;
        doc.setFontSize(11);

        writeField('Nome: ', nomeI.value);
        writeField('CPF: ', digits(cpfI.value));
        writeField('Data de nascimento: ', dataNascI.value);
        writeField('Telefone: ', telefoneFmt);
        writeField('E-mail: ', emailI.value);
        writeField('Endereço: ', enderecoFmt);
        writeField('Grau de instrução: ', grauI.value);
        writeField('Horário desejado: ', horarioI.value);
        writeField('Já trabalhou na empresa: ', jaTrab);
        writeField('Onde viu esta vaga: ', origem);
        y += 2;
        ensureSpace();

        writeLines('Experiências profissionais:', 2);
        const expText = (expI.value || '').trim() || '-';
        writeLines(expText);

        return doc.output('blob');
      }
    } catch (e) {
      console.warn('Erro usando jsPDF:', e);
    }

    // 2) Fallback manual (ASCII-safe) — acentos podem ser simplificados,
    // mas o PDF sai bem formatado e legível.
    console.warn('jsPDF não disponível, gerando PDF de fallback com dados do candidato.');

    const sanitize = (s) => String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // remove acentos para evitar bug de encoding
    const breakAscii = (text, placeholder = '-') =>
      breakText(sanitize(text), MAX_LINE_CHARS, placeholder);

    const pushWrappedField = (label, value) => {
      const parts = breakAscii(value);
      const first = parts.shift();
      linhas.push(label + (first || 'Nao informado'));
      parts.forEach((line) => linhas.push(line === '' ? '' : line));
    };

    const linhas = [
      'Curriculo gerado automaticamente pelo portal IBMF.',
      ''
    ];

    pushWrappedField('Nome: ', nomeI.value);
    pushWrappedField('CPF: ', digits(cpfI.value));
    pushWrappedField('Data de nascimento: ', dataNascI.value);
    pushWrappedField('Telefone: ', telefoneFmt);
    pushWrappedField('E-mail: ', emailI.value);
    pushWrappedField('Endereco: ', enderecoFmt);
    pushWrappedField('Grau de instrucao: ', grauI.value);
    pushWrappedField('Horario desejado: ', horarioI.value);
    pushWrappedField('Ja trabalhou na empresa: ', jaTrab || '');
    pushWrappedField('Origem da vaga: ', origem || '');
    linhas.push('');
    linhas.push('Experiencias profissionais:');
    breakAscii((expI.value || '').trim() || '-', '-').forEach((line) => linhas.push(line));

    const esc = (s) => String(s || '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');

    let content = 'BT\n';
    content += '/F1 11 Tf\n';
    content += '14 TL\n';
    content += '72 800 Td\n';

    linhas.forEach((linha, idx) => {
      if (idx > 0) content += 'T*\n';
      content += '(' + esc(linha) + ') Tj\n';
    });

    content += 'ET';

    const contentLength = content.length;

    let pdf = '%PDF-1.4\n';
    const offsets = [];

    function addObj(num, body) {
      offsets[num] = pdf.length;
      pdf += num + ' 0 obj\n' + body + '\nendobj\n';
    }

    addObj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    addObj(2, '<< /Type /Pages /Count 1 /Kids [3 0 R] >>');
    addObj(
      3,
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]\n' +
      '   /Resources << /Font << /F1 4 0 R >> >>\n' +
      '   /Contents 5 0 R >>'
    );
    addObj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    addObj(
      5,
      '<< /Length ' + contentLength + ' >>\nstream\n' +
      content +
      '\nendstream'
    );

    const xrefPos = pdf.length;
    pdf += 'xref\n';
    pdf += '0 6\n';
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i <= 5; i++) {
      const off = offsets[i];
      const offStr = String(off).padStart(10, '0');
      pdf += offStr + ' 00000 n \n';
    }

    pdf += 'trailer\n';
    pdf += '<< /Size 6 /Root 1 0 R >>\n';
    pdf += 'startxref\n';
    pdf += xrefPos + '\n';
    pdf += '%%EOF';

    return new Blob([pdf], { type: 'application/pdf' });
  }

  // ========= Submit =========
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clearMsg();

    if (!validate()) {
      showErr('Confira os campos obrigatórios e o hCaptcha.');
      return;
    }

    try {
      btnEnviar.disabled = true;
      btnEnviar.textContent = 'Enviando…';

      const tok = captchaToken || getCaptchaTokenFromDom();
      if (!tok) {
        showErr('Confirme o hCaptcha para prosseguir.');
        btnEnviar.disabled = false;
        btnEnviar.textContent = 'Gerar PDF & Enviar';
        return;
      }

      const pdfBlob = gerarPdfBlob();
      if (!pdfBlob) {
        showErr('Não foi possível montar o arquivo de currículo.');
        btnEnviar.disabled = false;
        btnEnviar.textContent = 'Gerar PDF & Enviar';
        return;
      }

      const jaTrab = getJaTrabalhou();
      const origem = origemVagaI.value || '';

      const fd = new FormData();
      fd.append('gerar_pdf', '1');

      fd.append('vaga_id', vagaId || vagaIdI.value || '');
      fd.append('nome', (nomeI.value || '').trim());
      fd.append('cpf', digits(cpfI.value));
      fd.append('data_nasc', (dataNascI.value || '').trim());
      fd.append('ddd', digits(dddI.value));
      fd.append('telefone', digits(telI.value));
      fd.append('email', (emailI.value || '').trim());
      fd.append('endereco', (endI.value || '').trim());
      fd.append('bairro', (bairroI.value || '').trim());
      fd.append('cidade', (cidadeI.value || '').trim());
      fd.append('grau_instrucao', (grauI.value || ''));
      fd.append('experiencias', (expI.value || '').trim());
      fd.append('horario', (horarioI.value || ''));
      fd.append('lgpd_ok', lgpdCk.checked ? '1' : '0');
      fd.append('ja_trabalhou', jaTrab || '');
      fd.append('origem', origem || '');
      fd.append('origem_vaga', origem || '');

      const what = (digits(dddI.value) ? `(${digits(dddI.value)}) ` : '') + digits(telI.value);
      if (what.trim()) fd.append('whatsapp', what.trim());

      const extras = {
        origem: 'FORM_GERAR_PDF',
        cpf: digits(cpfI.value),
        data_nasc: (dataNascI.value || '').trim(),
        endereco: (endI.value || '').trim(),
        bairro: (bairroI.value || '').trim(),
        cidade: (cidadeI.value || '').trim(),
        grau_instrucao: (grauI.value || ''),
        experiencias: (expI.value || '').trim(),
        horario: (horarioI.value || ''),
        ja_trabalhou: jaTrab || '',
        origem_vaga: origem || ''
      };
      fd.append('extras', JSON.stringify(extras));

      fd.append('captcha_token', tok);
      fd.append('curriculo', pdfBlob, 'curriculo-gerado.pdf');

      const resp = await fetch('/api/rh/candidaturas/upload', {
        method: 'POST',
        body: fd
      });

      const text = await resp.text().catch(() => '');
      if (!resp.ok) {
        console.error('Erro backend:', resp.status, text);
        throw new Error(text || 'Falha ao enviar a candidatura.');
      }

      showOk('Candidatura enviada com sucesso!');
      btnEnviar.textContent = 'Enviado ✔';

      setTimeout(() => {
        const id = vagaId || vagaIdI.value;
        if (id) {
          window.location.href = `./detalhe_vaga.html?id=${encodeURIComponent(id)}`;
        } else {
          window.location.href = './lista_vagas.html';
        }
      }, 1500);
    } catch (err) {
      console.error(err);
      showErr(err?.message || 'Erro inesperado ao enviar.');
      btnEnviar.disabled = false;
      btnEnviar.textContent = 'Gerar PDF & Enviar';
    }
  });

  // ========= Init =========
  if (vagaId) vagaIdI.value = vagaId;

  btnCancelar.addEventListener('click', () => {
    const id = vagaId || vagaIdI.value;
    if (id) {
      window.location.href = `./detalhe_vaga.html?id=${encodeURIComponent(id)}`;
    } else {
      window.location.href = './lista_vagas.html';
    }
  });

  validate();
})();
