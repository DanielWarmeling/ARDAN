CREATE TABLE IF NOT EXISTS public.usuarios_modulos_permissoes (
  id BIGSERIAL PRIMARY KEY,
  empresa TEXT NOT NULL,
  keycloak_sub TEXT NOT NULL,
  nome_usuario TEXT,
  modulo TEXT NOT NULL,
  permitido BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa, keycloak_sub, modulo)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_modulos_empresa_sub
  ON public.usuarios_modulos_permissoes (empresa, keycloak_sub);
