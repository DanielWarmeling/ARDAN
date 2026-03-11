const pool = require('../db');

async function resolveModeloId(db, modeloId) {
  if (modeloId) return modeloId;
  const r = await db.query(`
    SELECT id
      FROM public.projetos_modelos
     WHERE ativo = true
     ORDER BY id
     LIMIT 1
  `);
  return r.rowCount ? r.rows[0].id : null;
}

async function carregarModelo(db, modeloId) {
  const modelo = await db.query(
    `SELECT * FROM public.projetos_modelos WHERE id = $1 AND ativo = true`,
    [modeloId]
  );
  if (modelo.rowCount === 0) return null;

  const colunas = await db.query(
    `
      SELECT *
        FROM public.projetos_modelos_colunas
       WHERE projeto_modelo_id = $1
         AND ativo = true
       ORDER BY ordem, id
    `,
    [modeloId]
  );

  return { modelo: modelo.rows[0], colunas: colunas.rows };
}

async function migrarProjetosExistentes({ modeloId } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const resolvedModeloId = await resolveModeloId(client, modeloId);
    if (!resolvedModeloId) {
      throw new Error('Nenhum modelo ativo disponível para migração.');
    }

    const dadosModelo = await carregarModelo(client, resolvedModeloId);
    if (!dadosModelo || dadosModelo.colunas.length === 0) {
      throw new Error('Modelo inválido ou sem colunas ativas.');
    }

    const rProjetos = await client.query(`
      SELECT p.id, p.snapshot_modelo_json
        FROM public.projetos p
       WHERE NOT EXISTS (
         SELECT 1 FROM public.projeto_colunas pc WHERE pc.projeto_id = p.id
       )
       ORDER BY p.id
    `);

    for (const projeto of rProjetos.rows) {
      const rCols = await client.query(`
        INSERT INTO public.projeto_colunas
          (projeto_id, nome, ordem, setor_id, requer_aprovacao, modelo_tarefa_padrao_id, ativo)
        SELECT $1, nome, ordem, setor_id, requer_aprovacao, modelo_tarefa_padrao_id, true
          FROM public.projetos_modelos_colunas
         WHERE projeto_modelo_id = $2
           AND ativo = true
         ORDER BY ordem, id
        RETURNING *
      `, [projeto.id, dadosModelo.modelo.id]);

      const colunasInseridas = rCols.rows;
      const colunaInicial = colunasInseridas.reduce((acc, col) => {
        if (!acc) return col;
        if (col.ordem < acc.ordem) return col;
        if (col.ordem === acc.ordem && col.id < acc.id) return col;
        return acc;
      }, null);

      const snapshotModelo = {
        id: dadosModelo.modelo.id,
        nome: dadosModelo.modelo.nome,
        descricao: dadosModelo.modelo.descricao,
        campos_base_json: dadosModelo.modelo.campos_base_json || {},
        colunas: dadosModelo.colunas.map((c) => ({
          id: c.id,
          nome: c.nome,
          ordem: c.ordem,
          setor_id: c.setor_id,
          requer_aprovacao: c.requer_aprovacao,
          modelo_tarefa_padrao_id: c.modelo_tarefa_padrao_id
        }))
      };

      await client.query(`
        UPDATE public.projetos
           SET snapshot_modelo_json = $2,
               modelo_id = COALESCE(modelo_id, $3),
               campos_base_json = COALESCE(campos_base_json, '{}'::jsonb)
         WHERE id = $1
      `, [projeto.id, JSON.stringify(snapshotModelo), dadosModelo.modelo.id]);

      if (colunaInicial) {
        await client.query(`
          INSERT INTO public.projeto_aprovacoes
            (projeto_id, projeto_coluna_id, setor_id, status)
          SELECT $1, $2, $3, 'PENDENTE'
           WHERE NOT EXISTS (
             SELECT 1 FROM public.projeto_aprovacoes pa
              WHERE pa.projeto_id = $1
           )
        `, [projeto.id, colunaInicial.id, colunaInicial.setor_id || null]);
      }

      await client.query(`
        INSERT INTO public.projeto_eventos
          (projeto_id, tipo, descricao, payload_json)
        VALUES ($1, 'MIGRACAO_COLUNAS', 'Colunas migradas do modelo', $2)
      `, [projeto.id, JSON.stringify({ modelo_id: dadosModelo.modelo.id })]);
    }

    await client.query('COMMIT');
    return { projetosMigrados: rProjetos.rowCount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  const modeloId = process.env.MODELO_ID ? Number(process.env.MODELO_ID) : null;
  migrarProjetosExistentes({ modeloId })
    .then((res) => {
      console.log('✅ Migração concluída:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Falha na migração:', err.message);
      process.exit(1);
    });
}

module.exports = { migrarProjetosExistentes };
