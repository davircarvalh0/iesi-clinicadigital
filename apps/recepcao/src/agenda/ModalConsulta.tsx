import { useEffect, useState, type FormEvent } from 'react';
import { agendamentoApi } from '../api/agendamento';
import { PACIENTE_PADRAO, pacienteNovo } from '../dados/exemplos';
import { ESPECIALIDADES, PROFISSIONAIS } from '../dados/profissionais';
import { chaveDia, chaveDiaDaqui, dataHora, hora, isoRecife, mascaraCpf, mascaraTelefone } from '../formatacao';
import type { Consulta } from '../tipos';

export type ModoModal = { tipo: 'nova' } | { tipo: 'remarcar'; consulta: Consulta };

interface Props {
  modo: ModoModal;
  consultas: Consulta[];
  aoFechar: () => void;
  aoSalvar: () => Promise<unknown>;
}

type Form = typeof FORM_VAZIO;
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

export function ModalConsulta({ modo, consultas, aoFechar, aoSalvar }: Props) {
  const remarcando = modo.tipo === 'remarcar';
  const [form, setForm] = useState<Form>(() => formInicial(modo));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

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

  const preencherNovo = () => {
    const p = pacienteNovo(consultas.map((c) => c.pacienteNome));
    alterar({ nome: p.nome, cpf: mascaraCpf(p.cpf), telefone: mascaraTelefone(p.telefone) });
  };

  const preencherCadastrado = () => {
    const c = consultas[0];
    const p = c ? { nome: c.pacienteNome, cpf: c.pacienteCpf, telefone: c.pacienteTelefone } : PACIENTE_PADRAO;
    alterar({ nome: p.nome, cpf: mascaraCpf(p.cpf), telefone: mascaraTelefone(p.telefone) });
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const inicio = isoRecife(form.data, form.hora);
      if (modo.tipo === 'remarcar') {
        await agendamentoApi.remarcar(modo.consulta.id, inicio);
      } else {
        const { data: _data, hora: _hora, ...paciente } = form;
        await agendamentoApi.agendar({ ...paciente, inicio });
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

        {modo.tipo === 'remarcar' ? (
          <p className="modal__subtitulo">
            {modo.consulta.pacienteNome} · {modo.consulta.profissional} · atual: {dataHora(modo.consulta.inicio)}
          </p>
        ) : (
          <p className="modal__exemplos">
            Preencher exemplo:
            <button type="button" className="chip chip--marca" onClick={preencherNovo}>paciente novo</button>
            <button type="button" className="chip chip--info" onClick={preencherCadastrado}>CPF já cadastrado</button>
          </p>
        )}

        {!remarcando && (
          <>
            <label className="campo campo--inteiro">
              Nome
              <input placeholder="Nome completo" required value={form.nome} onChange={(e) => alterar({ nome: e.target.value })} />
            </label>
            <label className="campo">
              CPF
              <input
                placeholder="000.000.000-00"
                inputMode="numeric"
                required
                value={form.cpf}
                onChange={(e) => alterar({ cpf: mascaraCpf(e.target.value) })}
              />
            </label>
            <label className="campo">
              Telefone (WhatsApp)
              <input
                placeholder="(81) 90000-0000"
                inputMode="tel"
                required
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
          <button type="submit" className="botao botao--primario" disabled={enviando}>
            {remarcando ? 'Remarcar consulta' : 'Agendar consulta'}
          </button>
        </div>
      </form>
    </div>
  );
}
