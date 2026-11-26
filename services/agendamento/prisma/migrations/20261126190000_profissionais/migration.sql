CREATE TABLE "profissionais" ("id" TEXT PRIMARY KEY, "nome" TEXT NOT NULL UNIQUE, "especialidade" TEXT NOT NULL);
INSERT INTO "profissionais" ("id", "nome", "especialidade")
SELECT gen_random_uuid()::text, "profissional", min("especialidade") FROM "consultas" GROUP BY "profissional";
ALTER TABLE "consultas" ADD COLUMN "profissional_id" TEXT;
UPDATE "consultas" c SET "profissional_id" = p.id FROM "profissionais" p WHERE p.nome = c.profissional;
ALTER TABLE "consultas" ALTER COLUMN "profissional_id" SET NOT NULL;
ALTER TABLE "consultas" ADD CONSTRAINT "consultas_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "consultas_profissional_id_idx" ON "consultas"("profissional_id");
