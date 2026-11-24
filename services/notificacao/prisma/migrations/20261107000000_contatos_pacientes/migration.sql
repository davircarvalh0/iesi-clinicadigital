ALTER TABLE "lembretes" ADD COLUMN "paciente_cpf" TEXT;
CREATE INDEX "lembretes_paciente_cpf_idx" ON "lembretes"("paciente_cpf");
CREATE TABLE "contatos_pacientes" (
  "cpf" TEXT NOT NULL PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "telefone" TEXT NOT NULL,
  "revisao" INTEGER NOT NULL
);
