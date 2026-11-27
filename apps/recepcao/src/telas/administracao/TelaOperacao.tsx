import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { motivo, statusDe } from '../../api/cliente';
import { notificacao, saude, type NomeServico } from '../../api/servicos';
import type { ErroNaFila } from '../../api/tipos';
import { dataHora } from '../../dominio/datas';
import { Aviso, CabecalhoTela, Carregando, Confirmacao, Selo, Vazio } from '../../ui/componentes';

const SERVICOS: { nome: NomeServico; rotulo: string; papel: string }[] = [
  { nome: 'agendamento', rotulo: 'Agendamento', papel: 'Consultas e publicação dos eventos' },
  { nome: 'cadastro', rotulo: 'Cadastro', papel: 'Pacientes, autorizações e acessos' },
  { nome: 'notificacao', rotulo: 'Notificação', papel: 'Lembretes e envio' },
];

export function TelaOperacao() {
  return (
    <div className="tela">
      <CabecalhoTela titulo="Operação" descricao="Saúde dos serviços e eventos que falharam no processamento." />
      <section className="bloco" aria-labelledby="titulo-saude">
        <h2 id="titulo-saude" className="bloco__titulo">Serviços</h2>
        <ul className="saude">
          {SERVICOS.map((s) => <LinhaSaude key={s.nome} {...s} />)}
        </ul>
      </section>
      <FilaDeErros />
      <Historico />
    </div>
  );
}

function LinhaSaude({ nome, rotulo, papel }: { nome: NomeServico; rotulo: string; papel: string }) {
  const leitura = useQuery({ queryKey: ['saude', nome], queryFn: ({ signal }) => saude(nome, signal), refetchInterval: 10_000, retry: false });
  return (
    <li className="saude__item">
      <div><strong>{rotulo}</strong><span className="nota">{papel}</span></div>
      {leitura.isError ? <Selo tom="perigo">Sem resposta</Selo> : leitura.data?.status === 'ok' ? <Selo tom="ok">Respondendo</Selo> : <Selo>Consultando…</Selo>}
    </li>
  );
}

const desligada = (e: unknown) => statusDe(e) === 404;

function FilaDeErros() {
  const cliente = useQueryClient();
  const erros = useQuery({ queryKey: ['operacao', 'erros'], queryFn: ({ signal }) => notificacao.errosNaFila(signal), refetchInterval: 10_000, retry: false });
  const [escolhido, setEscolhido] = useState<ErroNaFila | null>(null);
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'perigo'; texto: string } | null>(null);
  const [erroDialogo, setErroDialogo] = useState<string | null>(null);
  const reprocessar = useMutation({
    mutationFn: (idEvento: string) => notificacao.reprocessar(idEvento),
    onSuccess: () => {
      setEscolhido(null);
      setAviso({ tom: 'ok', texto: 'Reprocessamento solicitado. O resultado aparece no histórico abaixo.' });
      void cliente.invalidateQueries({ queryKey: ['operacao'] });
    },
    onError: (e) => setErroDialogo(`Não foi possível reprocessar: ${motivo(e)}.`),
  });

  return (
    <section className="bloco" aria-labelledby="titulo-fila">
      <h2 id="titulo-fila" className="bloco__titulo">Fila de erros da Notificação</h2>
      <p className="nota">Eventos que falharam depois de todas as tentativas. Reprocessar mantém o identificador original, então um evento já aplicado não gera um segundo lembrete.</p>
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
      {erros.isPending && <Carregando />}
      {erros.isError && (desligada(erros.error)
        ? <p className="nota">A inspeção da fila está desligada neste ambiente (OPERACAO_HABILITADA).</p>
        : <Aviso tom="perigo">Não foi possível consultar a fila: {motivo(erros.error)}.</Aviso>)}
      {erros.data?.length === 0 && <Vazio titulo="Fila vazia">Nenhum evento falhou.</Vazio>}
      {!!erros.data?.length && (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead><tr><th scope="col">Evento</th><th scope="col">Motivo</th><th scope="col">Tentativas</th><th scope="col"><span className="sr">Ações</span></th></tr></thead>
            <tbody>
              {erros.data.map((e, i) => (
                <tr key={`${e.idEvento ?? 'sem-id'}-${i}`}>
                  <td><span className="tabela__principal">{e.tipo ?? 'Tipo desconhecido'}</span><code className="tabela__secundario">{e.idEvento ? `#${e.idEvento.slice(0, 8)}` : 'sem identificador'}</code></td>
                  <td>{e.motivo}{e.jaProcessado && <span className="tabela__secundario">Já aplicado antes: reprocessar não repete o efeito.</span>}</td>
                  <td>{e.tentativas}</td>
                  <td className="tabela__acao">
                    <button type="button" className="botao botao--secundario" disabled={!e.reprocessavel || !e.idEvento}
                      title={!e.reprocessavel ? 'Este evento não pode ser reprocessado (inválido ou sem identificador)' : undefined}
                      onClick={() => { setErroDialogo(null); setEscolhido(e); }}>Reprocessar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {escolhido?.idEvento && (
        <Confirmacao titulo="Reprocessar evento?" confirmar="Reprocessar" ocupado={reprocessar.isPending} erro={erroDialogo}
          aoFechar={() => setEscolhido(null)} aoConfirmar={() => reprocessar.mutate(escolhido.idEvento!)}>
          <p><strong>{escolhido.tipo ?? 'Evento'}</strong> volta para a fila da Notificação com o mesmo identificador.</p>
          <p className="nota">A solicitação fica registrada com o seu nome.</p>
        </Confirmacao>
      )}
    </section>
  );
}

function Historico() {
  const historico = useQuery({ queryKey: ['operacao', 'reprocessamentos'], queryFn: ({ signal }) => notificacao.reprocessamentos(signal), refetchInterval: 10_000, retry: false });
  if (historico.isError && desligada(historico.error)) return null;
  return (
    <section className="bloco" aria-labelledby="titulo-historico">
      <h2 id="titulo-historico" className="bloco__titulo">Reprocessamentos solicitados</h2>
      {historico.isPending && <Carregando />}
      {historico.isError && <Aviso tom="perigo">Não foi possível carregar: {motivo(historico.error)}.</Aviso>}
      {historico.data?.length === 0 && <p className="nota">Nenhum reprocessamento ainda.</p>}
      {!!historico.data?.length && (
        <ul className="lista-simples">
          {historico.data.map((h) => (
            <li key={h.id}><strong>{dataHora(h.solicitadoEm)}</strong><span>{h.solicitante}, evento <code>#{h.idEvento.slice(0, 8)}</code></span><Selo>{h.resultado}</Selo></li>
          ))}
        </ul>
      )}
    </section>
  );
}
