import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { motivo } from '../../api/cliente';
import { portal } from '../../api/servicos';
import { hoje, hora } from '../../dominio/datas';
import { Aviso, Campo, Sobreposicao } from '../../ui/componentes';

interface Props {
  aoFechar: () => void;
  aoAgendar: () => void;
}

/** US-27: o paciente marca a própria consulta num horário livre da grade do profissional. */
export function GavetaNovaConsultaPaciente({ aoFechar, aoAgendar }: Props) {
  const [profissionalId, setProfissionalId] = useState('');
  const [dia, setDia] = useState(hoje());
  const [horarioEscolhido, setHorarioEscolhido] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const profissionais = useQuery({ queryKey: ['portal', 'profissionais'], queryFn: ({ signal }) => portal.profissionais(signal), staleTime: 60_000 });
  const horarios = useQuery({
    queryKey: ['portal', 'horarios', profissionalId, dia],
    queryFn: ({ signal }) => portal.horariosDisponiveis(profissionalId, dia, signal),
    enabled: !!profissionalId,
  });

  const mudarProfissional = (id: string) => { setProfissionalId(id); setHorarioEscolhido(null); setErro(null); };
  const mudarDia = (d: string) => { setDia(d); setHorarioEscolhido(null); setErro(null); };

  const solicitar = useMutation({
    mutationFn: () => portal.solicitar({ profissionalId, inicio: horarioEscolhido! }),
    onSuccess: () => { aoAgendar(); aoFechar(); },
    onError: (e) => setErro(`Não foi possível marcar: ${motivo(e)}.`),
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!horarioEscolhido || solicitar.isPending) return;
    setErro(null);
    solicitar.mutate();
  };

  return (
    <Sobreposicao lado titulo="Marcar consulta" aoFechar={aoFechar} rodape={<>
      <button type="button" className="botao botao--quieto" onClick={aoFechar}>Voltar</button>
      <button type="submit" form="nova-consulta-paciente" className="botao botao--primario" disabled={!horarioEscolhido || solicitar.isPending}>
        {solicitar.isPending ? 'Marcando…' : 'Marcar consulta'}
      </button>
    </>}>
      <form id="nova-consulta-paciente" className="formulario" onSubmit={enviar}>
        <Campo rotulo="Profissional" erro={profissionais.isError ? 'Não foi possível carregar os profissionais. Feche e abra de novo.' : null}>
          <select value={profissionalId} onChange={(e) => mudarProfissional(e.target.value)} required disabled={!profissionais.data?.length}>
            <option value="">{profissionais.isLoading ? 'Carregando…' : 'Escolha'}</option>
            {profissionais.data?.map((p) => <option key={p.id} value={p.id}>{p.nome} · {p.especialidade}</option>)}
          </select>
        </Campo>

        <Campo rotulo="Data">
          <input type="date" min={hoje()} value={dia} onChange={(e) => mudarDia(e.target.value)} required disabled={!profissionalId} />
        </Campo>

        {profissionalId && (
          <div>
            <p className="campo__rotulo">Horário</p>
            {horarios.isLoading && <p className="nota">Procurando horários livres…</p>}
            {horarios.isError && <Aviso tom="perigo">Não foi possível carregar os horários. Tente outra data.</Aviso>}
            {horarios.data && horarios.data.horarios.length === 0 && <p className="nota">Nenhum horário livre nesse dia. Tente outra data.</p>}
            {!!horarios.data?.horarios.length && (
              <div className="grade-horarios">
                {horarios.data.horarios.map((h) => (
                  <button key={h} type="button"
                    className={`chip-horario ${horarioEscolhido === h ? 'chip-horario--escolhido' : ''}`}
                    aria-pressed={horarioEscolhido === h}
                    onClick={() => setHorarioEscolhido(h)}>
                    {hora(h)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {erro && <Aviso tom="perigo">{erro}</Aviso>}
      </form>
    </Sobreposicao>
  );
}
