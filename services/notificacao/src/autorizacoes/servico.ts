import type { AutorizacaoContatoAlterada, CanalContato } from '@clinica/eventos';
import type { Prisma } from '../../generated/prisma';
import { registrarAtividade } from '../atividades/registro';
import { prisma } from '../db';

const NOME_CANAL: Record<CanalContato, string> = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'e-mail' };

export type Verificacao = { permitido: true } | { permitido: false; motivo: string };

/**
 * Consulta a cópia local antes do envio. Só `autorizado` libera: autorização desconhecida
 * (inclusive lembrete legado sem CPF) ou revogada bloqueia.
 */
export async function verificarAutorizacao(cpf: string | null, canal: CanalContato): Promise<Verificacao> {
  const copia = cpf ? await prisma.autorizacaoContato.findUnique({ where: { cpf_canal: { cpf, canal } } }) : null;
  if (copia?.situacao === 'autorizado') return { permitido: true };
  return {
    permitido: false,
    motivo: copia ? `autorização de contato por ${NOME_CANAL[canal]} revogada`
      : `sem autorização de contato por ${NOME_CANAL[canal]} registrada`,
  };
}

/**
 * Aplica paciente.autorizacao_alterada na transação do consumidor. Versão igual ou menor que a guardada
 * não tem efeito. No canal usado pelos lembretes, a revogação bloqueia os pendentes e a autorização
 * libera os bloqueados de consultas futuras.
 */
export async function aplicarAutorizacao(
  tx: Prisma.TransactionClient, evento: AutorizacaoContatoAlterada, canalLembrete: CanalContato,
): Promise<void> {
  const { id_paciente: idPaciente, cpf, canal, situacao, versao } = evento.payload;
  const registradoEm = new Date(evento.payload.registrado_em);
  const dados = { idPaciente, situacao, versao, registradoEm, recebidoEm: new Date() };
  await tx.autorizacaoContato.createMany({ data: { cpf, canal, ...dados }, skipDuplicates: true });
  const { count } = await tx.autorizacaoContato.updateMany({ where: { cpf, canal, versao: { lt: versao } }, data: dados });
  const atual = await tx.autorizacaoContato.findUniqueOrThrow({ where: { cpf_canal: { cpf, canal } } });
  const aplicada = count > 0 || (atual.versao === versao && atual.situacao === situacao);
  await registrarAtividade({
    acao: 'autorizacao.atualizada',
    descricao: aplicada
      ? `autorização de ${NOME_CANAL[canal]}: ${situacao} (versão ${versao})`
      : `autorização de ${NOME_CANAL[canal]} versão ${versao} ignorada; já existe a versão ${atual.versao}`,
    idEvento: evento.id_evento,
  }, tx);
  if (!aplicada || canal !== canalLembrete) return;

  const afetados = situacao === 'revogado'
    ? await tx.lembrete.findMany({ where: { pacienteCpf: cpf, status: 'programado' }, select: { id: true, idConsulta: true } })
    : await tx.lembrete.findMany({
      where: { pacienteCpf: cpf, status: 'bloqueado', inicioConsulta: { gt: new Date() } },
      select: { id: true, idConsulta: true },
    });
  for (const lembrete of afetados) {
    if (situacao === 'revogado') {
      const { count } = await tx.lembrete.updateMany({
        where: { id: lembrete.id, status: 'programado' },
        data: { status: 'bloqueado', motivoFalha: `autorização de contato por ${NOME_CANAL[canal]} revogada` },
      });
      if (!count) continue;
    } else {
      const { count } = await tx.lembrete.updateMany({ where: { id: lembrete.id, status: 'bloqueado' }, data: { status: 'programado', motivoFalha: null, tentativas: 0, canalEnvio: null, modoEnvio: null } });
      if (!count) continue;
    }
    await registrarAtividade({
      acao: situacao === 'revogado' ? 'lembrete.bloqueado' : 'lembrete.liberado',
      descricao: situacao === 'revogado'
        ? `lembrete bloqueado: autorização de ${NOME_CANAL[canal]} revogada`
        : `lembrete liberado: autorização de ${NOME_CANAL[canal]} recebida`,
      idEvento: evento.id_evento,
      idConsulta: lembrete.idConsulta,
    }, tx);
  }
}

/** Cópia local de um paciente, para a recepção comparar com o Cadastro. */
export async function copiaDoPaciente(idPaciente: string) {
  const copias = await prisma.autorizacaoContato.findMany({ where: { idPaciente }, orderBy: { canal: 'asc' } });
  return {
    autorizacoes: copias.map(({ canal, situacao, versao, registradoEm, recebidoEm }) => ({
      canal, situacao, versao, registradoEm, recebidoEm,
    })),
  };
}
