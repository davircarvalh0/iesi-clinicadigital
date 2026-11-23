ALTER TYPE "StatusLembrete" ADD VALUE 'simulado';
ALTER TYPE "StatusLembrete" ADD VALUE 'aceito_provedor';

CREATE TYPE "ModoEnvio" AS ENUM ('simulado', 'real');
CREATE TYPE "CanalLembrete" AS ENUM ('log', 'whatsapp');

ALTER TABLE "lembretes"
ADD COLUMN "modo_envio" "ModoEnvio",
ADD COLUMN "canal_envio" "CanalLembrete",
ADD COLUMN "id_externo" TEXT;
