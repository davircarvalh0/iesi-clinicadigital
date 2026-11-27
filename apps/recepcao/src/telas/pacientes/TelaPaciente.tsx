import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { motivo, statusDe } from '../../api/cliente';
import { agendamento, cadastro } from '../../api/servicos';
import { chaveDia, dataHora, hoje } from '../../dominio/datas';
import { cpfProtegido, iniciais } from '../../dominio/documentos';
import { Carregando, Selo, Vazio } from '../../ui/componentes';
import { SecaoAutorizacoes } from './SecaoAutorizacoes';
import { SecaoContato } from './SecaoContato';

export function TelaPaciente() {
  const { id = '' } = useParams();
  const cliente = useQueryClient();
  const paciente = useQuery({ queryKey: ['paciente', id], queryFn: ({ signal }) => cadastro.paciente(id, signal), refetchInterval: 10_000 });
  const consultas = useQuery({ queryKey: ['consultas'], queryFn: ({ signal }) => agendamento.consultas(signal), refetchInterval: 10_000 });
  const recarregar = () => Promise.all([
    cliente.invalidateQueries({ queryKey: ['paciente', id] }),
    cliente.invalidateQueries({ queryKey: ['pacientes'] }),
    cliente.invalidateQueries({ queryKey: ['autorizacoes', id] }),
  ]);

  const voltar = <Link to="/pacientes" className="voltar"><ArrowLeft size={16} aria-hidden="true" /> Pacientes</Link>;

  if (paciente.isPending) return <div className="tela">{voltar}<Carregando texto="Carregando o cadastro…" /></div>;
  if (paciente.isError && !paciente.data) {
    return (
      <div className="tela">{voltar}
        <Vazio titulo={statusDe(paciente.error) === 404 ? 'Paciente não encontrado' : 'Não foi possível abrir o cadastro'}
          acao={statusDe(paciente.error) !== 404 && <button type="button" className="botao botao--secundario" onClick={() => void paciente.refetch()}>Tentar de novo</button>}>
          {statusDe(paciente.error) === 404 ? 'Este cadastro não existe mais ou o endereço está incorreto.' : `O Cadastro não respondeu: ${motivo(paciente.error)}.`}
        </Vazio>
      </div>
    );
  }

  const p = paciente.data;
  const dele = (consultas.data ?? []).filter((c) => c.idPaciente === p.id).sort((a, b) => b.inicio.localeCompare(a.inicio));
  const proximas = dele.filter((c) => c.status === 'agendada' && chaveDia(c.inicio) >= hoje());

  return (
    <div className="tela tela--paciente">
      {voltar}
      <header className="ficha">
        <span className="monograma monograma--grande" aria-hidden="true">{iniciais(p.nome)}</span>
        <div>
          <h1 className="ficha__nome">{p.nome}</h1>
          <p className="ficha__dados">CPF {cpfProtegido(p.cpf)} <span className="ficha__revisao">Cadastro na revisão {p.revisao}</span></p>
        </div>
      </header>

      <div className="colunas">
        <div className="colunas__principal">
          <SecaoContato paciente={p} aoSalvar={recarregar} />
          <SecaoAutorizacoes paciente={p} aoRegistrar={recarregar} />
        </div>
        <section className="bloco colunas__lateral" aria-labelledby="titulo-consultas">
          <h2 id="titulo-consultas" className="bloco__titulo">Consultas</h2>
          {consultas.isPending && <Carregando />}
          {consultas.isError && !consultas.data && <p className="nota">O Agendamento não respondeu; as consultas não puderam ser carregadas.</p>}
          {consultas.data && dele.length === 0 && <p className="nota">Nenhuma consulta ligada a este cadastro.</p>}
          {dele.length > 0 && (
            <>
              <p className="nota">{proximas.length ? `${proximas.length} próxima${proximas.length > 1 ? 's' : ''}` : 'Nenhuma consulta futura'}, {dele.length} no total.</p>
              <ol className="historico-consultas">
                {dele.map((c) => (
                  <li key={c.id} className={c.status === 'cancelada' ? 'historico-consultas__item--cancelada' : ''}>
                    <Link to={`/agenda?dia=${chaveDia(c.inicio)}`} className="historico-consultas__data">{dataHora(c.inicio)}</Link>
                    <span className="historico-consultas__prof">{c.profissional}</span>
                    {c.status === 'cancelada' && <Selo tom="perigo">Cancelada</Selo>}
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
