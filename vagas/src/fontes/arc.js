// Arc — arc.dev/remote-jobs. Fonte PEQUENA e BOA, e a ordem dos adjetivos importa.
//
// ARMADILHA JA PAGA, medida em 2026-08-25: a pagina anuncia 9.193 vagas e mistura
// DOIS acervos no mesmo `__NEXT_DATA__`. So um serve:
//
//   arcJobs      as vagas proprias do Arc. Tem pagina de detalhe, descricao
//                inteira, faixa por hora, paises aceitos e estado de aberta.
//                Foram 5 UNICAS nas 6 rotas de design.
//   externalJobs o acervo agregado. 30 por rota, e traz SO titulo, empresa e
//                data. Sem link e sem descricao — a rota /details/ devolve 404
//                para elas. Vaga sem link e linha onde voce nao consegue se
//                candidatar, entao elas NAO ENTRAM.
//
// Nao "conserte" isso passando a ler externalJobs: elas nao ganharam link, e sem
// descricao nunca passariam do corte de 75% de qualquer forma.
//
// robots.txt do arc.dev: o grupo `User-agent: *` permite `/` e so bloqueia
// /resume/builder/, /cookies e /privacy. O `Crawl-Delay: 10` esta declarado para
// o ClaudeBot, e nao e o nosso User-Agent. Ainda assim andamos devagar de
// propósito, bem acima dos 150ms das outras fontes, porque a fonte e pequena e
// nao ha pressa.
import { buscar, dormir, novoContador } from '../util.js';

const BASE = 'https://arc.dev';
export const NOME = 'Arc';

/**
 * As rotas de categoria valem como filtro: `/remote-jobs/<slug>` devolve so a
 * categoria. Confirmado em 2026-08-25 que estas seis existem e respondem com
 * `categoryUrlString` preenchido. `design` e `designer` NAO existem: devolvem
 * 308 de volta para /remote-jobs, que e a lista geral.
 */
export const ROTAS = ['product-design', 'ux-design', 'ui-design', 'ux-ui-design', 'design-systems', 'figma'];

const PAUSA_MS = 2500;

/** Recorta o JSON que o Next serve embutido na pagina. */
export function lerNextData(html) {
  if (!html) return null;
  const m = String(html).match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/** So as vagas proprias do Arc. Ver o cabecalho para o porque. */
export function lerArcJobs(html) {
  const j = lerNextData(html);
  const lista = j?.props?.pageProps?.arcJobs;
  return Array.isArray(lista) ? lista.filter((v) => v && v.randomKey && v.urlString) : [];
}

/** A pagina publica de uma vaga propria do Arc. */
export function urlPublica(urlString, randomKey) {
  return `${BASE}/remote-jobs/details/${urlString}-${randomKey}`;
}

/**
 * Faixa salarial. O Arc informa por ANO ou por HORA, e as duas existem no mesmo
 * objeto. Preferimos o anual quando ele existe porque e o numero menos ambiguo.
 *
 * O `tipo` viaja junto para o `salario.daFonte` saber o periodo. Sem ele, uma
 * faixa de 30 a 50 por hora seria lida como um salario de 30 reais e a vaga
 * cairia abaixo do piso — descarte silencioso, o pior tipo.
 */
export function montarSalario(j) {
  if (!j) return null;
  if (j.minAnnualSalary || j.maxAnnualSalary) {
    return { from: j.minAnnualSalary || null, to: j.maxAnnualSalary || null, currency: 'USD', type: 'year' };
  }
  if (j.minHourlyRate || j.maxHourlyRate) {
    return { from: j.minHourlyRate || null, to: j.maxHourlyRate || null, currency: 'USD', type: 'hour' };
  }
  return null;
}

/**
 * O Arc diz em quais paises a vaga pode ser feita. Vaga que nao lista o Brasil
 * nao adianta para voce, entao o campo vira `paisAceito` e o filtro decide.
 * Lista VAZIA quer dizer sem restricao declarada, e a vaga passa.
 */
export function aceitaBrasil(requiredCountries) {
  if (!Array.isArray(requiredCountries) || requiredCountries.length === 0) return true;
  return requiredCountries.includes('BR');
}

/**
 * Portao de vida nativo. O Arc expoe `closed` e `aasmState`, entao aqui nao
 * precisamos do truque de ler `"status"` do HTML que as outras fontes usam.
 */
export function estaAberta(j) {
  if (j?.closed === true) return false;
  const e = String(j?.aasmState || j?.state || '').toLowerCase();
  if (!e) return true;
  return !/closed|archived|filled|cancel|expired/.test(e);
}

/** Markdown da descricao vira texto corrido, sem inventar nada. */
export function limparMarkdown(s) {
  if (!s) return null;
  return String(s)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim() || null;
}

/**
 * O Arc conta o tempo em segundos do unix, e a pagina de DETALHE nao repete o
 * `postedAt` da listagem: la o campo se chama `createdAt` e continua sendo
 * numero. Devolver o numero cru fazia o frescor ler a vaga como antiquissima e
 * o filtro descartava as 5 como "zumbi: mais de 45 dias sem sinal de vida" —
 * a fonte inteira sumia em silencio. Achado na primeira rodada real, 2026-08-25.
 */
export function paraIso(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  const d = new Date(v * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function paraVaga(j, empresa) {
  const link = urlPublica(j.urlString, j.randomKey);
  const paises = Array.isArray(j.requiredCountries) ? j.requiredCountries : [];
  return {
    idExterno: `arc:${j.randomKey}`,
    fonte: NOME,
    camada: 'API',
    titulo: j.title,
    empresa: empresa || j.company?.name || null,
    descricao: limparMarkdown(j.description),
    link,
    cidade: null,
    // O board inteiro e remoto, entao o pais nao e onde a pessoa senta: e a
    // lista de onde a vaga aceita alguem. Nao preencher `cidade` com isso.
    estado: null,
    pais: paises.includes('BR') ? 'Brasil' : null,
    modelo: 'remoto',
    remoto: true,
    paisesAceitos: paises,
    publicadaEm: paraIso(j.postedAt ?? j.createdAt),
    atualizadaEm: paraIso(j.updatedAt),
    prazo: null,
    salarioBruto: montarSalario(j),
    ingles: j.englishLevel || null,
    statusFonte: j.closed === true ? 'closed' : j.aasmState || j.state || null,
    encerrada: !estaAberta(j),
    validada: true,
  };
}

export async function coletar() {
  const c = novoContador(NOME);
  const candidatas = new Map();

  for (const rota of ROTAS) {
    c.consultadas++;
    let html = null;
    try {
      html = await buscar(`${BASE}/remote-jobs/${rota}`, { texto: true, tentativas: 2, timeoutMs: 25000 });
    } catch {
      c.falhas++;
      await dormir(PAUSA_MS);
      continue;
    }
    const lista = lerArcJobs(html);
    c.brutas += lista.length;
    for (const j of lista) if (!candidatas.has(j.randomKey)) candidatas.set(j.randomKey, j);
    await dormir(PAUSA_MS);
  }

  // Passo 2, a pagina de detalhe. Sem ela nao ha descricao, e sem descricao o
  // julgamento semantico nao roda e a senioridade sai so do titulo — que e como
  // a vaga junior da Cashforce passou em julho.
  const vagas = [];
  for (const parcial of candidatas.values()) {
    let detalhe = null;
    try {
      const html = await buscar(urlPublica(parcial.urlString, parcial.randomKey), {
        texto: true,
        tentativas: 2,
        timeoutMs: 25000,
      });
      const p = lerNextData(html)?.props?.pageProps;
      detalhe = p?.job || null;
      if (detalhe) detalhe.__empresa = p?.company?.name || null;
    } catch {
      c.falhas++;
    }
    // O detalhe COMPLEMENTA a listagem, nunca a substitui: a descricao so existe
    // no detalhe, e o `postedAt` so existe na listagem. Trocar um pelo outro
    // perde metade do dado.
    const j = detalhe ? { ...parcial, ...detalhe } : parcial;
    const v = paraVaga(j, detalhe?.__empresa);
    // Vaga fechada nem entra: o Arc ja diz, nao ha por que descobrir depois.
    if (v.encerrada) continue;
    // E vaga que nao aceita alguem no Brasil nao adianta para voce. Sem esta
    // linha o `aceitaBrasil` era funcao exportada e nunca chamada.
    if (!aceitaBrasil(v.paisesAceitos)) continue;
    vagas.push(v);
    await dormir(PAUSA_MS);
  }

  return { vagas, contador: c };
}
