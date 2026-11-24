-- US-13: trilha das chamadas ao canal de envio.
CREATE TYPE "ResultadoTentativa" AS ENUM ('em_andamento', 'simulado', 'aceito_provedor', 'falhou');

CREATE TABLE "tentativas_envio" (
  "id" TEXT NOT NULL,
  "id_lembrete" TEXT NOT NULL,
  "id_consulta" TEXT NOT NULL,
  "id_evento_consulta" TEXT,
  "numero" INTEGER NOT NULL,
  "canal" "CanalLembrete" NOT NULL,
  "modo" "ModoEnvio" NOT NULL,
  "resultado" "ResultadoTentativa" NOT NULL DEFAULT 'em_andamento',
  "id_externo" TEXT,
  "motivo" TEXT,
  "iniciada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "concluida_em" TIMESTAMPTZ(3),
  CONSTRAINT "tentativas_envio_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tentativas_envio_id_lembrete_fkey" FOREIGN KEY ("id_lembrete") REFERENCES "lembretes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "tentativas_envio_id_consulta_iniciada_em_idx" ON "tentativas_envio"("id_consulta", "iniciada_em");
CREATE INDEX "tentativas_envio_id_lembrete_idx" ON "tentativas_envio"("id_lembrete");

-- A trilha também lê as atividades de uma consulta.
CREATE INDEX "atividades_id_consulta_ocorrido_em_idx" ON "atividades"("id_consulta", "ocorrido_em");
