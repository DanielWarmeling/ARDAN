CREATE TABLE IF NOT EXISTS public.empresas (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.links (
  id BIGSERIAL PRIMARY KEY,
  empresa TEXT NOT NULL,
  titulo TEXT NOT NULL,
  url TEXT NOT NULL,
  categoria TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_links_empresa ON public.links (empresa);

CREATE TABLE IF NOT EXISTS public.vagas (
  id BIGSERIAL PRIMARY KEY,
  empresa TEXT NOT NULL,
  titulo TEXT NOT NULL,
  setor TEXT,
  cidade TEXT,
  tipo TEXT,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'aberta',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vagas_empresa ON public.vagas (empresa);

CREATE TABLE IF NOT EXISTS public.contratos (
  id BIGSERIAL PRIMARY KEY,
  empresa TEXT NOT NULL,
  numero TEXT NOT NULL,
  cliente TEXT,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  data_inicio DATE,
  data_fim DATE,
  valor NUMERIC(18,2),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contratos_empresa ON public.contratos (empresa);

CREATE TABLE IF NOT EXISTS public.projetos (
  id BIGSERIAL PRIMARY KEY,
  empresa TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'triagem',
  setor TEXT,
  prioridade INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projetos_empresa ON public.projetos (empresa);

INSERT INTO public.empresas (slug, nome)
VALUES ('ARDAN', 'ARDAN')
ON CONFLICT (slug) DO NOTHING;
