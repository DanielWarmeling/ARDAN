// backend/db/migrate.js
// Runner simples de migrations SQL (PostgreSQL)
// - Aplica apenas o que falta (idempotente por arquivo)
// - Não dá reset automático (seguro para produção)

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function getPool() {
  return new Pool({
    host: process.env.POSTGRES_HOST || process.env.DB_HOST || process.env.PGHOST || 'postgres',
    port: Number(process.env.POSTGRES_PORT || process.env.DB_PORT || process.env.PGPORT || 5432),
    database: process.env.POSTGRES_DB || process.env.DB_NAME || process.env.PGDATABASE,
    user: process.env.POSTGRES_USER || process.env.DB_USER || process.env.PGUSER,
    password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || process.env.PGPASSWORD,
  });
}

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

function listSqlFiles() {
  const dir = path.join(__dirname, 'migrations');
  return fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
}

async function applyFile(pool, filename) {
  const full = path.join(__dirname, 'migrations', filename);
  const sql = fs.readFileSync(full, 'utf8');

  await pool.query('BEGIN');
  try {
    await pool.query(sql);
    await pool.query(
      `INSERT INTO public.schema_migrations (filename) VALUES ($1)`,
      [filename]
    );
    await pool.query('COMMIT');
    console.log(`[migrate] applied ${filename}`);
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error(`[migrate] failed ${filename}`);
    throw err;
  }
}

async function runMigrations() {
  const pool = getPool();
  try {
    await ensureMigrationsTable(pool);

    const files = listSqlFiles();
    for (const f of files) {
      const r = await pool.query(
        `SELECT 1 FROM public.schema_migrations WHERE filename = $1`,
        [f]
      );
      if (r.rowCount) {
        // já aplicado
        continue;
      }
      await applyFile(pool, f);
    }
  } finally {
    await pool.end();
  }
}

module.exports = { runMigrations };

// Permite rodar via CLI: node backend/db/migrate.js
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('[migrate] done');
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
