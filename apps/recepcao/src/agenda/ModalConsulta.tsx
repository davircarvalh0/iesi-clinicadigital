import { useEffect, useRef, useState, type FormEvent } from 'react';
import { agendamentoApi } from '../api/agendamento';
import { cadastroApi, type PacienteAgendamento } from '../api/cadastro';
import { ESPECIALIDADES, PROFISSIONAIS } from '../dados/profissionais';
import { chaveDia, chaveDiaDaqui, dataHora, hora, isoRecife, mascaraCpf, mascaraTelefone } from '../formatacao';
import type { Consulta } from '../tipos';

export type ModoModal = { tipo: 'nova' } | { tipo: 'remarcar'; consulta: Consulta };

interface Props {
  modo: ModoModal;
  aoFechar: () => void;
  aoSalvar: () => Promise<unknown>;
}

type Form = typeof FORM_VAZIO;
type Busca =
  | { estado: 'inicial' | 'buscando' | 'novo' }
  | { estado: 'encontrado'; paciente: PacienteAgendamento }
  | { estado: 'indisponivel'; continuar: boolean };

const FORM_VAZIO = {
  nome: '',
  cpf: '',
  telefone: '',
  profissional: PROFISSIONAIS[0].nome,
  especialidade: PROFISSIONAIS[0].especialidade,
  data: chaveDiaDaqui(1),
  hora: '10:00',
};

function formInicial(modo: ModoModal): Form {
  if (modo.tipo === 'nova') return FORM_VAZIO;
  const inicio = new Date(modo.consulta.inicio);
  return { ...FORM_VAZIO, data: chaveDia(inicio), hora: hora(modo.consulta.inicio) };
}

export function ModalConsulta({ modo, aoFechar, aoSalvar }: Props) {
  const remarcando = modo.tipo === 'remarcar';
  const [form, setForm] = useState<Form>(() => formInicial(modo));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState<Busca>({ estado: 'inicial' });
  const requisicao = useRef<AbortController | null>(null);
  const paciente = busca.estado === 'encontrado' ? busca.paciente : null;
  const podePreencher = busca.estado === 'novo' || (busca.estado === 'indisponivel' && busca.continuar);
  const podeSalvar = remarcando || paciente !== null || podePreencher;
  const cpfCompleto = form.cpf.replace(/\D/g, '').length === 11;

  useEffect(() => () => requisicao.current?.abort(), []);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  const alterar = (dados: Partial<Form>) => setForm((atual) => ({ ...atual, ...dados }));

  const escolherProfissional = (nome: string) => {
    const profissional = PROFISSIONAIS.find((p) => p.nome === nome);
    alterar({ profissional: nome, especialidade: profissional?.especialidade ?? form.especialidade });
  };

  const alterarCpf = (valor: string) => {
    const cpf = mascaraCpf(valor);
    if (cpf === form.cpf) return;
    requisicao.current?.abort();
    setBusca({ estado: 'inicial' });
    setErro(null);
    alterar({ cpf, nome: '', telefone: '' });
  };

  const buscarCpf = async () => {
    if (!cpfCompleto || enviando || paciente || busca.estado === 'buscando') return;
    requisicao.current?.abort();
    const controller = new AbortController();
    requisicao.current = controller;
    setBusca({ estado: 'buscando' });
    setErro(null);
    try {
      const resultado = await cadastroApi.buscarPorCpf(form.cpf, controller.signal);
      if (controller.signal.aborted) return;
      if (resultado.paciente) {
        alterar({ nome: resultado.paciente.nome, telefone: mascaraTelefone(resultado.paciente.telefone) });
        setBusca({ estado: 'encontrado', paciente: resultado.paciente });
      } else {
        setBusca({ estado: 'novo' });
      }
    } catch {
      if (!controller.signal.aborted) setBusca({ estado: 'indisponivel', continuar: false });
    }
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!podeSalvar || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const inicio = isoRecife(form.data, form.hora);
      if (modo.tipo === 'remarcar') {
        await agendamentoApi.remarcar(modo.consulta.id, inicio);
      } else {
        const { data: _data, hora: _hora, ...dados } = form;
        await agendamentoApi.agendar({
          ...dados, inicio, idPaciente: paciente?.id,
          telefone: paciente?.telefone ?? dados.telefone,
        });
      }
      await aoSalvar();
      aoFechar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="modal__fundo" onMouseDown={aoFechar}>
      <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={enviar}>
        <h2 className="modal__titulo">{remarcando ? 'Remarcar consulta' : 'Nova consulta'}</h2>

        {modo.tipo === 'remarcar' && (
          <p className="modal__subtitulo">
            {modo.consulta.pacienteNome} · {modo.consulta.profissional} · atual: {dataHora(modo.consulta.inicio)}
          </p>
        )}

        {!remarcando && (
          <>
            <div className="modal__busca campo--inteiro">
              <label className="campo">
                CPF
                <input
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  required
                  disabled={enviando}
                  value={form.cpf}
                  onChange={(e) => alterarCpf(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    void buscarCpf();
                  }}
                />
              </label>
              <button type="button" className="botao botao--secundario"
                disabled={!cpfCompleto || busca.estado === 'buscando' || paciente !== null || enviando} onClick={buscarCpf}>
                {busca.estado === 'indisponivel' ? 'Tentar novamente' : 'Buscar CPF'}
              </button>
            </div>
            <div className="campo--inteiro" role="status">
              {busca.estado === 'buscando' && <p>Buscando no Cadastro…</p>}
              {busca.estado === 'encontrado' && <p>Paciente encontrado no Cadastro.</p>}
              {busca.estado === 'novo' && <p>CPF ainda não cadastrado. Preencha nome e telefone.</p>}
              {busca.estado === 'indisponivel' && (
                <p className="aviso aviso--erro">
                  Cadastro indisponível. Você pode tentar novamente ou agendar com dados manuais.
                  O vínculo fica pendente até o Cadastro voltar e processar a consulta.
                </p>
              )}
            </div>
            {busca.estado === 'indisponivel' && !busca.continuar && (
              <div className="campo--inteiro">
                <button type="button" className="botao botao--secundario"
                  onClick={() => setBusca({ estado: 'indisponivel', continuar: true })}>Continuar com dados manuais</button>
              </div>
            )}
            <label className="campo">
              Nome
              <input placeholder="Nome completo" required value={form.nome}
                disabled={(!paciente && !podePreencher) || enviando} readOnly={!!paciente}
                onChange={(e) => alterar({ nome: e.target.value })} />
            </label>
            <label className="campo">
              Telefone (WhatsApp)
              <input
                placeholder="(81) 90000-0000"
                inputMode="tel"
                required
                disabled={(!paciente && !podePreencher) || enviando}
                readOnly={!!paciente}
                value={form.telefone}
                onChange={(e) => alterar({ telefone: mascaraTelefone(e.target.value) })}
              />
            </label>
            <label className="campo">
              Profissional
              <select value={form.profissional} onChange={(e) => escolherProfissional(e.target.value)}>
                {PROFISSIONAIS.map((p) => <option key={p.nome}>{p.nome}</option>)}
              </select>
            </label>
            <label className="campo">
              Especialidade
              <select value={form.especialidade} onChange={(e) => alterar({ especialidade: e.target.value })}>
                {ESPECIALIDADES.map((e) => <option key={e}>{e}</option>)}
              </select>
            </label>
          </>
        )}

        <label className="campo">
          Data
          <input type="date" required value={form.data} onChange={(e) => alterar({ data: e.target.value })} />
        </label>
        <label className="campo">
          Hora
          <input type="time" required value={form.hora} onChange={(e) => alterar({ hora: e.target.value })} />
        </label>

        {erro && <p className="aviso aviso--erro campo--inteiro">{erro}</p>}

        <div className="modal__acoes">
          <button type="button" className="botao botao--secundario" onClick={aoFechar}>Voltar</button>
          <button type="submit" className="botao botao--primario" disabled={enviando || !podeSalvar}>
            {remarcando ? 'Remarcar consulta' : 'Agendar consulta'}
          </button>
        </div>
      </form>
    </div>
  );
}
