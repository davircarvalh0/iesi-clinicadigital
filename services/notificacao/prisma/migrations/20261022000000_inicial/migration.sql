-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "StatusLembrete" AS ENUM ('programado', 'enviado', 'falhou', 'cancelado');

-- CreateTable
CREATE TABLE "lembretes" (
    "id" TEXT NOT NULL,
    "id_consulta" TEXT NOT NULL,
    "paciente_nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "profissional" TEXT NOT NULL,
    "especialidade" TEXT NOT NULL,
    "inicio_consulta" TIMESTAMPTZ(3) NOT NULL,
    "enviar_em" TIMESTAMPTZ(3) NOT NULL,
    "status" "StatusLembrete" NOT NULL DEFAULT 'programado',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "motivo_falha" TEXT,
    "enviado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lembretes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_processados" (
    "id_evento" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "processado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_processados_pkey" PRIMARY KEY ("id_evento")
);

-- CreateTable
CREATE TABLE "atividades" (
    "id" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "id_evento" TEXT,
    "id_consulta" TEXT,
    "ocorrido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atividades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lembretes_id_consulta_key" ON "lembretes"("id_consulta");

-- CreateIndex
CREATE INDEX "lembretes_status_enviar_em_idx" ON "lembretes"("status", "enviar_em");

-- CreateIndex
CREATE INDEX "atividades_ocorrido_em_idx" ON "atividades"("ocorrido_em");

