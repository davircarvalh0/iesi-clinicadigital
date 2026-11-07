import { useEffect, useRef, useState, type FormEvent } from 'react';
import { cadastroApi, type Paciente } from '../api/cadastro';
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
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [conflito, setConflito] = useState(false);
  useEffect(() => {
    const el = dialogo.current!;
    el.showModal();
    return () => el.close();
  }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (salvando || conflito) return;
    const digitos = telefone.replace(/\D/g, '');
    if (!/^[1-9]\d{9,10}$/.test(digitos)) { setErro('Informe um telefone com DDD e 10 ou 11 dígitos.'); return; }
    setErro(null); setSalvando(true);
    try {
      const salvo = await cadastroApi.atualizar(paciente.id, { telefone: digitos, email: email.trim() || null, revisao: paciente.revisao });
      aoSalvar(salvo);
    } catch (e) {
      setConflito(e instanceof ErroApi && (e.status === 409 || e.status === 404));
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar. Confira a conexão e tente novamente.');
    } finally { setSalvando(false); }
  }
  return (
    <dialog ref={dialogo} className="dialogo-contato" aria-labelledby="titulo-contato"
      onCancel={(e) => { e.preventDefault(); if (!salvando) aoFechar(); }}>
      <form className="modal" onSubmit={enviar} aria-busy={salvando}>
        <h2 id="titulo-contato" className="modal__titulo">Editar contatos</h2>
        <p className="modal__subtitulo">{paciente.nome} · CPF {mascaraCpf(paciente.cpf)}</p>
        <label className="campo campo--inteiro">Telefone (com DDD)
          <input autoFocus type="tel" inputMode="tel" autoComplete="tel-national" required maxLength={15}
            value={telefone} disabled={salvando || conflito} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} />
        </label>
        <label className="campo campo--inteiro">E-mail (opcional)
          <input type="email" autoComplete="email" maxLength={254} value={email}
            disabled={salvando || conflito} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {erro && <p className="aviso aviso--erro campo--inteiro" role="alert">{erro}</p>}
        <div className="modal__acoes">
          <button type="button" className="botao botao--secundario" disabled={salvando} onClick={aoFechar}>Cancelar</button>
          {conflito ? <button type="button" className="botao botao--primario" onClick={aoRecarregar}>Recarregar cadastro</button>
            : <button className="botao botao--primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar contatos'}</button>}
        </div>
      </form>
    </dialog>
  );
}
