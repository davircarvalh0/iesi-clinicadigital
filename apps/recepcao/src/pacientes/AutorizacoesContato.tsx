import { useEffect, useState } from 'react';
import { cadastroApi, type Autorizacao, type CanalContato, type OrigemAutorizacao } from '../api/cadastro';
import { ErroApi } from '../api/http';
import { notificacaoApi } from '../api/notificacao';
import { Selo, type TomSelo } from '../componentes/Selo';

export const NOME_CANAL: Record<CanalContato, string> = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'E-mail' };
const NOME_ORIGEM: Record<OrigemAutorizacao, string> = { presencial: 'Presencial', telefone: 'Telefone', formulario: 'Formulário' };
const SITUACAO: Record<Autorizacao['situacao'], { tom: TomSelo; texto: string }> = {
  autorizado: { tom: 'sucesso', texto: 'Autorizado' },
  revogado: { tom: 'perigo', texto: 'Revogado' },
  sem_registro: { tom: 'neutro', texto: 'Sem autorização' },
};

const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Recife' });

type Sincronia = { estado: 'verificando' } | { estado: 'indisponivel' } | { estado: 'pronto'; versoes: Record<string, number> };
const MAX_VERIFICACOES = 15;

interface Props {
  idPaciente: string;
  autorizacoes: Autorizacao[];
  desabilitado: boolean;
  aoAlterar: (autorizacoes: Autorizacao[]) => void;
}

/**
 * Registra autorizações e revogações no Cadastro e mostra se a cópia da Notificação, usada no envio,
 * já recebeu a mesma versão. Diferença persistente fica visível como inconsistência.
 */
export function AutorizacoesContato({ idPaciente, autorizacoes, desabilitado, aoAlterar }: Props) {
  const [origem, setOrigem] = useState<OrigemAutorizacao>('presencial');
  const [registrando, setRegistrando] = useState<CanalContato | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sincronia, setSincronia] = useState<Sincronia>({ estado: 'verificando' });
  // `ciclo` dispara uma nova leitura; `tentativas` conta leituras desde a última alteração.
  const [ciclo, setCiclo] = useState(0);
  const [tentativas, setTentativas] = useState(0);

  const pendentes = sincronia.estado === 'pronto'
    ? autorizacoes.filter((a) => (sincronia.versoes[a.canal] ?? 0) !== a.versao) : [];
  const aguardando = pendentes.length > 0 && tentativas < MAX_VERIFICACOES;

  useEffect(() => {
    const controle = new AbortController();
    const timer = setTimeout(() => {
      notificacaoApi.copiaAutorizacoes(idPaciente, controle.signal).then(({ autorizacoes: copias }) => {
        if (!controle.signal.aborted) setSincronia({ estado: 'pronto', versoes: Object.fromEntries(copias.map((c) => [c.canal, c.versao])) });
      }).catch(() => { if (!controle.signal.aborted) setSincronia({ estado: 'indisponivel' }); });
    }, ciclo === 0 ? 0 : 2000);
    return () => { controle.abort(); clearTimeout(timer); };
  }, [idPaciente, ciclo]);

  // Enquanto houver diferença, lê de novo por alguns ciclos antes de declarar inconsistência.
  useEffect(() => {
    if (!aguardando) return;
    setTentativas((n) => n + 1);
    setCiclo((n) => n + 1);
  }, [sincronia]); // eslint-disable-line react-hooks/exhaustive-deps

  async function registrar(canal: CanalContato, situacao: 'autorizado' | 'revogado') {
    setErro(null); setRegistrando(canal);
    try {
      const { autorizacoes: novas } = await cadastroApi.registrarAutorizacao(idPaciente, { canal, situacao, origem });
      aoAlterar(novas);
      setTentativas(0);
      setCiclo((n) => n + 1);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível registrar. Confira a conexão e tente novamente.');
    } finally { setRegistrando(null); }
  }

  function textoSincronia(a: Autorizacao) {
    if (sincronia.estado === 'verificando') return { classe: '', texto: 'Verificando Notificação…' };
    if (sincronia.estado === 'indisponivel') return { classe: 'autorizacao__sinc--alerta', texto: 'Notificação indisponível: não foi possível conferir a cópia usada no envio.' };
    const copia = sincronia.versoes[a.canal] ?? 0;
    if (copia === a.versao) return { classe: 'autorizacao__sinc--ok', texto: a.versao ? 'Notificação sincronizada' : 'Notificação também sem registro' };
    if (aguardando) return { classe: '', texto: 'Aguardando a Notificação receber a alteração…' };
    return {
      classe: 'autorizacao__sinc--alerta',
      texto: `Inconsistência: a Notificação usa a versão ${copia || 'nenhuma'} e o Cadastro tem a versão ${a.versao}. Lembretes seguem a cópia da Notificação.`,
    };
  }

  return (
    <fieldset className="autorizacoes campo--inteiro" disabled={desabilitado || registrando !== null}>
      <legend>Autorização de contato</legend>
      <p className="autorizacoes__ajuda">Sem autorização registrada, nenhum lembrete é enviado pelo canal.</p>
      <label className="campo">Como o paciente informou
        <select value={origem} onChange={(e) => setOrigem(e.target.value as OrigemAutorizacao)}>
          {Object.entries(NOME_ORIGEM).map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
        </select>
      </label>
      <ul className="autorizacoes__lista">
        {autorizacoes.map((a) => {
          const sinc = textoSincronia(a);
          return (
            <li key={a.canal} className="autorizacao">
              <div className="autorizacao__topo">
                <strong>{NOME_CANAL[a.canal]}</strong>
                <Selo tom={SITUACAO[a.situacao].tom}>{SITUACAO[a.situacao].texto}</Selo>
              </div>
              {a.registradoEm && a.origem && (
                <span className="autorizacao__meta">
                  Versão {a.versao} · {fmt.format(new Date(a.registradoEm))} · {NOME_ORIGEM[a.origem]}
                </span>
              )}
              <span className={`autorizacao__sinc ${sinc.classe}`} role={sinc.classe.includes('alerta') ? 'alert' : undefined}>{sinc.texto}</span>
              <div className="autorizacao__acoes">
                {a.situacao !== 'autorizado' && <button type="button" className="acao" onClick={() => registrar(a.canal, 'autorizado')}>
                  {registrando === a.canal ? 'Registrando…' : 'Registrar autorização'}
                </button>}
                {a.situacao === 'autorizado' && <button type="button" className="acao acao--perigo" onClick={() => registrar(a.canal, 'revogado')}>
                  {registrando === a.canal ? 'Registrando…' : 'Registrar revogação'}
                </button>}
              </div>
            </li>
          );
        })}
      </ul>
      {erro && <p className="aviso aviso--erro" role="alert">{erro}</p>}
    </fieldset>
  );
}
