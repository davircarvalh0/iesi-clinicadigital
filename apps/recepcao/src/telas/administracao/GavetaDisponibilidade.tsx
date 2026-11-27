import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { motivo } from '../../api/cliente';
import { agendamento } from '../../api/servicos';
import type { Disponibilidade, IntervaloDisponibilidade, Profissional } from '../../api/tipos';
import { Aviso, Carregando, Sobreposicao } from '../../ui/componentes';

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

/** US-26: grade semanal de horários livres do profissional (até 42 intervalos, sem sobreposição no mesmo dia). */
export function GavetaDisponibilidade({ profissional, aoFechar }: { profissional: Profissional; aoFechar: () => void }) {
  const disponibilidade = useQuery({
    queryKey: ['disponibilidade', profissional.id],
    queryFn: ({ signal }) => agendamento.disponibilidade(profissional.id, signal),
  });

  if (!disponibilidade.data) {
    return (
      <Sobreposicao titulo={`Horários de ${profissional.nome}`} lado largura="larga" aoFechar={aoFechar}>
        {disponibilidade.isPending && <Carregando texto="Carregando horários…" />}
        {disponibilidade.isError && <Aviso tom="perigo">Não foi possível carregar os horários: {motivo(disponibilidade.error)}.</Aviso>}
      </Sobreposicao>
    );
  }
  return <Formulario profissional={profissional} inicial={disponibilidade.data} aoFechar={aoFechar} />;
}

function Formulario({ profissional, inicial, aoFechar }: { profissional: Profissional; inicial: Disponibilidade; aoFechar: () => void }) {
  const cliente = useQueryClient();
  const [intervalos, setIntervalos] = useState<IntervaloDisponibilidade[]>(inicial.intervalos);
  const [erro, setErro] = useState<string | null>(null);
  const invalido = intervalos.some((i) => i.inicio >= i.fim);

  const adicionar = (diaSemana: number) => setIntervalos((atual) => [...atual, { diaSemana, inicio: '08:00', fim: '12:00' }]);
  const remover = (indice: number) => setIntervalos((atual) => atual.filter((_, i) => i !== indice));
  const atualizar = (indice: number, campo: 'inicio' | 'fim', valor: string) =>
    setIntervalos((atual) => atual.map((it, i) => (i === indice ? { ...it, [campo]: valor } : it)));

  const salvar = useMutation({
    mutationFn: () => agendamento.definirDisponibilidade(profissional.id, intervalos),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['disponibilidade', profissional.id] });
      aoFechar();
    },
    onError: (falha) => setErro(`Os horários não foram salvos: ${motivo(falha)}.`),
  });

  const enviar = (e: FormEvent) => { e.preventDefault(); if (invalido || salvar.isPending) return; setErro(null); salvar.mutate(); };

  return (
    <Sobreposicao titulo={`Horários de ${profissional.nome}`} lado largura="larga" aoFechar={aoFechar}
      subtitulo="Grade semanal usada para marcar consultas pelo horário disponível do profissional."
      rodape={<>
        <button type="button" className="botao botao--quieto" onClick={aoFechar}>Voltar</button>
        <button type="submit" form="disponibilidade" className="botao botao--primario" disabled={invalido || salvar.isPending}>
          {salvar.isPending ? 'Salvando…' : 'Salvar horários'}
        </button>
      </>}>
      <form id="disponibilidade" className="formulario" onSubmit={enviar}>
        {DIAS_SEMANA.map((nomeDia, dia) => {
          const doDia = intervalos.filter((it) => it.diaSemana === dia).length;
          return (
          <div key={dia} className="disponibilidade__dia">
            <h3 className="disponibilidade__titulo">{nomeDia}</h3>
            {intervalos.map((it, indice) => {
              if (it.diaSemana !== dia) return null;
              // Mais de um horário no dia: distingue "Início, Segunda-feira 1" de "...2" pro leitor de tela.
              const posicao = intervalos.slice(0, indice).filter((x) => x.diaSemana === dia).length + 1;
              const rotuloDia = doDia > 1 ? `${nomeDia} ${posicao}` : nomeDia;
              return (
                <div key={indice} className="disponibilidade__intervalo">
                  <input type="time" step={300} value={it.inicio} aria-label={`Início, ${rotuloDia}`}
                    onChange={(e) => atualizar(indice, 'inicio', e.target.value)} required />
                  <span>às</span>
                  <input type="time" step={300} value={it.fim} aria-label={`Fim, ${rotuloDia}`}
                    onChange={(e) => atualizar(indice, 'fim', e.target.value)} required />
                  {it.inicio >= it.fim && <span className="campo__erro">O início deve ser antes do fim.</span>}
                  <button type="button" className="botao botao--quieto botao--icone" onClick={() => remover(indice)} aria-label={`Remover horário, ${rotuloDia}`}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
            <button type="button" className="botao botao--quieto" onClick={() => adicionar(dia)}>
              <Plus size={14} aria-hidden="true" /> Adicionar horário
            </button>
          </div>
          );
        })}
        <p className="nota">Dia sem nenhum horário fica sem vagas livres. Salvar substitui a semana inteira.</p>
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
      </form>
    </Sobreposicao>
  );
}
