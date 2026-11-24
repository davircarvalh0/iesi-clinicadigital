-- AlterEnum
ALTER TYPE "StatusLembrete" ADD VALUE 'bloqueado';

-- CreateTable
CREATE TABLE "autorizacoes_contato" (
    "cpf" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "id_paciente" TEXT NOT NULL,
    "situacao" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "registrado_em" TIMESTAMPTZ(3) NOT NULL,
    "recebido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autorizacoes_contato_pkey" PRIMARY KEY ("cpf","canal")
);

-- CreateIndex
CREATE INDEX "autorizacoes_contato_id_paciente_idx" ON "autorizacoes_contato"("id_paciente");

