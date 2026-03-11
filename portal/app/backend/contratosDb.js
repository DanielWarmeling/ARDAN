// backend/contratosDb.js
// Segundo repositório (externo ao DWH) dedicado aos arquivos de contratos.
// Mantém configuração independente para permitir isolamento físico.
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.CONTRATOS_DB_HOST     || process.env.DWH_HOST,
  port:     process.env.CONTRATOS_DB_PORT     || process.env.DWH_PORT || 5432,
  user:     process.env.CONTRATOS_DB_USER     || process.env.DWH_USER,
  password: process.env.CONTRATOS_DB_PASSWORD || process.env.DWH_PASSWORD,
  database: process.env.CONTRATOS_DB_NAME     || process.env.DWH_NAME,
  ssl:      process.env.CONTRATOS_DB_SSL === 'true'
});

module.exports = pool;
