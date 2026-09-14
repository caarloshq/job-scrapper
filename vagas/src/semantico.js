// Julgamento semantico — a parte cara do indice, e a unica que o robo nao refaz.
//
// Os 60 pontos deterministicos o Node recalcula em 2 minutos. Os 40 semanticos
// custam alguem LER a vaga inteira contra o curriculo. Por isso eles moram num
// arquivo separado que a reconstrucao do cache NUNCA apaga.
//
// O defeito que criou este arquivo: em 2026-07-30 rodei `rm -f data/vagas.json`
// cinco vezes ao corrigir filtros, e cada vez o sistema esquecia todo o
// julgamento. As 19 notas so sobreviveram porque estavam no Notion.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DIR_DADOS, perfil } from './config.js';

/**
 * Impressao da descricao no momento da leitura. Se o anuncio for reeditado,
 * o hash muda e o julgamento e marcado como desatualizado — senao a nota
 * envelhece em silencio e ninguem percebe que ela fala de outro texto.
 */
export function impressao(descricao) {
  const t = String(descricao || '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return createHash('sha1').update(t).digest('hex').slice(0, 12);
}

const ARQ = join(DIR_DADOS, 'semantico.json');

export function carregar() {
  if (!existsSync(ARQ)) return { versao: 1, julgamentos: {} };
  try {
    return JSON.parse(readFileSync(ARQ, 'utf8'));
  } catch {
    return { versao: 1, julgamentos: {} };
  }
}

/**
 * Ordena os julgamentos por chave antes de gravar. Sem isso a ordem segue a
 * inserção, muda a cada rodada, e uma rodada que não julgou nada novo gera
 * diff de arquivo inteiro no git.
 */
function ordenarJulgamentos(dados) {
  const julgamentos = {};
  for (const id of Object.keys(dados.julgamentos ?? {}).sort()) {
    julgamentos[id] = dados.julgamentos[id];
  }
  return { ...dados, julgamentos };
}

export function salvar(dados) {
  mkdirSync(DIR_DADOS, { recursive: true });
  writeFileSync(ARQ, JSON.stringify(ordenarJulgamentos(dados), null, 2));
  return ARQ;
}

/**
 * Registra o julgamento de uma vaga.
 * @param {string} idExterno
 * @param {{nota:number, resumo?:string, gaps?:string}} j nota de 0 a 40
 */
export function registrar(idExterno, j) {
  const d = carregar();
  const teto = perfil.pesos.semantico_max;
  d.julgamentos[idExterno] = {
    nota: Math.max(0, Math.min(Number(j.nota), teto)),
    resumo: j.resumo ?? d.julgamentos[idExterno]?.resumo ?? null,
    gaps: j.gaps ?? d.julgamentos[idExterno]?.gaps ?? null,
    impressao: j.impressao ?? (j.descricao ? impressao(j.descricao) : d.julgamentos[idExterno]?.impressao ?? null),
    lidoEm: j.lidoEm ?? new Date().toISOString().slice(0, 10),
  };
  salvar(d);
  return d.julgamentos[idExterno];
}

/** @returns {{nota:number, resumo:string|null, gaps:string|null, lidoEm:string}|null} */
export function julgamentoDe(idExterno, dados = carregar()) {
  return dados.julgamentos[idExterno] ?? null;
}

/**
 * Cola o julgamento na vaga. Sem julgamento, `semantico` fica null e o indice
 * final sai incompleto — o que e uma informacao, nao um erro: quer dizer
 * "ninguem leu esta vaga ainda".
 */
/**
 * Todos os ids pelos quais esta vaga ja foi conhecida. O dedupe elege um
 * vencedor por prioridade de fonte, e essa eleicao MUDA quando uma fonte nova
 * entra — foi assim que Arco (87%) e RD Station (86%) perderam o julgamento
 * ao a Fase 5 ligar o Greenhouse, que tem prioridade acima da Remotar.
 */
function idsConhecidos(vaga) {
  return [vaga.idExterno, vaga.idCanonico, ...(vaga.idsAlternativos || [])].filter(Boolean);
}

/**
 * Cola o julgamento na vaga.
 *
 * NAO escreve em disco por padrao. A primeira versao migrava a chave aqui
 * dentro, e num teste que passa um objeto sintetico isso sobrescreveria o
 * semantico.json real — funcao de leitura com efeito colateral de escrita e
 * armadilha. A migracao agora e explicita, via `migrarChaves()`.
 */
export function aplicar(vaga, dados = carregar()) {
  let j = null;
  let chaveAchada = null;
  for (const id of idsConhecidos(vaga)) {
    j = julgamentoDe(id, dados);
    if (j) { chaveAchada = id; break; }
  }

  if (j && chaveAchada !== vaga.idExterno) vaga.julgamentoVeioDe = chaveAchada;

  if (!j) {
    vaga.semantico = null;
    vaga.lida = false;
    return vaga;
  }
  vaga.semantico = j.nota;
  vaga.lida = true;
  vaga.lidoEm = j.lidoEm;

  // Anuncio reeditado depois da leitura: a nota vale, mas fala de outro texto.
  const agora = impressao(vaga.descricao);
  vaga.julgamentoDesatualizado = !!(j.impressao && agora && j.impressao !== agora);
  if (j.resumo) vaga.resumo = j.resumo;
  if (j.gaps) vaga.gaps = j.gaps;
  return vaga;
}

/**
 * Regrava os julgamentos achados por id antigo sob o id atual, para o arquivo
 * se curar em vez de acumular chave morta a cada troca de prioridade de fonte.
 * Chamado uma vez pelo coletor, no fim da rodada. Escreve em disco.
 */
export function migrarChaves(vagas) {
  const d = carregar();
  let migradas = 0;
  for (const v of vagas) {
    if (!v.julgamentoVeioDe || !d.julgamentos[v.julgamentoVeioDe]) continue;
    d.julgamentos[v.idExterno] = d.julgamentos[v.julgamentoVeioDe];
    delete d.julgamentos[v.julgamentoVeioDe];
    migradas++;
  }
  if (migradas) salvar(d);
  return migradas;
}
