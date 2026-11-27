import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { horaSeg } from '../dominio/datas';
import type { Frescor } from '../dominio/frescor';
import type { Tom } from '../dominio/lembretes';

export function Selo({ tom = 'neutro', children, titulo }: { tom?: Tom; children: ReactNode; titulo?: string }) {
  return <span className={`selo selo--${tom}`} title={titulo}>{children}</span>;
}

export function Aviso({ tom = 'alerta', children, acao }: { tom?: 'alerta' | 'perigo' | 'info' | 'ok'; children: ReactNode; acao?: ReactNode }) {
  return (
    <div className={`aviso aviso--${tom}`} role={tom === 'perigo' || tom === 'alerta' ? 'alert' : 'status'}>
      <div className="aviso__texto">{children}</div>
      {acao}
    </div>
  );
}

/** Estado de uma área sem conteúdo: carregando, vazio ou com falha. Sempre diz o que fazer. */
export function Vazio({ titulo, children, acao }: { titulo: string; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="vazio">
      <p className="vazio__titulo">{titulo}</p>
      {children && <p className="vazio__texto">{children}</p>}
      {acao}
    </div>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <p className="carregando" role="status"><span className="carregando__ponto" aria-hidden="true" />{texto}</p>;
}

/** Linha discreta com a confiabilidade do dado: quando foi atualizado e se está atrasado. */
export function Atualizacao({ frescor, atualizadoEm, servico }: { frescor: Frescor; atualizadoEm: number | null; servico: string }) {
  const quando = atualizadoEm ? horaSeg(atualizadoEm) : null;
  const texto: Record<Frescor, string> = {
    carregando: `Consultando ${servico}…`,
    atual: `${servico} atualizado às ${quando}`,
    atrasado: `${servico} atrasado. Último dado às ${quando}`,
    desatualizado: `${servico} sem resposta. Último dado às ${quando}`,
    indisponivel: `${servico} sem resposta`,
  };
  return <span className={`atualizacao atualizacao--${frescor}`} role="status"><span className="atualizacao__ponto" aria-hidden="true" />{texto[frescor]}</span>;
}

interface PropsSobreposicao {
  titulo: string;
  subtitulo?: ReactNode;
  aoFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  lado?: boolean;
  largura?: 'estreita' | 'media' | 'larga';
}

/** Janela sobre a tela: centralizada (diálogo) ou presa à direita (painel lateral). */
export function Sobreposicao({ titulo, subtitulo, aoFechar, children, rodape, lado = false, largura = 'media' }: PropsSobreposicao) {
  const idTitulo = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const primeiro = caixa.current?.querySelector<HTMLElement>('[data-foco-inicial], input:not([disabled]), select, textarea, button:not(.sobreposicao__fechar)');
    (primeiro ?? caixa.current)?.focus();
    const teclas = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); fechar.current(); }
      if (e.key !== 'Tab' || !caixa.current) return;
      const focaveis = [...caixa.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')];
      if (!focaveis.length) return;
      const [ini, fim] = [focaveis[0], focaveis[focaveis.length - 1]];
      if (e.shiftKey && document.activeElement === ini) { e.preventDefault(); fim.focus(); }
      else if (!e.shiftKey && document.activeElement === fim) { e.preventDefault(); ini.focus(); }
    };
    document.addEventListener('keydown', teclas);
    document.body.classList.add('sem-rolagem');
    return () => {
      document.removeEventListener('keydown', teclas);
      document.body.classList.remove('sem-rolagem');
      anterior?.focus?.();
    };
  }, []);

  return (
    <div className={`sobreposicao ${lado ? 'sobreposicao--lado' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div ref={caixa} className={`sobreposicao__caixa sobreposicao__caixa--${largura}`} role="dialog" aria-modal="true" aria-labelledby={idTitulo} tabIndex={-1}>
        <header className="sobreposicao__topo">
          <div>
            <h2 id={idTitulo} className="sobreposicao__titulo">{titulo}</h2>
            {subtitulo && <div className="sobreposicao__subtitulo">{subtitulo}</div>}
          </div>
          <button type="button" className="sobreposicao__fechar" onClick={aoFechar} aria-label="Fechar"><X size={20} /></button>
        </header>
        <div className="sobreposicao__corpo">{children}</div>
        {rodape && <footer className="sobreposicao__rodape">{rodape}</footer>}
      </div>
    </div>
  );
}

interface PropsConfirmacao {
  titulo: string;
  children: ReactNode;
  confirmar: string;
  perigo?: boolean;
  ocupado?: boolean;
  erro?: string | null;
  aoConfirmar: () => void;
  aoFechar: () => void;
}

export function Confirmacao({ titulo, children, confirmar, perigo, ocupado, erro, aoConfirmar, aoFechar }: PropsConfirmacao) {
  return (
    <Sobreposicao titulo={titulo} aoFechar={aoFechar} largura="estreita" rodape={<>
      <button type="button" className="botao botao--quieto" onClick={aoFechar}>Voltar</button>
      <button type="button" data-foco-inicial className={`botao ${perigo ? 'botao--perigo' : 'botao--primario'}`} disabled={ocupado} onClick={aoConfirmar}>
        {ocupado ? 'Aguarde…' : confirmar}
      </button>
    </>}>
      <div className="confirmacao">{children}</div>
      {erro && <Aviso tom="perigo">{erro}</Aviso>}
    </Sobreposicao>
  );
}

export function Campo({ rotulo, dica, erro, children, largo }: { rotulo: string; dica?: ReactNode; erro?: string | null; children: ReactNode; largo?: boolean }) {
  return (
    <label className={`campo ${largo ? 'campo--largo' : ''}`}>
      <span className="campo__rotulo">{rotulo}</span>
      {children}
      {dica && !erro && <span className="campo__dica">{dica}</span>}
      {erro && <span className="campo__erro">{erro}</span>}
    </label>
  );
}

export function CabecalhoTela({ titulo, descricao, acoes, children }: { titulo: string; descricao?: ReactNode; acoes?: ReactNode; children?: ReactNode }) {
  return (
    <header className="cabecalho-tela">
      <div className="cabecalho-tela__texto">
        <h1 className="cabecalho-tela__titulo">{titulo}</h1>
        {descricao && <p className="cabecalho-tela__descricao">{descricao}</p>}
        {children}
      </div>
      {acoes && <div className="cabecalho-tela__acoes">{acoes}</div>}
    </header>
  );
}
