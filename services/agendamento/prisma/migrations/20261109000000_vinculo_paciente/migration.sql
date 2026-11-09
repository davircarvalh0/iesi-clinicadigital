ALTER TABLE "consultas"
  ADD COLUMN "id_paciente" TEXT,
  ADD COLUMN "vinculo_paciente_pendente" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "eventos_processados" (
  "id_evento" TEXT NOT NULL,
  CONSTRAINT "eventos_processados_pkey" PRIMARY KEY ("id_evento")
);
