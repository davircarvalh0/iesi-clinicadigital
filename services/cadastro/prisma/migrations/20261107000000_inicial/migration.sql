CREATE TABLE "pacientes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "cpf" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "telefone" TEXT NOT NULL,
  "email" TEXT,
  "revisao" INTEGER NOT NULL DEFAULT 1,
  "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "pacientes_cpf_key" ON "pacientes"("cpf");
CREATE TABLE "eventos_processados" (
  "id_evento" TEXT NOT NULL PRIMARY KEY,
  "tipo" TEXT NOT NULL,
  "processado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "eventos_saida" (
  "id_evento" TEXT NOT NULL PRIMARY KEY,
  "tipo" TEXT NOT NULL,
  "envelope" JSONB NOT NULL,
  "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publicado_em" TIMESTAMPTZ(3)
);
CREATE INDEX "eventos_saida_publicado_em_criado_em_idx" ON "eventos_saida"("publicado_em", "criado_em");
