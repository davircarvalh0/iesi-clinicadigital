CREATE TYPE "ResultadoReprocessamento" AS ENUM ('solicitado', 'republicado', 'falhou');
CREATE TABLE "reprocessamentos" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "id_evento" TEXT NOT NULL,
  "tipo" TEXT,
  "id_consulta" TEXT,
  "solicitante" TEXT NOT NULL,
  "resultado" "ResultadoReprocessamento" NOT NULL DEFAULT 'solicitado',
  "solicitado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "reprocessamentos_id_evento_idx" ON "reprocessamentos"("id_evento");
