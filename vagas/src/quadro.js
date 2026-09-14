// O quadro: o estado de cada vaga, e o historico de tudo que aconteceu com ela.
//
// E o arquivo que substitui o Notion como estado (decisao de 2026-09-14). A
// rodada grava aqui toda vaga aprovada, com status "Avaliar"; a pessoa move o
// card no navegador (scripts/quadro.mjs), e a rodada seguinte le o status pra
// nao reoferecer o que ja foi resolvido. Quem le e `arquivo.js`; quem escreve
// e este modulo, e so ele.
//
// REGRA QUE NAO SE NEGOCIA: NADA AQUI E APAGADO. Vaga que saiu do cache continua
// no quadro com o retrato que tinha (titulo, empresa, link, nota) e o historico
// de status. Antes de cada gravacao do dia, uma copia vai para data/backups/.
// O historico e a unica coisa do sistema que ninguem consegue reconstruir.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIR_DADOS } from './config.js';
import * as arquivo from './arquivo.js';

export const ARQ = join(DIR_DADOS, 'quadro.json');
const DIR_BACKUPS = join(DIR_DADOS, 'backups');

/** Ordem das colunas no quadro. `Aplicar` e a fila de quem decidiu ir; nao e concluida. */
export const STATUS = ['Avaliar', 'Aplicar', 'Já apliquei', 'Entrevista', 'Cancelada'];
/** Status que o agente usa com a candidatura automatica ligada. Nao e coluna; aparece junto de `Já apliquei`. */
export const STATUS_EXTRA = ['Aplicado por IA'];
export const STATUS_INICIAL = 'Avaliar';

export function carregar() {
  return arquivo.carregar();
}

/** Copia do dia, uma por dia, antes da primeira gravacao. Nunca sobrescreve a copia do dia. */
export function fazerBackup(agora = new Date()) {
  if (!existsSync(ARQ)) return null;
  mkdirSync(DIR_BACKUPS, { recursive: true });
  const alvo = join(DIR_BACKUPS, `quadro-${agora.toISOString().slice(0, 10)}.json`);
  if (!existsSync(alvo)) copyFileSync(ARQ, alvo);
  return alvo;
}

export function salvar(dados, agora = new Date()) {
  fazerBackup(agora);
  mkdirSync(DIR_DADOS, { recursive: true });
  dados.versao = 2;
  dados.sincronizadoEm = agora.toISOString();
  writeFileSync(ARQ, JSON.stringify(dados, null, 2) + '\n');
  return ARQ;
}

function retrato(v) {
  return {
    titulo: v.titulo || null,
    empresa: v.empresa || null,
    url: v.link || null,
    fonte: v.fonte || null,
    compatibilidade: v.compatibilidade ?? null,
    salarioTexto: v.salarioTexto || null,
    publicadaEm: v.publicadaEm || null,
  };
}

/**
 * Entra no quadro toda vaga aprovada que ainda nao esta nele, com o status
 * inicial. Vaga que ja esta so tem o retrato atualizado (titulo, nota...), e
 * o status e o historico ficam como estao. Idempotente: rodar duas vezes com
 * a mesma lista nao muda nada na segunda.
 *
 * Le o quadro do disco NA HORA de gravar, nunca uma copia de antes: a rodada
 * leva minutos, e um card movido no navegador nesse meio-tempo nao pode
 * voltar para tras. Reproduzido em 2026-09-14 antes desta regra.
 * @returns {{novas: number, atualizadas: number}}
 */
export function registrar(vagas, { agora = new Date() } = {}) {
  const dados = carregar();
  let novas = 0; let atualizadas = 0;
  for (const v of vagas) {
    if (!v?.idExterno) continue;
    const r = retrato(v);
    const atual = dados.vagas[v.idExterno];
    if (!atual) {
      dados.vagas[v.idExterno] = {
        status: STATUS_INICIAL, ...r,
        registradaEm: agora.toISOString(),
        historico: [{ em: agora.toISOString(), de: null, para: STATUS_INICIAL, por: 'rodada' }],
      };
      novas++;
    } else {
      Object.assign(atual, r, { url: r.url || atual.url, titulo: r.titulo || atual.titulo, empresa: r.empresa || atual.empresa });
      atualizadas++;
    }
  }
  if (novas || atualizadas) salvar(dados, agora);
  return { novas, atualizadas };
}

/**
 * Move um card. Recusa status fora da lista e id que nao existe: mover para
 * o nada apagaria historico, e apagar e o que este modulo nao faz.
 */
export function mover(idExterno, para, { por = 'pessoa', agora = new Date() } = {}) {
  const dados = carregar();
  if (!STATUS.includes(para) && !STATUS_EXTRA.includes(para)) throw new Error(`status desconhecido: ${para}`);
  const v = dados.vagas[idExterno];
  if (!v) throw new Error(`vaga nao esta no quadro: ${idExterno}`);
  const de = v.status;
  if (de === para) return v;
  v.status = para;
  v.historico = v.historico || [];
  v.historico.push({ em: agora.toISOString(), de, para, por });
  salvar(dados, agora);
  return v;
}

export function contarPorStatus(dados = carregar()) {
  const por = Object.fromEntries(STATUS.map((s) => [s, 0]));
  for (const v of Object.values(dados.vagas)) por[v.status] = (por[v.status] || 0) + 1;
  return por;
}
