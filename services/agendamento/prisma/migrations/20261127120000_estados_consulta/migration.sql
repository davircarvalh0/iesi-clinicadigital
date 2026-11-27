-- US-28: estados de acompanhamento da consulta.
ALTER TYPE "StatusConsulta" ADD VALUE IF NOT EXISTS 'confirmada';
ALTER TYPE "StatusConsulta" ADD VALUE IF NOT EXISTS 'concluida';
ALTER TYPE "StatusConsulta" ADD VALUE IF NOT EXISTS 'falta';

ALTER TABLE "consultas"
  ADD COLUMN "confirmada_em" TIMESTAMPTZ(3),
  ADD COLUMN "confirmada_por" TEXT,
  ADD COLUMN "encerrada_em" TIMESTAMPTZ(3);
