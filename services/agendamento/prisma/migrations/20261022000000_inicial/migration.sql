-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "StatusConsulta" AS ENUM ('agendada', 'cancelada');

-- CreateTable
CREATE TABLE "consultas" (
    "id" TEXT NOT NULL,
    "paciente_nome" TEXT NOT NULL,
    "paciente_cpf" TEXT NOT NULL,
    "paciente_telefone" TEXT NOT NULL,
    "profissional" TEXT NOT NULL,
    "especialidade" TEXT NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "status" "StatusConsulta" NOT NULL DEFAULT 'agendada',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "consultas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" TEXT NOT NULL,
    "id_evento" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "envelope" JSONB NOT NULL,
    "duplicado" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicado_em" TIMESTAMPTZ(3),
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "ultimo_erro" TEXT,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consultas_inicio_idx" ON "consultas"("inicio");

-- CreateIndex
CREATE INDEX "outbox_publicado_em_criado_em_idx" ON "outbox"("publicado_em", "criado_em");

-- CreateIndex
CREATE INDEX "outbox_id_evento_idx" ON "outbox"("id_evento");

