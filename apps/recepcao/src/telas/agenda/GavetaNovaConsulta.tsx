import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Search } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motivo, tipoDaFalha } from '../../api/cliente';
import { agendamento, cadastro } from '../../api/servicos';
import type { Consulta, PacienteDetalhado } from '../../api/tipos';
import { hoje, momentoRecife } from '../../dominio/datas';
import { cpfCompleto, mascararCpfDigitado, mascararTelefoneDigitado, soDigitos, telefone } from '../../dominio/documentos';
import { Aviso, Campo, Sobreposicao } from '../../ui/componentes';

type PacienteEncontrado = Pick<PacienteDetalhado, 'id' | 'cpf' | 'nome' | 'telefone'>;
type Busca =
  | { estado: 'inicial' | 'buscando' | 'novo' }
  | { estado: 'encontrado'; paciente: PacienteEncontrado }
  | { estado: 'indisponivel'; manual: boolean };

interface Props {
  diaSugerido: string;
  aoFechar: () => void;
  aoAgendar: (consulta: Consulta) => Promise<unknown>;
  aoFalhar: () => Promise<unknown>;
}

export function GavetaNovaConsulta({ diaSugerido, aoFechar, aoAgendar, aoFalhar }: Props) {
  const [cpf, setCpf] = useState('');
  const [busca, setBusca] = useState<Busca>({ estado: 'inicial' });
  const [nome, setNome] = useState('');
  const [fone, setFone] = useState('');
  const [profissional, setProfissional] = useState('');
  const [dia, setDia] = useState(diaSugerido);
  const [horario, setHorario] = useState('09:00');
  const [erro, setErro] = useState<string | null>(null);
  const pedido = useRef<AbortController | null>(null);

  const profissionais = useQuery({ queryKey: ['profissionais'], queryFn: ({ signal }) => agendamento.profissionais(signal), staleTime: 60_000 });
  const escolhido = profissionais.data?.find((p) => p.id === profissional);

  useEffect(() => () => pedido.current?.abort(), []);

  const buscar = async (valor = cpf) => {
    if (!cpfCompleto(valor)) return;
    pedido.current?.abort();
    const controle = new AbortController();
    pedido.current = controle;
    setBusca({ estado: 'buscando' });
    try {
      const { paciente } = await cadastro.buscarCpf(valor, controle.signal);
      if (controle.signal.aborted) return;
      if (paciente) {
        setBusca({ estado: 'encontrado', paciente });
        setNome(paciente.nome);
        setFone(telefone(paciente.telefone));
      } else {
        setBusca({ estado: 'novo' });
      }
    } catch {
      if (!controle.signal.aborted) setBusca({ estado: 'indisponivel', manual: false });
    }
  };

  const mudarCpf = (valor: string) => {
    const mascarado = mascararCpfDigitado(valor);
    if (soDigitos(mascarado) === soDigitos(cpf)) { setCpf(mascarado); return; }
    setCpf(mascarado);
    setErro(null);
    setNome('');
    setFone('');
    pedido.current?.abort();
    setBusca({ estado: 'inicial' });
    if (cpfCompleto(mascarado)) void buscar(mascarado);
  };

  const encontrado = busca.estado === 'encontrado' ? busca.paciente : null;
  const digitarDados = busca.estado === 'novo' || (busca.estado === 'indisponivel' && busca.manual);
  const pronto = !!escolhido && (encontrado !== null || (digitarDados && nome.trim().length >= 3 && soDigitos(fone).length >= 10));

  const agendar = useMutation({
    mutationFn: () => agendamento.agendar({
      idPaciente: encontrado?.id,
      nome: nome.trim(),
      cpf,
      telefone: encontrado ? encontrado.telefone : fone,
      profissional: escolhido!.nome,
      especialidade: escolhido!.especialidade,
      inicio: momentoRecife(dia, horario),
    }),
    onSuccess: async (consulta) => { await aoAgendar(consulta); aoFechar(); },
    onError: (falha) => {
      setErro(tipoDaFalha(falha) === 'incerta'
        ? 'O Agendamento não respondeu, então não dá para saber se a consulta foi gravada. Confira a agenda antes de tentar de novo.'
        : `A consulta não foi agendada: ${motivo(falha)}.`);
      void aoFalhar();
    },
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!pronto || agendar.isPending) return;
    setErro(null);
    agendar.mutate();
  };

  return (
    <Sobreposicao lado titulo="Nova consulta" aoFechar={aoFechar} rodape={<>
      <button type="button" className="botao botao--quieto" onClick={aoFechar}>Voltar</button>
      <button type="submit" form="nova-consulta" className="botao botao--primario" disabled={!pronto || agendar.isPending}>
        {agendar.isPending ? 'Agendando…' : 'Agendar consulta'}
      </button>
    </>}>
      <form id="nova-consulta" className="formulario" onSubmit={enviar}>
        <fieldset className="formulario__grupo">
          <legend>Paciente</legend>
          <div className="busca-cpf">
            <Campo rotulo="CPF" dica="O Cadastro reconhece quem já é paciente e preenche os dados.">
              <input inputMode="numeric" placeholder="000.000.000-00" value={cpf} autoComplete="off"
                onChange={(e) => mudarCpf(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void buscar(); } }} />
            </Campo>
            <button type="button" className="botao botao--secundario" disabled={!cpfCompleto(cpf) || busca.estado === 'buscando' || !!encontrado} onClick={() => void buscar()}>
              <Search size={16} aria-hidden="true" /> {busca.estado === 'indisponivel' ? 'Buscar de novo' : 'Buscar'}
            </button>
          </div>

          <div role="status" className="busca-cpf__resultado">
            {busca.estado === 'buscando' && <p className="nota">Procurando no Cadastro…</p>}
            {encontrado && (
              <div className="paciente-encontrado">
                <CheckCircle2 size={20} aria-hidden="true" />
                <div>
                  <p className="paciente-encontrado__nome">{encontrado.nome}</p>
                  <p className="paciente-encontrado__fone">{telefone(encontrado.telefone)}</p>
                  <p className="nota">Já é paciente. A consulta será ligada a este cadastro, sem digitar de novo.</p>
                </div>
              </div>
            )}
            {busca.estado === 'novo' && <p className="nota">CPF ainda não cadastrado. Preencha nome e telefone: o cadastro é criado junto com a consulta.</p>}
            {busca.estado === 'indisponivel' && (
              <Aviso tom="alerta" acao={!busca.manual && (
                <button type="button" className="botao botao--secundario" onClick={() => setBusca({ estado: 'indisponivel', manual: true })}>Digitar os dados</button>
              )}>
                O Cadastro não respondeu. Você pode buscar de novo ou digitar os dados. Nesse caso, a consulta fica com o vínculo pendente até o Cadastro voltar e reconhecer o CPF.
              </Aviso>
            )}
          </div>

          {digitarDados && (
            <div className="formulario__linha">
              <Campo rotulo="Nome completo">
                <input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" required />
              </Campo>
              <Campo rotulo="Telefone (WhatsApp)">
                <input inputMode="tel" placeholder="(81) 90000-0000" value={fone} onChange={(e) => setFone(mascararTelefoneDigitado(e.target.value))} required />
              </Campo>
            </div>
          )}
        </fieldset>

        <fieldset className="formulario__grupo">
          <legend>Consulta</legend>
          <Campo rotulo="Profissional" erro={profissionais.isError ? 'Não foi possível carregar os profissionais. Feche e abra de novo.' : null}
            dica={profissionais.data?.length === 0 ? 'Nenhum profissional cadastrado. A administração cadastra em Equipe e acessos.' : escolhido?.especialidade}>
            <select value={profissional} onChange={(e) => setProfissional(e.target.value)} required disabled={!profissionais.data?.length}>
              <option value="">{profissionais.isLoading ? 'Carregando…' : 'Escolha'}</option>
              {profissionais.data?.map((p) => <option key={p.id} value={p.id}>{p.nome} · {p.especialidade}</option>)}
            </select>
          </Campo>
          <div className="formulario__linha">
            <Campo rotulo="Data">
              <input type="date" min={hoje()} value={dia} onChange={(e) => setDia(e.target.value)} required />
            </Campo>
            <Campo rotulo="Horário">
              <input type="time" step={300} value={horario} onChange={(e) => setHorario(e.target.value)} required />
            </Campo>
          </div>
        </fieldset>

        {erro && <Aviso tom="perigo">{erro}</Aviso>}
      </form>
    </Sobreposicao>
  );
}
