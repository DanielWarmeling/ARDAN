CREATE TABLE IF NOT EXISTS public.projetos_usuarios (
  id BIGSERIAL PRIMARY KEY,
  empresa TEXT NOT NULL,
  keycloak_sub TEXT,
  nome TEXT NOT NULL,
  email TEXT,
  username TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa, keycloak_sub)
);
CREATE INDEX IF NOT EXISTS idx_projetos_usuarios_empresa ON public.projetos_usuarios(empresa);

CREATE TABLE IF NOT EXISTS public.projetos_setores (
  id BIGSERIAL PRIMARY KEY,
  empresa TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projetos_setores_empresa ON public.projetos_setores(empresa);

CREATE TABLE IF NOT EXISTS public.projetos_setor_membros (
  setor_id BIGINT NOT NULL REFERENCES public.projetos_setores(id) ON DELETE CASCADE,
  usuario_id BIGINT NOT NULL REFERENCES public.projetos_usuarios(id) ON DELETE CASCADE,
  PRIMARY KEY (setor_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS public.projetos_setor_aprovadores (
  setor_id BIGINT NOT NULL REFERENCES public.projetos_setores(id) ON DELETE CASCADE,
  usuario_id BIGINT NOT NULL REFERENCES public.projetos_usuarios(id) ON DELETE CASCADE,
  PRIMARY KEY (setor_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS public.projetos_modelos (
  id BIGSERIAL PRIMARY KEY,
  empresa TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  setor_id BIGINT,
  definicao_json JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projetos_modelos_empresa ON public.projetos_modelos(empresa);

CREATE TABLE IF NOT EXISTS public.projetos_tarefas_modelos (
  id BIGSERIAL PRIMARY KEY,
  empresa TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  setor_id BIGINT,
  responsavel_nome TEXT,
  aprovador_nome TEXT,
  prazo_dias INTEGER,
  obrigatoria BOOLEAN NOT NULL DEFAULT FALSE,
  config_json JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projetos_tarefas_modelos_empresa ON public.projetos_tarefas_modelos(empresa);

ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS modelo_id BIGINT;
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS codigo TEXT;
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS prazo_fim DATE;
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS campos_json JSONB;
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS dono_nome TEXT;
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS responsavel_nome TEXT;
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS etapa TEXT;
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS etapa_setor_id BIGINT;

UPDATE public.projetos
SET nome = COALESCE(nome, titulo)
WHERE nome IS NULL;
