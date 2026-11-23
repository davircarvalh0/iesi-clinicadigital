import type { Lembrete } from '../../generated/prisma';
import { registrarAtividade } from '../atividades/registro';
import type { CanalEnvio } from '../canais';
import { paraFormatoInternacional } from '../canais/telefone';
import { prisma } from '../db';
import { MOTIVO_CONSULTA_INICIADA } from '../lembretes/horario';

/** Rotina periódica que envia os lembretes cujo horário chegou. Retorna uma função que a para. */
export function iniciarRotinaEnvio(canal: CanalEnvio, intervaloMs: number, maxTentativas: number): () => void {
  let rodando = false;

  const ciclo = async () => {
    if (rodando) return;
    rodando = true;
    try {
      await enviarVencidos(canal, maxTentativas);
    } catch (erro) {
      console.error('[rotina-envio] falha no ciclo', erro);
    } finally {
      rodando = false;
    }
  };

  const timer = setInterval(ciclo, intervaloMs);
  console.log(`[rotina-envio] canal "${canal.nome}", a cada ${intervaloMs}ms`);
  return () => clearInterval(timer);
}

async function enviarVencidos(canal: CanalEnvio, maxTentativas: number): Promise<void> {
  const agora = new Date();
  const vencidos = await prisma.lembrete.findMany({
    where: { status: 'programado', OR: [{ enviarEm: { lte: agora } }, { inicioConsulta: { lte: agora } }] },
    orderBy: { enviarEm: 'asc' },
    take: 20,
  });
  for (const lembrete of vencidos) {
    await enviar(canal, lembrete, maxTentativas);
  }
}

async function enviar(canal: CanalEnvio, lembrete: Lembrete, maxTentativas: number): Promise<void> {
  const programacao = {
    id: lembrete.id,
    status: 'programado' as const,
    idEventoConsulta: lembrete.idEventoConsulta,
    inicioConsulta: lembrete.inicioConsulta,
    enviarEm: lembrete.enviarEm,
  };
  const base = { idConsulta: lembrete.idConsulta, idEvento: lembrete.idEventoConsulta ?? undefined };
  let ultimoErro = '';

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    const atual = await prisma.lembrete.findFirst({ where: programacao });
    if (!atual) return;
    if (atual.inicioConsulta.getTime() <= Date.now()) {
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.lembrete.updateMany({
          where: programacao,
          data: { status: 'falhou', tentativas: tentativa - 1, motivoFalha: MOTIVO_CONSULTA_INICIADA },
        });
        if (count) {
          await registrarAtividade({ ...base, acao: 'lembrete.expirado', descricao: MOTIVO_CONSULTA_INICIADA }, tx);
        }
      });
      return;
    }
    const telefone = paraFormatoInternacional(atual.telefone);
    try {
      await canal.enviar({
        telefone,
        pacienteNome: atual.pacienteNome,
        especialidade: atual.especialidade,
        profissional: atual.profissional,
        inicioConsulta: atual.inicioConsulta,
      });
      // `status: programado` no filtro evita sobrescrever um cancelamento que chegou durante o envio.
      await prisma.lembrete.updateMany({
        where: programacao,
        data: { status: 'enviado', enviadoEm: new Date(), tentativas: tentativa, motivoFalha: null },
      });
      await registrarAtividade({
        ...base,
        acao: 'lembrete.enviado',
        descricao: `${lembrete.pacienteNome}: lembrete enviado por ${canal.nome === 'whatsapp' ? 'WhatsApp' : 'log (simulado)'} para +${telefone}`,
      });
      return;
    } catch (erro) {
      ultimoErro = erro instanceof Error ? erro.message : String(erro);
      if (tentativa < maxTentativas) {
        await registrarAtividade({
          ...base,
          acao: 'envio.nova_tentativa',
          descricao: `${lembrete.pacienteNome}: envio falhou (${ultimoErro}); tentando de novo`,
        });
        await new Promise((r) => setTimeout(r, Math.min(1000 * tentativa, 30_000)));
      }
    }
  }

  await prisma.lembrete.updateMany({
    where: programacao,
    data: { status: 'falhou', tentativas: maxTentativas, motivoFalha: ultimoErro },
  });
  await registrarAtividade({
    ...base,
    acao: 'lembrete.falhou',
    descricao: `${lembrete.pacienteNome}: lembrete falhou após ${maxTentativas} tentativas (${ultimoErro})`,
  });
}
