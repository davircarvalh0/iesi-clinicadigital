import { prisma } from './db';
import { enfileirar } from './servico';

/** Reenvia a fotografia atual dos contatos para novas projeções, sem expor dados no log. */
async function republicar() {
  let cursor: string | undefined;
  let total = 0;
  while (true) {
    const lote = await prisma.paciente.findMany({
      orderBy: { id: 'asc' }, take: 100, select: { id: true },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!lote.length) break;
    for (const { id } of lote) {
      await prisma.$transaction(async tx => {
        const paciente = await tx.paciente.update({ where: { id }, data: { revisao: { increment: 1 } } });
        await enfileirar(tx, paciente, `paciente-${id}`);
      });
      total++;
    }
    cursor = lote[lote.length - 1].id;
  }
  console.log(`Contatos republicados pela outbox: ${total}`);
}

republicar().catch(() => {
  console.error('Não foi possível republicar os contatos');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
