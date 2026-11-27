import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { motivo, statusDe, tipoDaFalha } from '../../api/cliente';
import { cadastro, notificacao } from '../../api/servicos';
import type { Autorizacao, Canal, OrigemAutorizacao, PacienteDetalhado } from '../../api/tipos';
import { dataHora } from '../../dominio/datas';
import { Aviso, Campo, Confirmacao, Selo } from '../../ui/componentes';
import { CANAIS, NOME_CANAL, NOME_ORIGEM } from './canais';

type Pedido = { canal: Canal; situacao: 'autorizado' | 'revogado' };

/** Autorização de contato por canal (US-14). Sem registro não é autorização. */
export function SecaoAutorizacoes({ paciente: p, aoRegistrar }: { paciente: PacienteDetalhado; aoRegistrar: () => Promise<unknown> }) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'alerta' | 'perigo'; texto: string } | null>(null);
  const copia = useQuery({ queryKey: ['autorizacoes', p.id, 'notificacao'], queryFn: ({ signal }) => notificacao.autorizacoes(p.id, signal), refetchInterval: 4000, retry: false });
  const historico = useQuery({ queryKey: ['autorizacoes', p.id, 'historico'], queryFn: ({ signal }) => cadastro.historicoAutorizacoes(p.id, signal) });

  const porCanal = (canal: Canal): Autorizacao =>
    p.autorizacoes.find((a) => a.canal === canal) ?? { canal, situacao: 'sem_registro', origem: null, registradoEm: null, versao: 0 };
  const whatsapp = porCanal('whatsapp');

  return (
    <section className="bloco" aria-labelledby="titulo-autorizacoes">
      <header className="bloco__topo">
        <h2 id="titulo-autorizacoes" className="bloco__titulo">Autorização de contato</h2>
      </header>
      <p className="nota">Os lembretes só são enviados por canais que o paciente autorizou. Sem registro conta como não autorizado.</p>
      {whatsapp.situacao !== 'autorizado' && (
        <Aviso tom="alerta">Sem autorização para WhatsApp: os lembretes deste paciente ficam bloqueados até ele autorizar.</Aviso>
      )}
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}

      <ul className="autorizacoes">
        {CANAIS.map((canal) => {
          const a = porCanal(canal);
          const naNotificacao = copia.data?.autorizacoes.find((c) => c.canal === canal);
          const sincronizado = a.versao === 0 || (naNotificacao ? naNotificacao.versao >= a.versao : false);
          return (
            <li key={canal} className="autorizacao">
              <div className="autorizacao__canal">
                <span className="autorizacao__nome">{NOME_CANAL[canal]}</span>
                {a.situacao === 'autorizado' && <Selo tom="ok">Autorizado</Selo>}
                {a.situacao === 'revogado' && <Selo tom="perigo">Revogado</Selo>}
                {a.situacao === 'sem_registro' && <Selo>Sem autorização</Selo>}
              </div>
              <p className="autorizacao__detalhe">
                {a.registradoEm && a.origem ? `Registrado ${NOME_ORIGEM[a.origem]} em ${dataHora(a.registradoEm)}.` : 'Nenhum registro.'}
                {' '}
                {a.versao > 0 && (copia.isError
                  ? <span className="nota">Não foi possível conferir com a Notificação.</span>
                  : copia.data && (sincronizado
                    ? <span className="nota">A Notificação já usa este registro.</span>
                    : <span className="autorizacao__pendente">A Notificação ainda não recebeu este registro.</span>))}
              </p>
              <div className="autorizacao__acoes">
                {a.situacao !== 'autorizado' && <button type="button" className="botao botao--secundario" onClick={() => { setAviso(null); setPedido({ canal, situacao: 'autorizado' }); }}>Registrar autorização</button>}
                {a.situacao === 'autorizado' && <button type="button" className="botao botao--quieto botao--texto-perigo" onClick={() => { setAviso(null); setPedido({ canal, situacao: 'revogado' }); }}>Revogar</button>}
              </div>
            </li>
          );
        })}
      </ul>

      <details className="historico-autorizacoes">
        <summary>Histórico de registros</summary>
        {historico.isPending && <p className="nota">Carregando…</p>}
        {historico.isError && <p className="nota">Não foi possível carregar o histórico: {motivo(historico.error)}.</p>}
        {historico.data?.historico.length === 0 && <p className="nota">Nenhum registro ainda.</p>}
        <ol>
          {historico.data?.historico.map((h) => (
            <li key={`${h.canal}-${h.versao}`}>
              <strong>{NOME_CANAL[h.canal]}</strong> {h.situacao === 'autorizado' ? 'autorizado' : 'revogado'}
              {h.origem && ` ${NOME_ORIGEM[h.origem]}`}{h.registradoEm && `, ${dataHora(h.registradoEm)}`}
            </li>
          ))}
        </ol>
      </details>

      {pedido && (
        <DialogoAutorizacao paciente={p} pedido={pedido} aoFechar={() => setPedido(null)}
          aoConcluir={async (resultado) => { setAviso(resultado); setPedido(null); await aoRegistrar(); }} />
      )}
    </section>
  );
}

function DialogoAutorizacao({ paciente, pedido, aoFechar, aoConcluir }: {
  paciente: PacienteDetalhado; pedido: Pedido; aoFechar: () => void;
  aoConcluir: (r: { tom: 'ok' | 'alerta' | 'perigo'; texto: string }) => Promise<void>;
}) {
  const [origem, setOrigem] = useState<OrigemAutorizacao>('presencial');
  const [erro, setErro] = useState<string | null>(null);
  const autorizar = pedido.situacao === 'autorizado';
  const registrar = useMutation({
    mutationFn: () => cadastro.registrarAutorizacao(paciente.id, { canal: pedido.canal, situacao: pedido.situacao, origem }),
    onSuccess: () => aoConcluir({ tom: 'ok', texto: `${autorizar ? 'Autorização' : 'Revogação'} de ${NOME_CANAL[pedido.canal]} registrada.` }),
    onError: (falha) => {
      if (statusDe(falha) === 409) void aoConcluir({ tom: 'alerta', texto: 'Outro registro foi feito ao mesmo tempo. A situação foi recarregada: confira antes de registrar de novo.' });
      else if (tipoDaFalha(falha) === 'incerta') void aoConcluir({ tom: 'alerta', texto: 'O Cadastro não respondeu, então não dá para saber se o registro foi gravado. Confira a situação antes de repetir.' });
      else setErro(`O registro não foi feito: ${motivo(falha)}.`);
    },
  });

  return (
    <Confirmacao
      titulo={autorizar ? `Registrar autorização de ${NOME_CANAL[pedido.canal]}` : `Revogar ${NOME_CANAL[pedido.canal]}`}
      confirmar={autorizar ? 'Registrar autorização' : 'Revogar autorização'}
      perigo={!autorizar} ocupado={registrar.isPending} erro={erro}
      aoFechar={aoFechar} aoConfirmar={() => registrar.mutate()}
    >
      <p>{autorizar
        ? `${paciente.nome} autoriza receber lembretes por ${NOME_CANAL[pedido.canal]}.`
        : `${paciente.nome} deixa de receber lembretes por ${NOME_CANAL[pedido.canal]}. Lembretes ainda não enviados por este canal serão bloqueados.`}</p>
      <Campo rotulo="Como o paciente informou">
        <select value={origem} onChange={(e) => setOrigem(e.target.value as OrigemAutorizacao)}>
          <option value="presencial">Pessoalmente, na recepção</option>
          <option value="telefone">Por telefone</option>
          <option value="formulario">Por formulário</option>
        </select>
      </Campo>
    </Confirmacao>
  );
}
