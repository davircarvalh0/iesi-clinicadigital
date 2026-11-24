import type { PrismaClient } from '../../generated/prisma';

/**
 * Registra na cópia local a autorização de WhatsApp de um CPF fictício (US-14). Sem ela a rotina
 * bloqueia o lembrete antes de chamar o canal, que é o comportamento correto em produção.
 * Idempotente: pode ser chamada por testes que rodam em paralelo no mesmo banco.
 */
export async function autorizarWhatsApp(prisma: PrismaClient, cpf: string) {
  await prisma.autorizacaoContato.upsert({
    where: { cpf_canal: { cpf, canal: 'whatsapp' } },
    create: { cpf, canal: 'whatsapp', idPaciente: `teste-${cpf}`, situacao: 'autorizado', versao: 1, registradoEm: new Date() },
    update: { situacao: 'autorizado' },
  });
}
