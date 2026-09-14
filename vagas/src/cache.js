// Cache local em JSON. Descartavel de proposito: o Notion e a fonte de verdade.
// Sem SQLite para nao precisar de compilacao nativa, o que mantem o setup trivial.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DIR_DADOS } from './config.js';

const ARQ = join(DIR_DADOS, 'vagas.json');

export function carregar() {
  if (!existsSync(ARQ)) return { versao: 1, atualizadoEm: null, vagas: {} };
  try {
    return JSON.parse(readFileSync(ARQ, 'utf8'));
  } catch {
    return { versao: 1, atualizadoEm: null, vagas: {} };
  }
}

export function salvar(cache) {
  mkdirSync(DIR_DADOS, { recursive: true });
  cache.atualizadoEm = new Date().toISOString();
  writeFileSync(ARQ, JSON.stringify(cache, null, 2));
  return ARQ;
}

export function salvarRodada(nome, dados) {
  mkdirSync(DIR_DADOS, { recursive: true });
  const p = join(DIR_DADOS, nome);
  writeFileSync(p, JSON.stringify(dados, null, 2));
  return p;
}
