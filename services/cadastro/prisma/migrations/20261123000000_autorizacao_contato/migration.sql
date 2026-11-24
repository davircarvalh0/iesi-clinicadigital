-- CreateEnum
CREATE TYPE "CanalContato" AS ENUM ('whatsapp', 'sms', 'email');

-- CreateEnum
CREATE TYPE "SituacaoAutorizacao" AS ENUM ('autorizado', 'revogado');

-- CreateEnum
CREATE TYPE "OrigemAutorizacao" AS ENUM ('presencial', 'telefone', 'formulario');

-- AlterTable
ALTER TABLE "pacientes" ADD COLUMN     "canal_preferido" "CanalContato";

-- CreateTable
CREATE TABLE "autorizacoes_contato" (
    "id" TEXT NOT NULL,
    "id_paciente" TEXT NOT NULL,
    "canal" "CanalContato" NOT NULL,
    "situacao" "SituacaoAutorizacao" NOT NULL,
    "origem" "OrigemAutorizacao" NOT NULL,
    "versao" INTEGER NOT NULL,
    "registrado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autorizacoes_contato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "autorizacoes_contato_id_paciente_canal_versao_key" ON "autorizacoes_contato"("id_paciente", "canal", "versao");

-- AddForeignKey
ALTER TABLE "autorizacoes_contato" ADD CONSTRAINT "autorizacoes_contato_id_paciente_fkey" FOREIGN KEY ("id_paciente") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

