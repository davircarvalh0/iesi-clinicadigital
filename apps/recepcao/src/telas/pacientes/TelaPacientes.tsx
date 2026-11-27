import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { motivo } from '../../api/cliente';
import { cadastro } from '../../api/servicos';
import { cpfProtegido, iniciais, telefone } from '../../dominio/documentos';
import { Aviso, CabecalhoTela, Carregando, Vazio } from '../../ui/componentes';

const TAMANHO = 20;

export function TelaPacientes() {
  const [parametros, setParametros] = useSearchParams();
  const busca = parametros.get('busca') ?? '';
  const pagina = Math.max(1, Number(parametros.get('pagina')) || 1);
  const [texto, setTexto] = useState(busca);

  // Busca enquanto digita, sem disparar uma requisição por tecla.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (texto.trim() !== busca) setParametros(texto.trim() ? { busca: texto.trim() } : {}, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [texto, busca, setParametros]);

  const lista = useQuery({
    queryKey: ['pacientes', busca, pagina],
    queryFn: ({ signal }) => cadastro.pacientes(busca, pagina, TAMANHO, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
  const dados = lista.data;
  const paginas = dados ? Math.max(1, Math.ceil(dados.totalFiltrado / TAMANHO)) : 1;
  const irPara = (p: number) => setParametros({ ...(busca ? { busca } : {}), pagina: String(p) });

  return (
    <div className="tela">
      <CabecalhoTela
        titulo="Pacientes"
        descricao={dados ? `${dados.total} paciente${dados.total === 1 ? '' : 's'} no cadastro. Cada pessoa aparece uma vez, mesmo com várias consultas.` : 'Cadastro único da clínica.'}
      />

      <div className="barra-busca">
        <Search size={18} aria-hidden="true" className="barra-busca__icone" />
        <input type="search" aria-label="Buscar por nome ou CPF" placeholder="Buscar por nome ou CPF" value={texto} onChange={(e) => setTexto(e.target.value)} />
        {lista.isFetching && <span className="barra-busca__estado" role="status">buscando…</span>}
      </div>

      {lista.isError && dados && <Aviso tom="perigo">O Cadastro não respondeu ({motivo(lista.error)}). A lista abaixo é da última busca que deu certo.</Aviso>}
      {lista.isPending && <Carregando texto="Carregando pacientes…" />}
      {lista.isError && !dados && (
        <Vazio titulo="Não foi possível carregar os pacientes" acao={<button type="button" className="botao botao--secundario" onClick={() => void lista.refetch()}>Tentar de novo</button>}>
          O Cadastro não respondeu: {motivo(lista.error)}.
        </Vazio>
      )}
      {dados && dados.pacientes.length === 0 && (
        <Vazio titulo={busca ? 'Nenhum paciente encontrado' : 'Nenhum paciente ainda'}>
          {busca ? `Nada corresponde a "${busca}". Confira o nome ou digite o CPF completo.` : 'Os pacientes entram no cadastro quando a primeira consulta deles é agendada.'}
        </Vazio>
      )}

      {dados && dados.pacientes.length > 0 && (
        <>
          {busca && <p className="resumo-lista" role="status">{dados.totalFiltrado} resultado{dados.totalFiltrado === 1 ? '' : 's'} para "{busca}"</p>}
          <ul className="lista-pacientes">
            {dados.pacientes.map((p) => (
              <li key={p.id}>
                <Link to={`/pacientes/${p.id}`} className="linha-paciente">
                  <span className="monograma" aria-hidden="true">{iniciais(p.nome)}</span>
                  <span className="linha-paciente__nome">{p.nome}</span>
                  <span className="linha-paciente__dado">CPF {cpfProtegido(p.cpf)}</span>
                  <span className="linha-paciente__dado">{telefone(p.telefone)}</span>
                  <span className="linha-paciente__dado linha-paciente__email">{p.email ?? 'sem e-mail'}</span>
                  <ChevronRight size={18} aria-hidden="true" className="linha-paciente__seta" />
                </Link>
              </li>
            ))}
          </ul>
          {paginas > 1 && (
            <nav className="paginacao" aria-label="Páginas">
              <button type="button" className="botao botao--quieto" disabled={pagina <= 1} onClick={() => irPara(pagina - 1)}>Anterior</button>
              <span>Página {pagina} de {paginas}</span>
              <button type="button" className="botao botao--quieto" disabled={pagina >= paginas} onClick={() => irPara(pagina + 1)}>Próxima</button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
