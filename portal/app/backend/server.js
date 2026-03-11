const path = require("path");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const { createRemoteJWKSet, jwtVerify } = require("jose");

const PORT = Number(process.env.BACKEND_PORT || process.env.PORT || 7071);
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "";
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || "";
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || "";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const POSTGRES = {
  host: process.env.POSTGRES_HOST || process.env.DB_HOST || "localhost",
  port: Number(process.env.POSTGRES_PORT || process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || process.env.DB_NAME || "dwh_portal",
  user: process.env.POSTGRES_USER || process.env.DB_USER || "admin",
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || "",
};

const issuer = KEYCLOAK_URL && KEYCLOAK_REALM
  ? `${KEYCLOAK_URL.replace(/\/$/, "")}/realms/${KEYCLOAK_REALM}`
  : null;
const jwksUri = issuer ? `${issuer}/protocol/openid-connect/certs` : null;
const JWKS = jwksUri ? createRemoteJWKSet(new URL(jwksUri)) : null;

const pool = new Pool(POSTGRES);
const app = express();

app.disable("x-powered-by");
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

function unauthorized(res, message = "Unauthorized") {
  return res.status(401).json({ ok: false, error: message });
}
function forbidden(res, message = "Forbidden") {
  return res.status(403).json({ ok: false, error: message });
}
function extractRolesFromPayload(payload) {
  const roles = new Set();
  if (payload?.realm_access?.roles?.length) payload.realm_access.roles.forEach((r) => roles.add(String(r)));
  const clientRoles = payload?.resource_access?.[KEYCLOAK_CLIENT_ID]?.roles;
  if (Array.isArray(clientRoles)) clientRoles.forEach((r) => roles.add(String(r)));
  return Array.from(roles);
}
function extractCompaniesFromGroups(payload) {
  const groups = payload?.groups;
  if (!Array.isArray(groups)) return [];
  const companies = [];
  for (const g of groups) {
    const m = String(g).match(/^\/empresas\/(.+)$/i);
    if (m && m[1]) companies.push(m[1]);
  }
  return companies;
}
async function authRequired(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    const token = m ? m[1] : null;
    if (!token) return unauthorized(res, "Token ausente (Bearer).");
    if (!JWKS || !issuer) return res.status(500).json({ ok: false, error: "Keycloak/JWKS não configurado." });
    const { payload } = await jwtVerify(token, JWKS, { issuer });
    req.user = {
      sub: payload.sub,
      email: payload.email,
      preferred_username: payload.preferred_username,
      name: payload.name,
      roles: extractRolesFromPayload(payload),
      companies: extractCompaniesFromGroups(payload),
      raw: payload,
    };
    const requestedCompany = (req.headers["x-empresa-slug"] || req.headers["x-empresa"] || req.query.empresa || "").toString().trim();
    if (requestedCompany) {
      if (!req.user.companies.includes(requestedCompany)) return forbidden(res, "Você não tem acesso a esta empresa.");
      req.empresa = requestedCompany;
    } else if (req.user.companies.length === 1) {
      req.empresa = req.user.companies[0];
    } else {
      req.empresa = null;
    }
    next();
  } catch (err) {
    return unauthorized(res, `Token inválido: ${err.message}`);
  }
}
function requireRoleAny(...requiredRoles) {
  return (req, res, next) => {
    const roles = req.user?.roles || [];
    const ok = requiredRoles.some((r) => roles.includes(r));
    if (!ok) return forbidden(res, `Sem permissão. Necessário: ${requiredRoles.join(" OU ")}.`);
    next();
  };
}
function requireEmpresaSelected(req, res, next) {
  if (!req.empresa) {
    return res.status(400).json({ ok: false, error: "Empresa não selecionada. Envie o header 'X-Empresa-Slug' ou deixe o usuário com apenas 1 empresa." });
  }
  next();
}
async function q(text, params = []) { return pool.query(text, params); }

app.get("/api/public-config", (_req, res) => {
  res.json({
    ok: true,
    keycloak: { url: KEYCLOAK_URL, realm: KEYCLOAK_REALM, clientId: KEYCLOAK_CLIENT_ID },
    integrations: {
      chatwootUrl: process.env.CHATWOOT_URL || "",
      n8nUrl: process.env.N8N_URL || "",
    },
  });
});

app.get("/health", async (_req, res) => {
  try {
    const r = await pool.query("SELECT 1 as ok");
    res.json({ ok: true, db: r.rows?.[0]?.ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/me", authRequired, (req, res) => {
  res.json({ ok: true, user: { sub: req.user.sub, email: req.user.email, username: req.user.preferred_username, name: req.user.name, roles: req.user.roles, empresas: req.user.companies, empresaSelecionada: req.empresa } });
});

app.get("/api/empresas/minhas", authRequired, async (req, res, next) => {
  try {
    const slugs = req.user.companies || [];
    if (!slugs.length) return res.json([]);
    const r = await q(`SELECT slug, nome, ativo FROM public.empresas WHERE slug = ANY($1::text[]) ORDER BY nome`, [slugs]);
    const found = new Map(r.rows.map((x) => [x.slug, x]));
    res.json(slugs.map((slug) => found.get(slug) || { slug, nome: slug, ativo: true }));
  } catch (e) { next(e); }
});

app.get("/api/empresas", authRequired, requireRoleAny("portal_admin","usuarios_admin"), async (_req, res, next) => {
  try {
    const r = await q(`SELECT id, slug, nome, ativo, created_at, updated_at FROM public.empresas ORDER BY nome`);
    res.json({ ok: true, items: r.rows });
  } catch (e) { next(e); }
});
app.post("/api/empresas", authRequired, requireRoleAny("portal_admin","usuarios_admin"), async (req, res, next) => {
  try {
    const { slug, nome, ativo = true } = req.body || {};
    if (!slug || !nome) return res.status(400).json({ ok: false, error: "slug e nome são obrigatórios." });
    const s = String(slug).trim().toUpperCase().replace(/\s+/g, "_");
    const r = await q(`INSERT INTO public.empresas (slug, nome, ativo) VALUES ($1,$2,$3)
      ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome, ativo = EXCLUDED.ativo, updated_at = now()
      RETURNING id, slug, nome, ativo`, [s, String(nome), !!ativo]);
    res.json({ ok: true, item: r.rows[0] });
  } catch (e) { next(e); }
});
app.put("/api/empresas/:slug", authRequired, requireRoleAny("portal_admin","usuarios_admin"), async (req, res, next) => {
  try {
    const slug = String(req.params.slug || "").trim().toUpperCase();
    const { nome, ativo } = req.body || {};
    const r = await q(`UPDATE public.empresas SET nome = COALESCE($1, nome), ativo = COALESCE($2, ativo), updated_at = now() WHERE slug = $3 RETURNING id, slug, nome, ativo`, [nome ?? null, ativo !== undefined ? !!ativo : null, slug]);
    if (!r.rowCount) return res.status(404).json({ ok: false, error: "Empresa não encontrada" });
    res.json({ ok: true, item: r.rows[0] });
  } catch (e) { next(e); }
});

const linksRouter = express.Router();
linksRouter.get("/", authRequired, requireEmpresaSelected, async (req, res, next) => {
  try {
    const marca = (req.query.marca || "").toString().trim();
    const params = [req.empresa];
    let where = "empresa = $1";
    if (marca) { params.push(marca); where += " AND COALESCE(categoria,'') = $" + params.length; }
    const r = await q(`SELECT id, titulo, url, categoria, ordem, ativo, created_at, updated_at FROM public.links WHERE ${where} ORDER BY ordem ASC, id DESC`, params);
    res.json({ ok: true, items: r.rows });
  } catch (e) { next(e); }
});
linksRouter.get("/public", async (req, res, next) => {
  try {
    const marca = (req.query.marca || "").toString().trim();
    const params = [];
    let where = "ativo = true";
    if (marca) { params.push(marca); where += " AND COALESCE(categoria,'') = $" + params.length; }
    const r = await q(`SELECT id, titulo, url, categoria, ordem FROM public.links WHERE ${where} ORDER BY ordem ASC, id DESC`, params);
    res.json(r.rows);
  } catch (e) { next(e); }
});
linksRouter.post("/", authRequired, requireEmpresaSelected, requireRoleAny("portal_admin", "links"), async (req, res, next) => {
  try {
    const { titulo, url, categoria, ordem = 0, ativo = true } = req.body || {};
    if (!titulo || !url) return res.status(400).json({ ok: false, error: "titulo e url são obrigatórios." });
    const r = await q(`INSERT INTO public.links (empresa, titulo, url, categoria, ordem, ativo, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [req.empresa, String(titulo), String(url), categoria ? String(categoria) : null, Number(ordem) || 0, !!ativo, req.user.sub]);
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { next(e); }
});
linksRouter.put("/:id", authRequired, requireEmpresaSelected, requireRoleAny("portal_admin", "links"), async (req, res, next) => {
  try {
    const id = Number(req.params.id); if (!id) return res.status(400).json({ ok: false, error: "id inválido" });
    const { titulo, url, categoria, ordem, ativo } = req.body || {};
    await q(`UPDATE public.links SET titulo = COALESCE($1, titulo), url = COALESCE($2, url), categoria = COALESCE($3, categoria), ordem = COALESCE($4, ordem), ativo = COALESCE($5, ativo), updated_at = now() WHERE id = $6 AND empresa = $7`, [titulo ?? null, url ?? null, categoria ?? null, ordem !== undefined ? Number(ordem) : null, ativo !== undefined ? !!ativo : null, id, req.empresa]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
linksRouter.delete("/:id", authRequired, requireEmpresaSelected, requireRoleAny("portal_admin", "links"), async (req, res, next) => {
  try {
    const id = Number(req.params.id); if (!id) return res.status(400).json({ ok: false, error: "id inválido" });
    await q(`DELETE FROM public.links WHERE id = $1 AND empresa = $2`, [id, req.empresa]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.use("/api/links", linksRouter);

const vagasRouter = express.Router();
vagasRouter.get("/", authRequired, requireEmpresaSelected, async (req, res, next) => {
  try {
    const r = await q(`SELECT id, titulo, setor, cidade, tipo, descricao, status, created_at, updated_at FROM public.vagas WHERE empresa = $1 ORDER BY id DESC`, [req.empresa]);
    res.json({ ok: true, items: r.rows });
  } catch (e) { next(e); }
});
vagasRouter.post("/", authRequired, requireEmpresaSelected, requireRoleAny("portal_admin", "vagas"), async (req, res, next) => {
  try {
    const { titulo, setor, cidade, tipo, descricao, status = "aberta" } = req.body || {};
    if (!titulo) return res.status(400).json({ ok: false, error: "titulo é obrigatório." });
    const r = await q(`INSERT INTO public.vagas (empresa, titulo, setor, cidade, tipo, descricao, status, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [req.empresa, String(titulo), setor || null, cidade || null, tipo || null, descricao || null, String(status), req.user.sub]);
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { next(e); }
});
vagasRouter.put("/:id", authRequired, requireEmpresaSelected, requireRoleAny("portal_admin", "vagas"), async (req, res, next) => {
  try {
    const id = Number(req.params.id); if (!id) return res.status(400).json({ ok: false, error: "id inválido" });
    const { titulo, setor, cidade, tipo, descricao, status } = req.body || {};
    await q(`UPDATE public.vagas SET titulo = COALESCE($1, titulo), setor = COALESCE($2, setor), cidade = COALESCE($3, cidade), tipo = COALESCE($4, tipo), descricao = COALESCE($5, descricao), status = COALESCE($6, status), updated_at = now() WHERE id = $7 AND empresa = $8`, [titulo ?? null, setor ?? null, cidade ?? null, tipo ?? null, descricao ?? null, status ?? null, id, req.empresa]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
vagasRouter.delete("/:id", authRequired, requireEmpresaSelected, requireRoleAny("portal_admin", "vagas"), async (req, res, next) => {
  try {
    const id = Number(req.params.id); if (!id) return res.status(400).json({ ok: false, error: "id inválido" });
    await q(`DELETE FROM public.vagas WHERE id = $1 AND empresa = $2`, [id, req.empresa]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.use("/api/vagas", vagasRouter);


const rhRouter = express.Router();

rhRouter.get("/vagas", authRequired, requireEmpresaSelected, async (req, res, next) => {
  try {
    const ativas = String(req.query.ativas || "") === "1";
    const r = await q(`
      SELECT id, titulo, lead, descricao, local_trabalho, linha, vinculo, modalidade, pcd,
             inscricoes_ate, responsabilidades, requisitos, informacoes, etapas, links, ativa,
             created_at AS criada_em, updated_at AS atualizada_em, publicada_em
      FROM public.vagas
      WHERE empresa = $1
        AND ($2::boolean = FALSE OR ativa = TRUE)
      ORDER BY id DESC
    `, [req.empresa, ativas]);
    res.json(r.rows);
  } catch (e) { next(e); }
});

rhRouter.post("/vagas", authRequired, requireEmpresaSelected, requireRoleAny("portal_admin", "vagas"), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.titulo) return res.status(400).json({ ok: false, error: "titulo é obrigatório." });
    const r = await q(`
      INSERT INTO public.vagas (
        empresa, titulo, lead, descricao, local_trabalho, linha, vinculo, modalidade, pcd, inscricoes_ate,
        responsabilidades, requisitos, informacoes, etapas, links, ativa, status, setor, cidade, tipo, created_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,COALESCE($16, TRUE),COALESCE($17, 'aberta'),$18,$19,$20,$21
      ) RETURNING id
    `, [
      req.empresa, String(b.titulo), b.lead || null, b.descricao || null, b.local_trabalho || null, b.linha || null, b.vinculo || null,
      b.modalidade || null, !!b.pcd, b.inscricoes_ate || null, b.responsabilidades || null, b.requisitos || null, b.informacoes || null,
      b.etapas || null, b.links ? JSON.stringify(b.links) : null, b.ativa, b.status || null, b.setor || null, b.cidade || null, b.tipo || null,
      req.user.sub
    ]);
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { next(e); }
});

rhRouter.put("/vagas/:id", authRequired, requireEmpresaSelected, requireRoleAny("portal_admin", "vagas"), async (req, res, next) => {
  try {
    const id = Number(req.params.id); if (!id) return res.status(400).json({ ok: false, error: "id inválido" });
    const b = req.body || {};
    await q(`
      UPDATE public.vagas
      SET titulo = COALESCE($1, titulo),
          lead = COALESCE($2, lead),
          descricao = COALESCE($3, descricao),
          local_trabalho = COALESCE($4, local_trabalho),
          linha = COALESCE($5, linha),
          vinculo = COALESCE($6, vinculo),
          modalidade = COALESCE($7, modalidade),
          pcd = COALESCE($8, pcd),
          inscricoes_ate = COALESCE($9, inscricoes_ate),
          responsabilidades = COALESCE($10, responsabilidades),
          requisitos = COALESCE($11, requisitos),
          informacoes = COALESCE($12, informacoes),
          etapas = COALESCE($13, etapas),
          links = COALESCE($14::jsonb, links),
          ativa = COALESCE($15, ativa),
          status = COALESCE($16, status),
          updated_at = now()
      WHERE id = $17 AND empresa = $18
    `, [
      b.titulo ?? null, b.lead ?? null, b.descricao ?? null, b.local_trabalho ?? null, b.linha ?? null, b.vinculo ?? null, b.modalidade ?? null,
      b.pcd !== undefined ? !!b.pcd : null, b.inscricoes_ate ?? null, b.responsabilidades ?? null, b.requisitos ?? null, b.informacoes ?? null,
      b.etapas ?? null, b.links !== undefined ? JSON.stringify(b.links) : null, b.ativa !== undefined ? !!b.ativa : null, b.status ?? null, id, req.empresa
    ]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

rhRouter.delete("/vagas/:id", authRequired, requireEmpresaSelected, requireRoleAny("portal_admin", "vagas"), async (req, res, next) => {
  try {
    const id = Number(req.params.id); if (!id) return res.status(400).json({ ok: false, error: "id inválido" });
    await q(`DELETE FROM public.vagas WHERE id = $1 AND empresa = $2`, [id, req.empresa]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

rhRouter.get("/vagas-publicas", async (req, res, next) => {
  try {
    const qText = String(req.query.q || "").trim();
    const linha = String(req.query.linha || "").trim().toUpperCase();
    const params = [];
    let where = `WHERE ativa = TRUE`;
    if (qText) {
      params.push(`%${qText}%`);
      where += ` AND (titulo ILIKE $${params.length} OR descricao ILIKE $${params.length})`;
    }
    if (linha) {
      params.push(linha);
      where += ` AND UPPER(COALESCE(linha, '')) LIKE '%' || $${params.length} || '%'`;
    }
    const r = await q(`
      SELECT id, titulo, lead, descricao, local_trabalho, linha, vinculo, modalidade, pcd, inscricoes_ate,
             responsabilidades, requisitos, informacoes, etapas, links, publicada_em, created_at AS criada_em, updated_at AS atualizada_em
      FROM public.vagas ${where}
      ORDER BY publicada_em DESC, id DESC
    `, params);
    res.json(r.rows);
  } catch (e) { next(e); }
});

rhRouter.get("/vagas-publicas/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id); if (!id) return res.status(400).json({ ok: false, error: "id inválido" });
    const r = await q(`
      SELECT id, titulo, lead, descricao, local_trabalho, linha, vinculo, modalidade, pcd, inscricoes_ate,
             responsabilidades, requisitos, informacoes, etapas, links, publicada_em, created_at AS criada_em, updated_at AS atualizada_em
      FROM public.vagas
      WHERE id = $1 AND ativa = TRUE
      LIMIT 1
    `, [id]);
    if (!r.rowCount) return res.status(404).json({ ok: false, error: "Vaga não encontrada" });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

rhRouter.get("/site-config", authRequired, requireEmpresaSelected, async (req, res, next) => {
  try {
    const r = await q(`SELECT etapas_padrao, sobre_ibmf FROM public.rh_site_config WHERE empresa = $1 LIMIT 1`, [req.empresa]);
    res.json(r.rows[0] || { etapas_padrao: "", sobre_ibmf: "" });
  } catch (e) { next(e); }
});

rhRouter.put("/site-config", authRequired, requireEmpresaSelected, requireRoleAny("portal_admin", "vagas"), async (req, res, next) => {
  try {
    const { etapas_padrao = "", sobre_ibmf = "" } = req.body || {};
    await q(`
      INSERT INTO public.rh_site_config (empresa, etapas_padrao, sobre_ibmf, updated_by, updated_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (empresa) DO UPDATE
      SET etapas_padrao = EXCLUDED.etapas_padrao,
          sobre_ibmf = EXCLUDED.sobre_ibmf,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
    `, [req.empresa, etapas_padrao, sobre_ibmf, req.user.sub]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

rhRouter.get("/vagas-config", authRequired, requireEmpresaSelected, async (req, res, next) => {
  try {
    const r = await q(`SELECT etapas_padrao, sobre_ibmf FROM public.rh_site_config WHERE empresa = $1 LIMIT 1`, [req.empresa]);
    res.json(r.rows[0] || { etapas_padrao: "", sobre_ibmf: "" });
  } catch (e) { next(e); }
});

rhRouter.put("/vagas-config", authRequired, requireEmpresaSelected, requireRoleAny("portal_admin", "vagas"), async (req, res, next) => {
  try {
    const { etapas_padrao = "", sobre_ibmf = "" } = req.body || {};
    await q(`
      INSERT INTO public.rh_site_config (empresa, etapas_padrao, sobre_ibmf, updated_by, updated_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (empresa) DO UPDATE
      SET etapas_padrao = EXCLUDED.etapas_padrao,
          sobre_ibmf = EXCLUDED.sobre_ibmf,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
    `, [req.empresa, etapas_padrao, sobre_ibmf, req.user.sub]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

rhRouter.get("/site-config-public", async (req, res, next) => {
  try {
    const empresa = (req.query.empresa || "ARDAN").toString();
    const r = await q(`SELECT etapas_padrao, sobre_ibmf FROM public.rh_site_config WHERE empresa = $1 LIMIT 1`, [empresa]);
    res.json(r.rows[0] || { etapas_padrao: "", sobre_ibmf: "" });
  } catch (e) { next(e); }
});

app.use("/api/rh", rhRouter);

const contratosRouter = express.Router();
contratosRouter.get("/", authRequired, requireEmpresaSelected, async (req, res, next) => {
  try {
    const r = await q(`SELECT id, numero, cliente, descricao, status, data_inicio, data_fim, valor, created_at, updated_at FROM public.contratos WHERE empresa = $1 ORDER BY id DESC`, [req.empresa]);
    res.json({ ok: true, items: r.rows });
  } catch (e) { next(e); }
});
contratosRouter.post("/", authRequired, requireEmpresaSelected, requireRoleAny("portal_admin", "contratos"), async (req, res, next) => {
  try {
    const { numero, cliente, descricao, status = "ativo", data_inicio, data_fim, valor } = req.body || {};
    if (!numero) return res.status(400).json({ ok: false, error: "numero é obrigatório." });
    const r = await q(`INSERT INTO public.contratos (empresa, numero, cliente, descricao, status, data_inicio, data_fim, valor, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [req.empresa, String(numero), cliente || null, descricao || null, String(status), data_inicio || null, data_fim || null, valor != null ? Number(valor) : null, req.user.sub]);
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { next(e); }
});
contratosRouter.put("/:id", authRequired, requireEmpresaSelected, requireRoleAny("portal_admin", "contratos"), async (req, res, next) => {
  try {
    const id = Number(req.params.id); if (!id) return res.status(400).json({ ok: false, error: "id inválido" });
    const { numero, cliente, descricao, status, data_inicio, data_fim, valor } = req.body || {};
    await q(`UPDATE public.contratos SET numero = COALESCE($1, numero), cliente = COALESCE($2, cliente), descricao = COALESCE($3, descricao), status = COALESCE($4, status), data_inicio = COALESCE($5, data_inicio), data_fim = COALESCE($6, data_fim), valor = COALESCE($7, valor), updated_at = now() WHERE id = $8 AND empresa = $9`, [numero ?? null, cliente ?? null, descricao ?? null, status ?? null, data_inicio ?? null, data_fim ?? null, valor !== undefined ? Number(valor) : null, id, req.empresa]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
contratosRouter.delete("/:id", authRequired, requireEmpresaSelected, requireRoleAny("portal_admin", "contratos"), async (req, res, next) => {
  try {
    const id = Number(req.params.id); if (!id) return res.status(400).json({ ok: false, error: "id inválido" });
    await q(`DELETE FROM public.contratos WHERE id = $1 AND empresa = $2`, [id, req.empresa]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.use("/api/contratos", contratosRouter);

const projetosRouter = express.Router();
projetosRouter.get("/modelos", authRequired, async (_req, res) => res.json([]));
projetosRouter.get("/setores", authRequired, async (_req, res) => res.json([]));
projetosRouter.get("/setores/me", authRequired, async (_req, res) => res.json([]));
projetosRouter.get("/usuarios", authRequired, async (_req, res) => res.json([]));
projetosRouter.get("/tarefas-modelos", authRequired, async (_req, res) => res.json([]));
projetosRouter.get("/aprovacoes", authRequired, async (_req, res) => res.json({ items: [] }));
projetosRouter.get("/", authRequired, requireEmpresaSelected, async (req, res, next) => {
  try {
    const r = await q(`SELECT id, titulo, descricao, status, setor, prioridade, created_at, updated_at FROM public.projetos WHERE empresa = $1 ORDER BY id DESC`, [req.empresa]);
    res.json({ ok: true, items: r.rows });
  } catch (e) { next(e); }
});
projetosRouter.post("/", authRequired, requireEmpresaSelected, requireRoleAny("portal_admin", "projetos", "projetos_admin"), async (req, res, next) => {
  try {
    const { titulo, descricao, status = "triagem", setor, prioridade = 0 } = req.body || {};
    if (!titulo) return res.status(400).json({ ok: false, error: "titulo é obrigatório." });
    const r = await q(`INSERT INTO public.projetos (empresa, titulo, descricao, status, setor, prioridade, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [req.empresa, String(titulo), descricao || null, String(status), setor || null, Number(prioridade) || 0, req.user.sub]);
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { next(e); }
});
projetosRouter.get("/:id", authRequired, requireEmpresaSelected, async (req, res, next) => {
  try {
    const id = Number(req.params.id); if (!id) return res.status(400).json({ ok: false, error: "id inválido" });
    const r = await q(`SELECT * FROM public.projetos WHERE id = $1 AND empresa = $2`, [id, req.empresa]);
    if (!r.rowCount) return res.status(404).json({ ok: false, error: "Projeto não encontrado" });
    res.json({ ok: true, item: r.rows[0] });
  } catch (e) { next(e); }
});
projetosRouter.put("/:id", authRequired, requireEmpresaSelected, requireRoleAny("portal_admin", "projetos", "projetos_admin"), async (req, res, next) => {
  try {
    const id = Number(req.params.id); if (!id) return res.status(400).json({ ok: false, error: "id inválido" });
    const { titulo, descricao, status, setor, prioridade } = req.body || {};
    await q(`UPDATE public.projetos SET titulo = COALESCE($1, titulo), descricao = COALESCE($2, descricao), status = COALESCE($3, status), setor = COALESCE($4, setor), prioridade = COALESCE($5, prioridade), updated_at = now() WHERE id = $6 AND empresa = $7`, [titulo ?? null, descricao ?? null, status ?? null, setor ?? null, prioridade !== undefined ? Number(prioridade) : null, id, req.empresa]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
projetosRouter.delete("/:id", authRequired, requireEmpresaSelected, requireRoleAny("portal_admin", "projetos", "projetos_admin"), async (req, res, next) => {
  try {
    const id = Number(req.params.id); if (!id) return res.status(400).json({ ok: false, error: "id inválido" });
    await q(`DELETE FROM public.projetos WHERE id = $1 AND empresa = $2`, [id, req.empresa]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.use("/api/projetos", projetosRouter);

const usuariosRouter = express.Router();
usuariosRouter.get("/", authRequired, requireRoleAny("portal_admin", "usuarios_admin"), (_req, res) => {
  res.json({ ok: true, items: [] });
});
usuariosRouter.post("/", authRequired, requireRoleAny("portal_admin", "usuarios_admin"), (_req, res) => {
  res.json({ ok: true, message: "Usuários são gerenciados no Keycloak." });
});
usuariosRouter.get("/me", authRequired, (req, res) => {
  res.json({ ok: true, user: { sub: req.user.sub, email: req.user.email, username: req.user.preferred_username, name: req.user.name, roles: req.user.roles, empresas: req.user.companies } });
});
usuariosRouter.get("/permissoes", authRequired, (req, res) => {
  res.json({ ok: true, permissoes: {
    portal_admin: req.user.roles.includes("portal_admin"),
    projetos: req.user.roles.includes("portal_admin") || req.user.roles.includes("projetos") || req.user.roles.includes("projetos_admin"),
    projetos_admin: req.user.roles.includes("portal_admin") || req.user.roles.includes("projetos_admin"),
    contratos: req.user.roles.includes("portal_admin") || req.user.roles.includes("contratos"),
    links: req.user.roles.includes("portal_admin") || req.user.roles.includes("links"),
    vagas: req.user.roles.includes("portal_admin") || req.user.roles.includes("vagas"),
    usuarios_admin: req.user.roles.includes("portal_admin") || req.user.roles.includes("usuarios_admin"),
  }});
});
app.use("/api/usuarios", usuariosRouter);

const frontPublic = path.join(__dirname, "public");
app.use(express.static(frontPublic));
app.get("/", (_req, res) => {
  res.redirect("/home.html");
});

app.use((err, _req, res, _next) => {
  console.error("[portal] erro:", err);
  res.status(500).json({ ok: false, error: err.message || "Erro interno" });
});

async function main() {
  await pool.query("SELECT 1");
  app.listen(PORT, () => {
    console.log(`[portal] API rodando na porta ${PORT}`);
    if (jwksUri) console.log(`[portal] Keycloak JWKS: ${jwksUri}`);
  });
}

main().catch((err) => {
  console.error("[portal] Falha ao iniciar:", err);
  process.exit(1);
});
