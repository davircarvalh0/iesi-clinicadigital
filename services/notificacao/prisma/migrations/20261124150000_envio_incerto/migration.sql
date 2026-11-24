-- US-15: envio externo sem confirmação e decisão humana registrada.
ALTER TYPE "StatusLembrete" ADD VALUE 'incerto';
ALTER TYPE "ResultadoTentativa" ADD VALUE 'indeterminado';

ALTER TABLE "lembretes" ADD COLUMN "incerto_resolvido_em" TIMESTAMPTZ(3);

CREATE TYPE "AcaoResolucao" AS ENUM ('reenviar', 'manter_sem_reenvio');

CREATE TABLE "resolucoes_envio" (
  "id" TEXT NOT NULL,
  "id_lembrete" TEXT NOT NULL,
  "id_consulta" TEXT NOT NULL,
  "acao" "AcaoResolucao" NOT NULL,
  "solicitante" TEXT NOT NULL,
  "registrada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "resolucoes_envio_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "resolucoes_envio_id_lembrete_fkey" FOREIGN KEY ("id_lembrete") REFERENCES "lembretes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "resolucoes_envio_id_lembrete_registrada_em_idx" ON "resolucoes_envio"("id_lembrete", "registrada_em");
