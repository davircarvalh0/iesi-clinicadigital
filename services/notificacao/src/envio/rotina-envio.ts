import type { Lembrete, Prisma } from '../../generated/prisma';
import { registrarAtividade, type DadosAtividade } from '../atividades/registro';
import type { CanalEnvio } from '../canais';
import { FalhaEnvio } from '../canais/canal-envio';
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
    } catch {
      console.error('[rotina-envio] falha no ciclo');
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

  async function registrarResultado(atual: Lembrete, dados: Prisma.LembreteUpdateManyMutationInput, atividade: DadosAtividade) {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.lembrete.updateMany({
        where: { ...programacao, tentativas: atual.tentativas },
        data: dados,
      });
      if (count) await registrarAtividade(atividade, tx);
      return count > 0;
    });
  }

  while (true) {
    const atual = await prisma.lembrete.findFirst({ where: programacao });
    if (!atual) return;
    if (atual.inicioConsulta.getTime() <= Date.now()) {
      const motivoFalha = atual.motivoFalha
        ? `${MOTIVO_CONSULTA_INICIADA}. Última falha: ${atual.motivoFalha}`
        : MOTIVO_CONSULTA_INICIADA;
      await registrarResultado(atual, { status: 'falhou', motivoFalha }, {
        ...base, acao: 'lembrete.expirado', descricao: motivoFalha,
      });
      return;
    }
    if (atual.tentativas >= maxTentativas || (atual.canalEnvio && atual.canalEnvio !== canal.nome)) {
      const motivoFalha = atual.motivoFalha ?? 'Envio interrompido antes da confirmação';
      await registrarResultado(atual, { status: 'falhou', motivoFalha }, {
        ...base, acao: 'lembrete.falhou', descricao: motivoFalha,
      });
      return;
    }

    const tentativas = atual.tentativas + 1;
    const tentativa = await tentarEnvio(canal, atual);
    if (tentativa.ok) {
      const resultado = tentativa.resultado;
      await registrarResultado(atual, { ...resultado, enviadoEm: new Date(), tentativas, motivoFalha: null }, {
        ...base,
        acao: resultado.status === 'simulado' ? 'lembrete.simulado' : 'lembrete.aceito_provedor',
        descricao: resultado.status === 'simulado'
          ? 'Envio simulado em log'
          : 'WhatsApp aceitou a mensagem para processamento',
      });
      return;
    }

    const novaTentativa = tentativas < maxTentativas;
    const registrado = await registrarResultado(atual,
      {
        status: novaTentativa ? 'programado' : 'falhou',
        canalEnvio: canal.nome,
        modoEnvio: canal.nome === 'log' ? 'simulado' : 'real',
        tentativas,
        motivoFalha: tentativa.motivo,
      },
      {
        ...base,
        acao: novaTentativa ? 'envio.nova_tentativa' : 'lembrete.falhou',
        descricao: `Tentativa ${tentativas} de ${maxTentativas}: ${tentativa.motivo}`,
      },
    );
    if (!registrado || !novaTentativa) return;
    await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * tentativas, 30_000)));
  }
}

async function tentarEnvio(canal: CanalEnvio, lembrete: Lembrete) {
  try {
    const resultado = await canal.enviar({
      telefone: paraFormatoInternacional(lembrete.telefone),
      pacienteNome: lembrete.pacienteNome,
      especialidade: lembrete.especialidade,
      profissional: lembrete.profissional,
      inicioConsulta: lembrete.inicioConsulta,
    });
    return { ok: true, resultado } as const;
  } catch (erro) {
    const motivo = erro instanceof FalhaEnvio ? erro.message : `Falha no canal ${canal.nome}`;
    return { ok: false, motivo } as const;
  }
}

// Só o código: a mensagem de erro do banco pode conter dados do lembrete.
function codigoErro(erro: unknown): string {
  const { code, errorCode } = (erro ?? {}) as { code?: unknown; errorCode?: unknown };
  const codigo = code ?? errorCode;
  return typeof codigo === 'string' ? codigo : 'sem código';
}
