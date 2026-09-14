// Carrega config/. Todo comportamento ajustavel vive lá, nunca no codigo.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function ler(nome) {
  return JSON.parse(readFileSync(join(RAIZ, 'config', nome), 'utf8'));
}

export const perfil = ler('perfil.json');
export const palavras = ler('palavras-chave.json');
export const dorks = ler('dorks.json');
export const linkedin = existsSync(join(RAIZ, 'config', 'linkedin.json')) ? ler('linkedin.json') : null;

/**
 * Carrega o `.env` para `process.env`. Fica AQUI, e nao no script que precisa
 * do token, porque todo mundo importa este arquivo — inclusive o coletar.
 *
 * A licao que poe isto aqui, de 2026-08-01: uma fonte que depende de token
 * testava `process.env` no coletor, mas so o script dedicado carregava o .env.
 * O comando que se roda a mao funcionava; a rodada agendada, que e a que roda
 * sozinha, pulava a fonte em silencio. Feature viva no caminho que se testa e
 * morta no que importa — o pior tipo de defeito, porque ninguem ve.
 *
 * Sem dependencia externa de proposito: sao linhas CHAVE=valor. Variavel ja
 * definida no ambiente vence o arquivo, que e o que se espera de um .env.
 */
function carregarEnv() {
  const arq = join(RAIZ, '.env');
  if (!existsSync(arq)) return;
  for (const linha of readFileSync(arq, 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const valor = m[2].trim().replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
  }
}
carregarEnv();

// VAGAS_DIR_DADOS existe para teste: o quadro grava em disco, e o teste nao
// pode tocar no quadro de verdade.
export const DIR_DADOS = process.env.VAGAS_DIR_DADOS || join(RAIZ, 'data');
