-- US-25: situação da conta, sessões e recuperação de senha.
ALTER TABLE "usuarios"
  ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "sessoes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "usuario_id" TEXT NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expira_em" TIMESTAMPTZ(3) NOT NULL,
  "encerrada_em" TIMESTAMPTZ(3)
);
CREATE INDEX "sessoes_usuario_id_idx" ON "sessoes"("usuario_id");

CREATE TABLE "redefinicoes_senha" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "usuario_id" TEXT NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "codigo_hash" TEXT NOT NULL UNIQUE,
  "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expira_em" TIMESTAMPTZ(3) NOT NULL,
  "usada_em" TIMESTAMPTZ(3)
);
CREATE INDEX "redefinicoes_senha_usuario_id_idx" ON "redefinicoes_senha"("usuario_id");
