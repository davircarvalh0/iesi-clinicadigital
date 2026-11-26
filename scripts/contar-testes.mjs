// Soma os contadores que o node --test imprime no fim de cada execução (um bloco por arquivo ou workspace).
export function contarTestes(saida) {
  const soma = (rotulo) => [...saida.matchAll(new RegExp(String.raw`^ℹ ${rotulo} (\d+)`, 'gm'))]
    .reduce((t, m) => t + Number(m[1]), 0);
  const total = soma('tests');
  return total ? { total, pass: soma('pass'), fail: soma('fail'), skipped: soma('skipped') } : null;
}
