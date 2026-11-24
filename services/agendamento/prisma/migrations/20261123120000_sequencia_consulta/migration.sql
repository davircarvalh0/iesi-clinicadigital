-- US-11: sequência de alteração por consulta, para o consumidor descartar eventos fora de ordem.
ALTER TABLE "consultas" ADD COLUMN "sequencia" INTEGER NOT NULL DEFAULT 1;
