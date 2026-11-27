-- US-27: contas do portal do paciente, ligadas ao cadastro mestre.
ALTER TYPE "PerfilUsuario" ADD VALUE IF NOT EXISTS 'paciente';

ALTER TABLE "usuarios" ADD COLUMN "paciente_id" TEXT;
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_paciente_id_key" UNIQUE ("paciente_id");
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_paciente_id_fkey"
  FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Texto em vez do enum: o valor novo do enum não pode ser usado na mesma transação em que foi criado.
ALTER TABLE "usuarios" ADD CONSTRAINT "usuario_paciente_vinculo"
  CHECK (("perfil"::text = 'paciente') = ("paciente_id" IS NOT NULL));
