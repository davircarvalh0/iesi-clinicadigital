-- US-30: outbox da Notificação e respostas do paciente pelo WhatsApp.
CREATE TABLE "eventos_saida" (
  "id_evento" TEXT NOT NULL PRIMARY KEY,
  "tipo" TEXT NOT NULL,
  "envelope" JSONB NOT NULL,
  "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publicado_em" TIMESTAMPTZ(3)
);
CREATE INDEX "eventos_saida_publicado_em_criado_em_idx" ON "eventos_saida"("publicado_em", "criado_em");

CREATE TYPE "ResultadoResposta" AS ENUM ('confirmada', 'nao_reconhecida', 'sem_consulta');
CREATE TABLE "respostas_whatsapp" (
  "id_mensagem" TEXT NOT NULL PRIMARY KEY,
  "id_consulta" TEXT,
  "resultado" "ResultadoResposta" NOT NULL,
  "recebida_em" TIMESTAMPTZ(3) NOT NULL,
  "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "respostas_whatsapp_id_consulta_idx" ON "respostas_whatsapp"("id_consulta");
