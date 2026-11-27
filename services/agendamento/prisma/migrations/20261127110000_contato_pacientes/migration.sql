-- US-27: cópia local do contato do paciente, alimentada por paciente.atualizado.
CREATE TABLE "pacientes_contato" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "cpf" TEXT NOT NULL UNIQUE,
  "nome" TEXT NOT NULL,
  "telefone" TEXT NOT NULL,
  "revisao" INTEGER NOT NULL
);
CREATE INDEX "consultas_id_paciente_idx" ON "consultas"("id_paciente");
