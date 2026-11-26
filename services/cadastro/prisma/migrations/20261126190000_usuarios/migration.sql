CREATE TYPE "PerfilUsuario" AS ENUM ('administrador', 'recepcionista', 'profissional');
CREATE TABLE "usuarios" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "senha_hash" TEXT NOT NULL,
  "perfil" "PerfilUsuario" NOT NULL,
  "profissional_id" TEXT,
  CONSTRAINT "usuario_profissional_vinculo" CHECK (("perfil" = 'profissional') = ("profissional_id" IS NOT NULL))
);
