-- US-30: consulta cancelada depois do envio do lembrete (respostas não a confirmam).
ALTER TABLE "lembretes" ADD COLUMN "consulta_cancelada_em" TIMESTAMPTZ(3);
