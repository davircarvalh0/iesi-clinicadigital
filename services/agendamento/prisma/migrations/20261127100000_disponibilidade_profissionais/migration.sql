-- US-26: situação do profissional, disponibilidade semanal e duração das consultas.
ALTER TABLE "profissionais"
  ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "duracao_consulta_minutos" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD CONSTRAINT "profissionais_duracao_valida" CHECK ("duracao_consulta_minutos" BETWEEN 5 AND 240);

CREATE TABLE "disponibilidades" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "profissional_id" TEXT NOT NULL REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "dia_semana" INTEGER NOT NULL CHECK ("dia_semana" BETWEEN 0 AND 6),
  "inicio_minutos" INTEGER NOT NULL CHECK ("inicio_minutos" BETWEEN 0 AND 1439),
  "fim_minutos" INTEGER NOT NULL CHECK ("fim_minutos" BETWEEN 1 AND 1440),
  CONSTRAINT "disponibilidades_intervalo_valido" CHECK ("inicio_minutos" < "fim_minutos")
);
CREATE INDEX "disponibilidades_profissional_id_idx" ON "disponibilidades"("profissional_id");

-- Consultas existentes ficam com 30 min, o padrão de antes.
ALTER TABLE "consultas" ADD COLUMN "duracao_minutos" INTEGER NOT NULL DEFAULT 30;
CREATE INDEX "consultas_profissional_id_inicio_idx" ON "consultas"("profissional_id", "inicio");
