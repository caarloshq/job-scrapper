// O leitor do estado das vagas. Desde 2026-09-14 o estado e o QUADRO local
// (data/quadro.json, escrito por src/quadro.js e movido no navegador por
// scripts/quadro.mjs). Quem usa Notion pode continuar espelhando a database
// aqui com `espelhar()`: o formato e o mesmo, so muda quem escreve.
//
// O nome `noNotion` ficou por compatibilidade: significa "ja esta no quadro".
//
// A primeira versao disto era um "arquivadas.json" que voce teria que
// alimentar rodando um comando a cada vaga que aplicasse. Era um segundo banco
// guardando o que o Notion ja guardava — complicacao inventada por mim, e ele
// cortou. O estado mora num lugar so.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DIR_DADOS } from './config.js';
import { normalizarLink } from './util.js';
import { chaveAnuncio, chaveRequisicao, idCanonico, requisicoesConflitam } from './dedupe.js';

const ARQ = join(DIR_DADOS, 'quadro.json');

/**
 * Status que tiram a vaga do radar: ela ja virou decisao tomada.
 *
 * `Aplicado por IA` entrou em 2026-08-25: e candidatura que o piloto preencheu
 * e voce enviou. Vale como concluida igual a `Ja apliquei` — o que muda e
 * so quem digitou. ESQUECER esta linha faz a vaga voltar ao radar amanha e
 * ganhar um segundo curriculo, que e exatamente o defeito que o rename de
 * `Sem retorno` para `Cancelada` causou em agosto.
 *
 * `Cancelada` e `Revisar` sao os nomes atuais das opcoes do Notion — o
 * voce renomeou (nao recriou) `Sem retorno` -> `Cancelada` e
 * `Descartada` -> `Revisar` em 2026-08-05. So `Cancelada` entra aqui:
 * `Revisar` e fila de triagem (link morto? duplicata?), a vaga continua
 * ativa ate alguem resolver, senao ela some da vista antes de ser checada.
 */
export const CONCLUIDOS = ['Já apliquei', 'Entrevista', 'Cancelada', 'Aplicado por IA'];
// `Avaliar`, `Aplicar` e `Revisar` sao ativos: continuam no radar.

export function carregar() {
  if (!existsSync(ARQ)) return { versao: 1, sincronizadoEm: null, vagas: {} };
  try {
    return JSON.parse(readFileSync(ARQ, 'utf8'));
  } catch {
    return { versao: 1, sincronizadoEm: null, vagas: {} };
  }
}

/**
 * Regrava o espelho inteiro com o que veio do Notion.
 * @param {Array<{idExterno:string, status:string, empresa?:string, titulo?:string, url?:string}>} linhas
 */
export function espelhar(linhas) {
  // Preserva historico e retrato de quem ja esta no quadro: espelhar nunca apaga.
  const antes = carregar();
  const d = { versao: 2, sincronizadoEm: new Date().toISOString(), vagas: { ...antes.vagas } };
  for (const l of linhas) {
    if (!l?.idExterno) continue;
    d.vagas[l.idExterno] = {
      ...(antes.vagas[l.idExterno] || {}),
      status: l.status || 'Avaliar',
      empresa: l.empresa || antes.vagas[l.idExterno]?.empresa || null,
      titulo: l.titulo || antes.vagas[l.idExterno]?.titulo || null,
      url: l.url || antes.vagas[l.idExterno]?.url || null,
    };
  }
  mkdirSync(DIR_DADOS, { recursive: true });
  writeFileSync(ARQ, JSON.stringify(d, null, 2));
  return d;
}

/**
 * Marca a vaga com o que o Notion sabe dela.
 *
 * - `noNotion`  ja foi publicada, entao nao e novidade
 * - `concluida` decisao tomada: sai do radar e da fila de leitura
 *
 * Procura por todos os ids que a vaga ja teve, porque o dedupe troca o
 * vencedor quando entra fonte nova.
 *
 * O LINK e a ultima tentativa, e ela salvou cinco linhas em 2026-07-30: ao
 * publicar a primeira leva eu inventei ids em estilo slug
 * (`vagasremotas:codepath-senior-product-designer`) em vez de copiar o
 * `idExterno` do coletor. Id inventado nunca casa com nada, e as cinco vagas
 * iam virar pagina duplicada. O link e o mesmo dado nos dois lados, entao ele
 * cura a deriva sozinho — inclusive a que ainda vai acontecer.
 *
 * QUARTA TENTATIVA, empresa+titulo: o link so ajuda quando os dois lados
 * apontam pro mesmo sistema. FCamara publicada direto no Gupy e espelhada no
 * LinkedIn nao tem nada em comum no link — gupy.io de um lado, linkedin.com
 * do outro — e a vaga ia entrar duas vezes no board. Mesma chave fraca que
 * `dedupe.chaveAnuncio()` usa entre fontes desta rodada; herda a mesma
 * ressalva: nao vale para agregador cujo campo empresa e o intermediario
 * (Jobgether etc.), porque ai duas vagas reais dividem o rotulo.
 */
export function aplicar(vaga, dados = carregar()) {
  // `idCanonico` calculado na hora, nao so o campo gravado: entrada que veio do
  // cache antigo nao tem o campo, e sem ele a vaga da Gupy espelhada na Remotar
  // (mesmo jobId dentro do link base64) reaparecia como novidade.
  const ids = [vaga.idExterno, vaga.idCanonico, idCanonico(vaga), ...(vaga.idsAlternativos || [])].filter(Boolean);
  for (const id of ids) {
    const n = dados.vagas[id];
    if (n) return marcar(vaga, n);
  }

  const link = normalizarLink(vaga.link);
  if (link) {
    const n = indicePorLink(dados).get(link);
    if (n) return marcar(vaga, n);
  }

  // O link do Notion tambem passa pelo idCanonico: a linha ja aplicada pode ter
  // sido publicada com a URL do agregador e a vaga de hoje com a da ATS.
  const canon = idCanonico(vaga);
  if (canon) {
    const n = indicePorCanonico(dados).get(canon);
    if (n) return marcar(vaga, n);
  }

  const requisicao = chaveRequisicao(vaga);
  if (requisicao) {
    const n = indicePorRequisicao(dados).get(requisicao);
    if (n) return marcar(vaga, n);
  }

  const anuncio = chaveAnuncio(vaga);
  if (anuncio) {
    const n = indicePorAnuncio(dados).get(anuncio);
    // Numero de requisicao diferente dos dois lados = vaga diferente, mesmo com
    // titulo igual. A Nortal tem a 1520 e a 1552 com o mesmo cargo.
    if (n && !requisicoesConflitam(vaga, n)) return marcar(vaga, n);
  }

  vaga.noNotion = false;
  vaga.concluida = false;
  return vaga;
}

/**
 * Indice link -> linha, montado uma vez por objeto de dados.
 * A varredura ingenua era O(linhas) por vaga; com 69 dos dois lados ja sao
 * 4.761 comparacoes por rodada, e cresce quadrado. Alem do custo, ela devolvia
 * a PRIMEIRA da iteracao quando duas linhas dividiam o link — sem criterio.
 * O Map colapsa isso de forma explicita: a ultima linha vence, sempre a mesma.
 */
const INDICES = new WeakMap();
function indicePorLink(dados) {
  let m = INDICES.get(dados);
  if (m) return m;
  m = new Map();
  for (const n of Object.values(dados.vagas)) {
    const l = n.url && normalizarLink(n.url);
    if (l) m.set(l, n);
  }
  INDICES.set(dados, m);
  return m;
}

const INDICES_CANONICO = new WeakMap();
function indicePorCanonico(dados) {
  let m = INDICES_CANONICO.get(dados);
  if (m) return m;
  m = new Map();
  for (const n of Object.values(dados.vagas)) {
    const c = idCanonico({ link: n.url, idExterno: null });
    if (c) m.set(c, n);
  }
  INDICES_CANONICO.set(dados, m);
  return m;
}

const INDICES_REQUISICAO = new WeakMap();
function indicePorRequisicao(dados) {
  let m = INDICES_REQUISICAO.get(dados);
  if (m) return m;
  m = new Map();
  for (const n of Object.values(dados.vagas)) {
    const r = chaveRequisicao({ empresa: n.empresa, titulo: n.titulo });
    if (r) m.set(r, n);
  }
  INDICES_REQUISICAO.set(dados, m);
  return m;
}

const INDICES_ANUNCIO = new WeakMap();
function indicePorAnuncio(dados) {
  let m = INDICES_ANUNCIO.get(dados);
  if (m) return m;
  m = new Map();
  for (const n of Object.values(dados.vagas)) {
    const a = chaveAnuncio(n);
    if (a) m.set(a, n);
  }
  INDICES_ANUNCIO.set(dados, m);
  return m;
}

function marcar(vaga, n) {
  vaga.noNotion = true;
  vaga.statusNotion = n.status;
  vaga.concluida = CONCLUIDOS.includes(n.status);
  return vaga;
}

export function resumo(dados = carregar()) {
  const por = {};
  for (const v of Object.values(dados.vagas)) por[v.status] = (por[v.status] || 0) + 1;
  const concluidas = Object.values(dados.vagas).filter((v) => CONCLUIDOS.includes(v.status)).length;
  return { total: Object.keys(dados.vagas).length, concluidas, por, sincronizadoEm: dados.sincronizadoEm };
}
