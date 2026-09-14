// Reidrata as vagas do cache com as REGRAS DE HOJE.
//
// Existe por causa da R-003: o cache guarda o veredito da rodada em que a vaga
// entrou, nao a regra vigente. Toda vista derivada — fila de leitura, gerador
// de instrucao, relatorio — precisa refazer esta conta antes de mostrar
// qualquer coisa, senao apertar uma regra ou registrar um julgamento nao tem
// efeito ate a proxima coleta com rede.
//
// Usado por `pendentes` e `instrucoes`, que antes refaziam a sequencia a mao.
//
// O `coletar` NAO usa isto, e continua com a sequencia inline. Nao e
// esquecimento: ele e o escritor, nao uma vista. Alem de hidratar, ele precisa
// do motivo de cada descarte para o relatorio, aplica a regra de vaga parada e
// grava o cache — coisas que uma vista nao faz. Unificar os dois exigiria
// `hidratar` devolver os motivos, e isso so se valida com uma rodada de rede.
// Registrado como tarefa; ate la, mexer numa regra pede olhar os dois.
import { avaliar } from './filtro.js';
import { calcular, compatibilidade } from './score.js';
import * as semantico from './semantico.js';
import * as arquivo from './arquivo.js';

/**
 * @param {object[]} vagas cruas, direto do cache
 * @returns {{ativas: object[], barradas: number}}
 *   `ativas` ja com score, julgamento semantico, estado do Notion e o indice
 *   final em `compatibilidade`.
 */
export function hidratar(vagas) {
  const julgamentos = semantico.carregar();
  const notion = arquivo.carregar();
  const ativas = [];
  let barradas = 0;

  for (const v of vagas) {
    if (!avaliar(v).passa) { barradas++; continue; }
    v.score = calcular(v);
    semantico.aplicar(v, julgamentos);
    arquivo.aplicar(v, notion);
    v.compatibilidade = compatibilidade(v, v.semantico);
    ativas.push(v);
  }

  return { ativas, barradas };
}
