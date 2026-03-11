// public/js/config.js
(function () {
  // Se já definiram window.API_BASE_URL antes, respeita.
  // Senão usa a origem atual (http://host:porta onde o HTML está sendo servido).
  const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/+$/, '');

  // Expõe como global
  window.API_BASE_URL  = base;
  window.NOME_EMPRESA  = window.NOME_EMPRESA || 'Portal SaaS';

  // Persiste o nome
  try { localStorage.setItem('IBMF', window.NOME_EMPRESA); } catch (_) {}
})();
