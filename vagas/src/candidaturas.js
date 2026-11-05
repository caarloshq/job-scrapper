// Debito/credito de candidaturas diarias. Compara IDs confirmados que o
// chamador leu no quadro com os que ja foram contados da ultima vez.
//
// Positivo = credito (aplicou alem da quota). Negativo = debito (ficou devendo).
import { join } from 'node:path';
import { DIR_DADOS } from './config.js';
import { lerEstado, salvarEstado } from './estado-central.js';

const ARQUIVO = join(DIR_DADOS, 'candidaturas.json');

export function carregar() {
  return lerEstado(ARQUIVO, { quotaDiaria: 10, ultimaChecagem: null, saldo: 0, idsJaContados: [] });
}

export function salvar(dados) {
  return salvarEstado(ARQUIVO, dados, DIR_DADOS);
}

function diasCorridos(de, ate) {
  if (!de) return 1;
  const ms = new Date(ate).setHours(0, 0, 0, 0) - new Date(de).setHours(0, 0, 0, 0);
  return Math.max(1, Math.round(ms / 86400000));
}

/**
 * @param {string[]} idsAtuais - todo ID externo confirmado no quadro
 * @param {Date} hoje
 * @returns {{ saldo: number, novasHoje: string[], quotaDevida: number, dados: object }}
 */
export function atualizar(idsAtuais, hoje = new Date()) {
  const dados = carregar();
  const dataHoje = hoje.toISOString().slice(0, 10);
  const jaContados = new Set(dados.idsJaContados || []);
  const novasHoje = idsAtuais.filter((id) => !jaContados.has(id));

  const dias = diasCorridos(dados.ultimaChecagem, dataHoje);
  const quotaDevida = dados.quotaDiaria * dias;

  dados.saldo = (dados.saldo || 0) + novasHoje.length - quotaDevida;
  dados.ultimaChecagem = dataHoje;
  dados.idsJaContados = idsAtuais;

  salvar(dados);
  return { saldo: dados.saldo, novasHoje, quotaDevida, dados };
}
