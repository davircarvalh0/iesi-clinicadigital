import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { motivo } from '../../api/cliente';
import { portal } from '../../api/servicos';
import type { ConsultaPaciente } from '../../api/tipos';
import { useUsuario } from '../../app/sessao';
import { dataHora, diaPorExtenso, saudacao } from '../../dominio/datas';
import type { Tom } from '../../dominio/lembretes';
import { Aviso, CabecalhoTela, Carregando, Selo, Vazio } from '../../ui/componentes';
import { GavetaNovaConsultaPaciente } from './GavetaNovaConsultaPaciente';

const CHAVE = ['portal', 'minhas-consultas'];

const SELO_STATUS: Partial<Record<ConsultaPaciente['status'], { tom: Tom; texto: string }>> = {
  confirmada: { tom: 'info', texto: 'Confirmada' },
  concluida: { tom: 'ok', texto: 'Concluída' },
  falta: { tom: 'perigo', texto: 'Faltou' },
  cancelada: { tom: 'perigo', texto: 'Cancelada' },
};

/** US-27: portal mínimo do paciente — ver as próprias consultas, confirmar presença e marcar uma nova. */
export function TelaPortal() {
  const usuario = useUsuario();
  const cliente = useQueryClient();
  const consultas = useQuery({ queryKey: CHAVE, queryFn: ({ signal }) => portal.minhasConsultas(signal), refetchInterval: 30_000 });
  const [nova, setNova] = useState(false);
  const atualizar = () => cliente.invalidateQueries({ queryKey: CHAVE });

  const ativas = (consultas.data ?? []).filter((c) => c.status === 'agendada' || c.status === 'confirmada');
  const historico = (consultas.data ?? []).filter((c) => c.status === 'concluida' || c.status === 'falta' || c.status === 'cancelada');

  return (
    <div className="tela">
      <CabecalhoTela
        titulo="Minhas consultas"
        descricao={`${saudacao()}, ${usuario.nome.split(' ')[0]}. ${diaPorExtenso()}.`}
        acoes={<button type="button" className="botao botao--primario" onClick={() => setNova(true)}><Plus size={18} aria-hidden="true" /> Marcar consulta</button>}
      />

      {consultas.isPending && <Carregando texto="Carregando suas consultas…" />}
      {consultas.isError && (
        <Vazio titulo="Não foi possível carregar suas consultas" acao={<button type="button" className="botao botao--secundario" onClick={() => void consultas.refetch()}>Tentar de novo</button>}>
          O Agendamento não respondeu. Tente de novo em instantes.
        </Vazio>
      )}

      {consultas.data && (
        <>
          <section className="bloco" aria-labelledby="titulo-proximas">
            <h2 id="titulo-proximas" className="bloco__titulo">Próximas</h2>
            {ativas.length === 0 && <p className="nota">Nenhuma consulta marcada. Use "Marcar consulta" para escolher um horário.</p>}
            {ativas.length > 0 && (
              <ol className="horarios horarios--simples">
                {ativas.map((c) => <ConsultaPortal key={c.id} consulta={c} aoAtualizar={atualizar} />)}
              </ol>
            )}
          </section>

          {historico.length > 0 && (
            <section className="bloco" aria-labelledby="titulo-historico">
              <h2 id="titulo-historico" className="bloco__titulo">Anteriores</h2>
              <ol className="horarios horarios--simples">
                {historico.map((c) => <ConsultaPortal key={c.id} consulta={c} aoAtualizar={atualizar} />)}
              </ol>
            </section>
          )}
        </>
      )}

      {nova && <GavetaNovaConsultaPaciente aoFechar={() => setNova(false)} aoAgendar={atualizar} />}
    </div>
  );
}

function ConsultaPortal({ consulta: c, aoAtualizar }: { consulta: ConsultaPaciente; aoAtualizar: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const confirmar = useMutation({
    mutationFn: () => portal.confirmar(c.id),
    onSuccess: () => { setErro(null); aoAtualizar(); },
    onError: (e) => setErro(`Não foi possível confirmar: ${motivo(e)}.`),
  });
  const selo = SELO_STATUS[c.status];

  return (
    <li className="horario">
      <time className="horario__hora" dateTime={c.inicio}>{dataHora(c.inicio)}</time>
      <article className="consulta">
        <div className="consulta__principal">
          <h3 className="consulta__paciente">{c.profissional}</h3>
          <p className="consulta__detalhes">{c.especialidade}</p>
          {selo && <div className="consulta__selos"><Selo tom={selo.tom}>{selo.texto}</Selo></div>}
          {erro && <Aviso tom="perigo">{erro}</Aviso>}
        </div>
        {c.podeConfirmar && (
          <div className="consulta__acoes">
            <button type="button" className="botao botao--quieto" onClick={() => confirmar.mutate()} disabled={confirmar.isPending}>
              {confirmar.isPending ? 'Confirmando…' : 'Confirmar presença'}
            </button>
          </div>
        )}
      </article>
    </li>
  );
}
