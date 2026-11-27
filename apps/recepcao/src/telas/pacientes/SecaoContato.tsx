import { useMutation } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { motivo, statusDe, tipoDaFalha } from '../../api/cliente';
import { cadastro } from '../../api/servicos';
import type { Canal, PacienteDetalhado } from '../../api/tipos';
import { hoje } from '../../dominio/datas';
import { mascararTelefoneDigitado, soDigitos, telefone } from '../../dominio/documentos';
import { Aviso, Campo } from '../../ui/componentes';
import { NOME_CANAL } from './canais';

export function SecaoContato({ paciente: p, aoSalvar }: { paciente: PacienteDetalhado; aoSalvar: () => Promise<unknown> }) {
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'perigo' | 'alerta'; texto: string } | null>(null);

  return (
    <section className="bloco" aria-labelledby="titulo-contato">
      <header className="bloco__topo">
        <h2 id="titulo-contato" className="bloco__titulo">Contato e dados</h2>
        {!editando && <button type="button" className="botao botao--quieto" onClick={() => { setAviso(null); setEditando(true); }}><Pencil size={15} aria-hidden="true" /> Editar</button>}
      </header>
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
      {editando
        ? <Formulario paciente={p} aoCancelar={() => setEditando(false)} aoConcluir={async (resultado) => { setAviso(resultado); if (resultado.tom === 'ok') setEditando(false); await aoSalvar(); }} />
        : (
          <dl className="dados">
            <div><dt>Telefone</dt><dd>{telefone(p.telefone)}</dd></div>
            <div><dt>E-mail</dt><dd>{p.email ?? <span className="nota">não informado</span>}</dd></div>
            <div><dt>Nascimento</dt><dd>{p.nascimento ? p.nascimento.slice(0, 10).split('-').reverse().join('/') : <span className="nota">não informado</span>}</dd></div>
            <div><dt>Convênio</dt><dd>{p.convenio ?? <span className="nota">particular ou não informado</span>}</dd></div>
            <div><dt>Canal preferido</dt><dd>{p.canalPreferido ? NOME_CANAL[p.canalPreferido] : <span className="nota">não informado</span>}</dd></div>
          </dl>
        )}
    </section>
  );
}

type Resultado = { tom: 'ok' | 'perigo' | 'alerta'; texto: string };

function Formulario({ paciente: p, aoCancelar, aoConcluir }: { paciente: PacienteDetalhado; aoCancelar: () => void; aoConcluir: (r: Resultado) => Promise<void> }) {
  const [fone, setFone] = useState(telefone(p.telefone));
  const [email, setEmail] = useState(p.email ?? '');
  const [nascimento, setNascimento] = useState(p.nascimento?.slice(0, 10) ?? '');
  const [convenio, setConvenio] = useState(p.convenio ?? '');
  const [canal, setCanal] = useState<Canal | ''>(p.canalPreferido ?? '');

  const salvar = useMutation({
    mutationFn: () => cadastro.atualizar(p.id, {
      telefone: soDigitos(fone), email: email.trim() || null, nascimento: nascimento || null,
      convenio: convenio.trim() || null, canalPreferido: canal || null, revisao: p.revisao,
    }),
    onSuccess: () => aoConcluir({ tom: 'ok', texto: 'Dados salvos. Os outros serviços recebem a atualização em instantes.' }),
    onError: (falha) => aoConcluir(
      statusDe(falha) === 409
        ? { tom: 'alerta', texto: 'Outra pessoa alterou este cadastro enquanto você editava. Os dados foram recarregados: confira e salve de novo.' }
        : tipoDaFalha(falha) === 'incerta'
          ? { tom: 'alerta', texto: 'O Cadastro não respondeu, então não dá para saber se os dados foram salvos. Confira antes de salvar de novo.' }
          : { tom: 'perigo', texto: `Os dados não foram salvos: ${motivo(falha)}.` },
    ),
  });

  const enviar = (e: FormEvent) => { e.preventDefault(); if (!salvar.isPending) salvar.mutate(); };

  return (
    <form className="formulario" onSubmit={enviar}>
      <div className="formulario__linha">
        <Campo rotulo="Telefone (WhatsApp)"><input inputMode="tel" required value={fone} onChange={(e) => setFone(mascararTelefoneDigitado(e.target.value))} /></Campo>
        <Campo rotulo="E-mail"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
      </div>
      <div className="formulario__linha">
        <Campo rotulo="Nascimento"><input type="date" max={hoje()} value={nascimento} onChange={(e) => setNascimento(e.target.value)} /></Campo>
        <Campo rotulo="Convênio"><input value={convenio} maxLength={120} onChange={(e) => setConvenio(e.target.value)} placeholder="Deixe vazio se particular" /></Campo>
      </div>
      <Campo rotulo="Canal preferido">
        <select value={canal} onChange={(e) => setCanal(e.target.value as Canal | '')}>
          <option value="">Não informado</option>
          {(Object.keys(NOME_CANAL) as Canal[]).map((c) => <option key={c} value={c}>{NOME_CANAL[c]}</option>)}
        </select>
      </Campo>
      <div className="formulario__acoes">
        <button type="button" className="botao botao--quieto" onClick={aoCancelar}>Descartar alterações</button>
        <button type="submit" className="botao botao--primario" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando…' : 'Salvar dados'}</button>
      </div>
    </form>
  );
}
