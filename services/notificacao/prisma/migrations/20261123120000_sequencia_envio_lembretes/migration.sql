-- US-11: reserva de envio e descarte de eventos obsoletos.
ALTER TYPE "StatusLembrete" ADD VALUE 'enviando';

ALTER TABLE "lembretes" ADD COLUMN "sequencia_aplicada" INTEGER;
