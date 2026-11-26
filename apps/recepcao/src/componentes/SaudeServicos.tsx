import { useEffect, useState } from 'react';
import { requisitar } from '../api/http';
import { Selo } from './Selo';

const SERVICOS = ['agendamento', 'cadastro', 'notificacao'] as const;
type Servico = typeof SERVICOS[number];
type Estado = 'consultando' | 'disponivel' | 'indisponivel';
const NOMES: Record<Servico, string> = { agendamento: 'Agendamento', cadastro: 'Cadastro', notificacao: 'Notificação' };

export function SaudeServicos() {
  const [estados, setEstados] = useState<Record<Servico, Estado>>({ agendamento: 'consultando', cadastro: 'consultando', notificacao: 'consultando' });
  useEffect(() => {
    let ativo = true;
    let pendente = false;
    const controle = new AbortController();
    async function verificar() {
      if (pendente) return;
      pendente = true;
      await Promise.all(SERVICOS.map(async servico => {
        let estado: Estado = 'indisponivel';
        try {
          const resposta = await requisitar<{ status: string }>(`/api/${servico}/saude`, { signal: AbortSignal.any([controle.signal, AbortSignal.timeout(5000)]), cache: 'no-store' });
          if (resposta.status === 'ok') estado = 'disponivel';
        } catch { /* Falha de resposta não é disponibilidade confirmada. */ }
        if (ativo) setEstados(atual => ({ ...atual, [servico]: estado }));
      }));
      pendente = false;
    }
    void verificar();
    const timer = setInterval(verificar, 15000);
    return () => { ativo = false; controle.abort(); clearInterval(timer); };
  }, []);
  return <section className="cartao lista" aria-label="Disponibilidade dos serviços">
    <header className="lista__cabecalho"><h2 className="lista__titulo">Disponibilidade dos serviços</h2></header>
    {SERVICOS.map(servico => <div key={servico} className="lista__cabecalho">
      <span>{NOMES[servico]}</span>
      <Selo tom={estados[servico] === 'disponivel' ? 'sucesso' : estados[servico] === 'indisponivel' ? 'perigo' : 'neutro'}>
        {estados[servico] === 'disponivel' ? 'Respondendo' : estados[servico] === 'indisponivel' ? 'Sem resposta' : 'Consultando…'}
      </Selo>
    </div>)}
  </section>;
}
