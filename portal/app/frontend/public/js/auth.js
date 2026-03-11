// /js/auth.js (OIDC PKCE sem keycloak.js)
(function () {
  const LS_TOKEN = 'token';
  const LS_REFRESH = 'refresh_token';
  const LS_ID_TOKEN = 'id_token';
  const LS_EMPRESA = 'empresa_slug';
  const LS_REDIRECT = 'post_login_redirect';
  const LS_PKCE_VERIFIER = 'pkce_verifier';
  const LS_PKCE_STATE = 'pkce_state';
  const LS_PKCE_METHOD = 'pkce_method';
  const LOGIN_CALLBACK_PATH = '/login.html';

  let publicCfg = null;

  function b64urlEncode(bytes) {
    const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function b64urlDecode(seg) {
    seg = String(seg || '').replace(/-/g, '+').replace(/_/g, '/');
    while (seg.length % 4) seg += '=';
    return atob(seg);
  }

  function parseJwt(token) {
    try {
      const [, payload] = String(token).split('.');
      return payload ? JSON.parse(b64urlDecode(payload)) : {};
    } catch {
      return {};
    }
  }

  function tokenExpired(token) {
    const p = parseJwt(token);
    if (!p || !p.exp) return true;
    return Date.now() >= (p.exp * 1000) - 10000;
  }

  function randomString(len = 64) {
    const bytes = new Uint8Array(len);
    const c = window.crypto || window.msCrypto;
    if (!c || !c.getRandomValues) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
      let s = '';
      for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
      return s;
    }
    c.getRandomValues(bytes);
    return b64urlEncode(bytes).slice(0, len);
  }

  function pkceS256Available() {
    const c = window.crypto || window.msCrypto;
    return !!(c && c.subtle && window.TextEncoder);
  }

  async function sha256Base64Url(input) {
    const c = window.crypto || window.msCrypto;
    if (!c || !c.subtle) throw new Error('PKCE S256 indisponível neste navegador/origem');
    const data = new TextEncoder().encode(input);
    const digest = await c.subtle.digest('SHA-256', data);
    return b64urlEncode(new Uint8Array(digest));
  }

  async function getPublicConfig() {
    if (publicCfg) return publicCfg;
    const res = await fetch(`${window.API_BASE_URL}/api/public-config`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Não foi possível ler /api/public-config');
    publicCfg = await res.json();
    return publicCfg;
  }

  async function getOidcConfig() {
    const cfg = await getPublicConfig();
    if (!cfg.keycloak || !cfg.keycloak.url || !cfg.keycloak.realm || !cfg.keycloak.clientId) {
      throw new Error('Config do Keycloak incompleta. Verifique variáveis do backend.');
    }
    const base = String(cfg.keycloak.url).replace(/\/+$/, '');
    const issuer = `${base}/realms/${cfg.keycloak.realm}`;
    return {
      base,
      issuer,
      clientId: cfg.keycloak.clientId,
      authorizationEndpoint: `${issuer}/protocol/openid-connect/auth`,
      tokenEndpoint: `${issuer}/protocol/openid-connect/token`,
      logoutEndpoint: `${issuer}/protocol/openid-connect/logout`,
    };
  }

  async function exchangeCodeForTokens(code, verifier, redirectUri) {
    const oidc = await getOidcConfig();
    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('client_id', oidc.clientId);
    body.set('code', code);
    body.set('redirect_uri', redirectUri);
    body.set('code_verifier', verifier);

    const res = await fetch(oidc.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error_description || data.error || 'Falha ao trocar code por token');
    }
    localStorage.setItem(LS_TOKEN, data.access_token || '');
    if (data.refresh_token) localStorage.setItem(LS_REFRESH, data.refresh_token);
    if (data.id_token) localStorage.setItem(LS_ID_TOKEN, data.id_token);
    localStorage.removeItem(LS_PKCE_VERIFIER);
    localStorage.removeItem(LS_PKCE_STATE);
    localStorage.removeItem(LS_PKCE_METHOD);
    return data;
  }

  async function refreshTokens() {
    const refreshToken = localStorage.getItem(LS_REFRESH) || '';
    if (!refreshToken) throw new Error('Sem refresh token');
    const oidc = await getOidcConfig();
    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('client_id', oidc.clientId);
    body.set('refresh_token', refreshToken);

    const res = await fetch(oidc.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error_description || data.error || 'Falha ao renovar token');
    }
    localStorage.setItem(LS_TOKEN, data.access_token || '');
    if (data.refresh_token) localStorage.setItem(LS_REFRESH, data.refresh_token);
    if (data.id_token) localStorage.setItem(LS_ID_TOKEN, data.id_token);
    return data;
  }

  async function login() {
    const oidc = await getOidcConfig();
    const verifier = randomString(96);
    const state = randomString(24);
    const redirectUri = `${window.location.origin}${LOGIN_CALLBACK_PATH}`;

    let challenge;
    let method;
    if (pkceS256Available()) {
      challenge = await sha256Base64Url(verifier);
      method = 'S256';
    } else {
      challenge = verifier;
      method = 'plain';
      console.warn('PKCE S256 indisponível neste contexto (HTTP/IP). Usando fallback plain para teste.');
    }

    localStorage.setItem(LS_PKCE_VERIFIER, verifier);
    localStorage.setItem(LS_PKCE_STATE, state);
    localStorage.setItem(LS_PKCE_METHOD, method);
    localStorage.setItem(LS_REDIRECT, window.location.pathname + window.location.search + window.location.hash);

    const url = new URL(oidc.authorizationEndpoint);
    url.searchParams.set('client_id', oidc.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', method);

    window.location.href = url.toString();
  }

  async function handleLoginCallback() {
    if (window.location.pathname !== LOGIN_CALLBACK_PATH) return false;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const expectedState = localStorage.getItem(LS_PKCE_STATE);
    const verifier = localStorage.getItem(LS_PKCE_VERIFIER);

    if (!code) return false;
    if (!state || !expectedState || state !== expectedState) {
      throw new Error('State inválido no retorno do Keycloak');
    }
    if (!verifier) {
      throw new Error('Code verifier ausente');
    }

    await exchangeCodeForTokens(code, verifier, `${window.location.origin}${LOGIN_CALLBACK_PATH}`);
    const dest = localStorage.getItem(LS_REDIRECT) || '/home.html';
    localStorage.removeItem(LS_REDIRECT);
    window.location.replace(dest === LOGIN_CALLBACK_PATH ? '/home.html' : dest);
    return true;
  }

  function getEmpresaAtivaSlug() {
    return (localStorage.getItem(LS_EMPRESA) || '').trim();
  }
  function setEmpresaAtivaSlug(slug) {
    if (!slug) localStorage.removeItem(LS_EMPRESA);
    else localStorage.setItem(LS_EMPRESA, String(slug).trim());
  }
  function getToken() {
    return localStorage.getItem(LS_TOKEN) || '';
  }
  function getUser() {
    const p = parseJwt(getToken());
    return {
      sub: p.sub || null,
      email: p.email || null,
      username: p.preferred_username || p.username || null,
      name: p.name || p.given_name || null,
      groups: p.groups || [],
      raw: p,
    };
  }
  function extractRoles(payload) {
    const roles = new Set();

    const rr = payload?.realm_access?.roles;
    if (Array.isArray(rr)) {
      rr.forEach((r) => roles.add(String(r)));
    }

    const resourceAccess = payload?.resource_access || {};
    const possibleClientIds = [
      publicCfg?.keycloak?.clientId,
      'portal-web',
      'portal',
      'portal-web-prod',
    ].filter(Boolean);

    for (const clientId of possibleClientIds) {
      const clientRoles = resourceAccess?.[clientId]?.roles;
      if (Array.isArray(clientRoles)) {
        clientRoles.forEach((r) => roles.add(String(r)));
      }
    }

    for (const clientName of Object.keys(resourceAccess)) {
      const clientRoles = resourceAccess?.[clientName]?.roles;
      if (Array.isArray(clientRoles)) {
        clientRoles.forEach((r) => roles.add(String(r)));
      }
    }

    return roles;
  }
  function hasRole(role) {
    const p = parseJwt(getToken());
    const roles = extractRoles(p);
    const wanted = String(role || '').trim();
    return roles.has(wanted) || roles.has('portal_admin');
  }

  async function ensureFreshToken() {
    const t = getToken();
    if (!t) return false;
    if (!tokenExpired(t)) return true;
    try {
      await refreshTokens();
      return true;
    } catch {
      localStorage.removeItem(LS_TOKEN);
      localStorage.removeItem(LS_REFRESH);
      localStorage.removeItem(LS_ID_TOKEN);
      return false;
    }
  }

  async function requireAuth() {
    if (await handleLoginCallback()) return;
    const ok = await ensureFreshToken();
    if (!ok) {
      await login();
      return;
    }
    try {
      const r = await Auth.fetch(`${window.API_BASE_URL}/api/me`);
      if (!r.ok) throw new Error('Sessão inválida');
    } catch (e) {
      console.warn('Falha ao validar sessão, relogando…', e);
      localStorage.removeItem(LS_TOKEN);
      localStorage.removeItem(LS_REFRESH);
      localStorage.removeItem(LS_ID_TOKEN);
      await login();
    }
  }

  async function logout() {
    const oidc = await getOidcConfig();
    const idToken = localStorage.getItem(LS_ID_TOKEN) || '';
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_REFRESH);
    localStorage.removeItem(LS_ID_TOKEN);
    localStorage.removeItem(LS_EMPRESA);
    localStorage.removeItem(LS_PKCE_VERIFIER);
    localStorage.removeItem(LS_PKCE_STATE);
    localStorage.removeItem(LS_PKCE_METHOD);
    const logoutUrl = new URL(oidc.logoutEndpoint);
    logoutUrl.searchParams.set('post_logout_redirect_uri', `${window.location.origin}/home.html`);
    logoutUrl.searchParams.set('client_id', oidc.clientId);
    if (idToken) logoutUrl.searchParams.set('id_token_hint', idToken);
    window.location.href = logoutUrl.toString();
  }

  async function ensureEmpresaAtiva() {
    const current = getEmpresaAtivaSlug();
    if (current) return current;

    const token = getToken();
    if (!token) return '';

    try {
      const res = await fetch(`${window.API_BASE_URL}/api/empresas/minhas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => []);
      const first = Array.isArray(data) && data.length ? String(data[0].slug || '').trim() : '';
      if (first) setEmpresaAtivaSlug(first);
      return first;
    } catch {
      return '';
    }
  }

  async function authFetch(url, opts = {}) {
    await ensureFreshToken();
    const token = getToken();
    const headers = new Headers(opts.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const slug = await ensureEmpresaAtiva();
    if (slug) headers.set('X-Empresa-Slug', slug);
    return fetch(url, { ...opts, headers });
  }

  async function fetchJSON(url, opts = {}) {
    const res = await authFetch(url, opts);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.error || data?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data?.items ?? data;
  }


  let moduloPermsCache = null;
  async function getPermissoes() {
    if (moduloPermsCache) return moduloPermsCache;
    const r = await authFetch(`${window.API_BASE_URL}/api/usuarios/permissoes`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    moduloPermsCache = data?.permissoes || {};
    return moduloPermsCache;
  }

  async function hasModuleAccess(modulo) {
    const wanted = String(modulo || '').trim();
    if (!wanted) return false;
    const fromRole = hasRole(wanted) || hasRole('portal_admin');
    if (fromRole) return true;
    try {
      const perms = await getPermissoes();
      return !!perms[wanted] || !!perms.portal_admin;
    } catch {
      return false;
    }
  }

  async function guardModuleAccess(modulo, redirect = '/home.html') {
    const ok = await hasModuleAccess(modulo);
    if (!ok) {
      alert('Você não tem permissão para acessar esta página.');
      window.location.href = redirect;
      return false;
    }
    return true;
  }
  window.Auth = {
    getPublicConfig,
    requireAuth,
    login,
    logout,
    getToken,
    getUser,
    getEmpresaAtivaSlug,
    setEmpresaAtivaSlug,
    hasRole,
    getPermissoes,
    hasModuleAccess,
    guardModuleAccess,
    fetch: authFetch,
    fetchJSON,
  };

  // Compatibilidade com telas legadas
  window.checkAuth = requireAuth;
  window.fetchAuth = authFetch;
})();
