// Debito/credito de candidaturas diarias. Nao mexe no Notion: so compara o
// conjunto atual de "Ja apliquei" (que quem chama busca via MCP) contra o
// que ja foi contado da ultima vez, e atualiza o saldo.
//
// Positivo = credito (aplicou alem da quota). Negativo = debito (ficou devendo).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVO = path.join(__dirname, '..', 'data', 'candidaturas.json');

export function carregar() {
  if (!fs.existsSync(ARQUIVO)) {
    return { quotaDiaria: 10, ultimaChecagem: null, saldo: 0, idsJaContados: [] };
  }
  return JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
}

export function salvar(dados) {
  fs.writeFileSync(ARQUIVO, JSON.stringify(dados, null, 2));
}

function diasCorridos(de, ate) {
  if (!de) return 1;
  const ms = new Date(ate).setHours(0, 0, 0, 0) - new Date(de).setHours(0, 0, 0, 0);
  return Math.max(1, Math.round(ms / 86400000));
}

/**
 * @param {string[]} idsAtuais - todo ID externo com Status = "Ja apliquei" agora no Notion
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
