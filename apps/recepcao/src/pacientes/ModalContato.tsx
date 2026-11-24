import { useEffect, useRef, useState, type FormEvent } from 'react';
import { cadastroApi, type Paciente, type PacienteDetalhe } from '../api/cadastro';
import { ErroApi } from '../api/http';
import { mascaraCpf, mascaraTelefone } from '../formatacao';

interface Props {
  paciente: Paciente;
  aoFechar: () => void;
  aoSalvar: (paciente: Paciente) => void;
  aoRecarregar: () => void;
}

export function ModalContato({ paciente, aoFechar, aoSalvar, aoRecarregar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [telefone, setTelefone] = useState(mascaraTelefone(paciente.telefone));
  const [email, setEmail] = useState(paciente.email ?? '');
  const [nascimento, setNascimento] = useState('');
  const [convenio, setConvenio] = useState('');
  const [detalhe, setDetalhe] = useState<PacienteDetalhe | null>(null);
  const [falhaDetalhe, setFalhaDetalhe] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [conflito, setConflito] = useState(false);
  useEffect(() => {
    const el = dialogo.current!;
    el.showModal();
    return () => el.close();
  }, []);
  useEffect(() => {
    const controle = new AbortController();
    cadastroApi.detalhar(paciente.id, controle.signal).then((dados) => {
      if (controle.signal.aborted) return;
      setTelefone(mascaraTelefone(dados.telefone));
      setEmail(dados.email ?? '');
      setNascimento(dados.nascimento ?? '');
      setConvenio(dados.convenio ?? '');
      setDetalhe(dados);
    }).catch(() => {
      if (!controle.signal.aborted) setFalhaDetalhe(true);
    });
    return () => controle.abort();
  }, [paciente.id, tentativa]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!detalhe || salvando || conflito) return;
    const digitos = telefone.replace(/\D/g, '');
    if (!/^[1-9]\d{9,10}$/.test(digitos)) { setErro('Informe um telefone com DDD e 10 ou 11 dígitos.'); return; }
    setErro(null); setSalvando(true);
    try {
      const salvo = await cadastroApi.atualizar(paciente.id, {
        telefone: digitos, email: email.trim() || null, nascimento: nascimento || null,
        convenio: convenio.trim() || null, revisao: detalhe.revisao,
      });
      aoSalvar(salvo);
    } catch (e) {
      setConflito(e instanceof ErroApi && (e.status === 409 || e.status === 404));
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar. Confira a conexão e tente novamente.');
    } finally { setSalvando(false); }
  }
  return (
    <dialog ref={dialogo} className="dialogo-contato" aria-labelledby="titulo-contato"
      onCancel={(e) => { e.preventDefault(); if (!salvando) aoFechar(); }}>
      <form className="modal" onSubmit={enviar} aria-busy={salvando || (!detalhe && !falhaDetalhe)}>
        <h2 id="titulo-contato" className="modal__titulo">Editar cadastro</h2>
        <p className="modal__subtitulo">{paciente.nome} · CPF {mascaraCpf(paciente.cpf)}</p>
        {!detalhe && !falhaDetalhe && <p className="campo--inteiro" role="status">Carregando cadastro…</p>}
        {falhaDetalhe && <p className="aviso aviso--erro campo--inteiro" role="alert">Não foi possível carregar o cadastro.</p>}
        {detalhe && <>
        <label className="campo campo--inteiro">Telefone (com DDD)
          <input autoFocus type="tel" inputMode="tel" autoComplete="tel-national" required maxLength={15}
            value={telefone} disabled={salvando || conflito} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} />
        </label>
        <label className="campo campo--inteiro">Nascimento (opcional)
          <input type="date" autoComplete="bday" value={nascimento}
            disabled={salvando || conflito} onChange={(e) => setNascimento(e.target.value)} />
        </label>
        <label className="campo campo--inteiro">Convênio (opcional)
          <input type="text" maxLength={120} value={convenio}
            disabled={salvando || conflito} onChange={(e) => setConvenio(e.target.value)} />
        </label>
        </>}
        <label className="campo campo--inteiro">E-mail (opcional)
          <input type="email" autoComplete="email" maxLength={254} value={email}
            disabled={salvando || conflito} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {erro && <p className="aviso aviso--erro campo--inteiro" role="alert">{erro}</p>}
        <div className="modal__acoes">
          <button type="button" className="botao botao--secundario" disabled={salvando} onClick={aoFechar}>Cancelar</button>
          {falhaDetalhe && <button type="button" className="botao botao--primario"
            onClick={() => { setFalhaDetalhe(false); setTentativa((n) => n + 1); }}>Tentar novamente</button>}
          {detalhe && (conflito ? <button type="button" className="botao botao--primario" onClick={aoRecarregar}>Recarregar cadastro</button>
            : <button className="botao botao--primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar cadastro'}</button>)}
        </div>
      </form>
    </dialog>
  );
}
