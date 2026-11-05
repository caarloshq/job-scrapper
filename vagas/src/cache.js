// Cache local em JSON. O quadro local guarda o estado das vagas.
// Sem SQLite para nao precisar de compilacao nativa, o que mantem o setup trivial.
import { join } from 'node:path';
import { DIR_DADOS } from './config.js';
import { lerEstado, salvarEstado, herdarVersao } from './estado-central.js';

const ARQ = join(DIR_DADOS, 'vagas.json');

export function carregar() {
  return lerEstado(ARQ, { versao: 1, atualizadoEm: null, vagas: {} });
}

export function salvar(cache) {
  cache.atualizadoEm = new Date().toISOString();
  return salvarEstado(ARQ, cache, DIR_DADOS);
}

export function salvarRodada(nome, dados) {
  const p = join(DIR_DADOS, nome);
  const anterior = lerEstado(p, null);
  return salvarEstado(p, anterior ? herdarVersao(anterior, dados) : dados, DIR_DADOS);
}
