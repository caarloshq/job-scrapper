// UX Jobs — jobs.uxjobs.io. Agregador diario so de UX e produto: ~3.300 vagas
// de Greenhouse, Ashby, Workday, Lever, JazzHR e outros.
//
// A LISTA INTEIRA VEM NUM PEDIDO SO. A home publica embute todas as vagas num
// <script type="application/json" id="jobs-data">, com cargo, empresa, pais,
// remoto, nivel e o link da ATS de origem. Nada de API: o robots.txt deles
// proibe /api/ (exportacao privada da newsletter) e libera o resto para
// qualquer visitante. Nao tocar em /api/.
//
// A DESCRICAO QUASE NUNCA ESTA NO UX JOBS. Medido em 2026-10-06: de 72 vagas
// que passavam no filtro, so 19 tinham o anuncio na pagina /jobs/<slug>/ (um
// JobPosting em ld+json). As outras dizem "the full job description lives on
// the original posting". Por isso a descricao vem da ORIGEM: API publica do
// Greenhouse, Ashby ou Lever quando o link e deles. Outras origens ficam
// pendentes para leitura assistida: links do indice nunca autorizam requisicoes
// arbitrarias. A pagina publica do UX Jobs e a primeira tentativa.
//
// O PAIS E O PONTO FRACO. Vaga "Remote" com pais vazio e, na maioria, so EUA:
// no teste, das 54 ineditas, 18 eram so EUA ou outra regiao e 20 nao davam
// pista nenhuma. NAO filtrar pais pelo texto aqui. Cortamos so o que o indice
// declara (pais diferente do Brasil,
// quadro ucraniano, "North America", "EMEA", "Europe"); o resto passa marcado
// e quem corta e a leitura semantica.
import { limparHtml, dormir, normalizarTexto, casaTermo, novoContador } from '../util.js';
import { palavras } from '../config.js';
import { urlPublica } from './importadas.js';

const BASE = 'https://jobs.uxjobs.io';
export const NOME = 'UX Jobs';

const PAUSA_MS = 500;
const DIAS_MAX = 45;
const SEGMENTO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,299}$/;
const MAX_BYTES = 5 * 1024 * 1024;
const DESTINOS = {
  'jobs.uxjobs.io': /^\/(?:jobs\/[A-Za-z0-9][A-Za-z0-9_-]{0,299}\/)?$/,
  'boards-api.greenhouse.io': /^\/v1\/boards\/[A-Za-z0-9][A-Za-z0-9._-]{0,199}\/jobs\/\d+$/,
  'api.ashbyhq.com': /^\/posting-api\/job-board\/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/,
  'api.lever.co': /^\/v0\/postings\/[A-Za-z0-9][A-Za-z0-9._-]{0,199}\/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/,
};

function urlHttps(valor) {
  const segura = urlPublica(valor);
  if (!segura) return null;
  const u = new URL(segura);
  return u.protocol === 'https:' && !u.port ? u : null;
}

// Somente destinos fixos e caminhos validados. O prazo cobre o corpo inteiro;
// redirects nunca sao seguidos, nem mesmo de um host permitido para outro.
async function buscarPermitido(url, { fetchImpl = globalThis.fetch, texto = false, timeoutMs = 20000 } = {}) {
  const u = urlHttps(url);
  if (!u || u.search || !DESTINOS[u.hostname]?.test(u.pathname)) throw new Error('Destino de enriquecimento nao permitido.');
  const ctrl = new AbortController();
  let timer, leitor;
  const prazo = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 40000) : 20000;
  try {
    return await Promise.race([
      (async () => {
        const res = await fetchImpl(u.href, {
          redirect: 'error', signal: ctrl.signal,
          headers: { Accept: texto ? 'text/html' : 'application/json' },
        });
        if (!res.ok || res.redirected) throw new Error('Leitura publica recusada.');
        if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('Resposta acima do limite.');
        if (!res.body?.getReader) throw new Error('Resposta sem corpo legivel.');
        leitor = res.body.getReader();
        const partes = [];
        let bytes = 0;
        while (true) {
          const { done, value } = await leitor.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_BYTES) throw new Error('Resposta acima do limite.');
          partes.push(value);
        }
        const corpo = Buffer.concat(partes).toString('utf8');
        return texto ? corpo : JSON.parse(corpo);
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => { ctrl.abort(); reject(new Error('Prazo de leitura esgotado.')); }, prazo);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    ctrl.abort();
    leitor?.cancel().catch(() => {});
  }
}

/** Local que aceita alguem no Brasil. Lista fechada, como na UX Remote Talent. */
const ACEITA_BRASIL = /anywhere|worldwide|latin america|latam|south america|americas|brazil|brasil|international|global/i;

/** Local que sabidamente exclui o Brasil, quando o pais vem vazio no indice. */
const EXCLUI_BRASIL = /north america|united states|\busa\b|\bus\b|canada|europe|european|emea|\buk\b|india|ukraine|apac/i;

/**
 * Quadros que o UX Jobs agrega e que so publicam para um pais. O DOU e o
 * quadro ucraniano: no teste, todas as vagas dele eram "Remote" so na Ucrania.
 */
const ORIGEM_EXCLUIDA = ['DOU (Ukraine)'];

/** Le o bloco jobs-data da home. Formato estranho ou ausente devolve lista vazia. */
export function lerIndice(html) {
  const m = /<script[^>]*id="jobs-data"[^>]*>([\s\S]*?)<\/script>/.exec(String(html || ''));
  if (!m) return [];
  try {
    const lista = JSON.parse(m[1]);
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

/**
 * @returns {true|false|null} true aceita, false exclui, null desconhecido.
 * Desconhecido PASSA: descartar por falta de dado ja custou 57 vagas boas.
 */
export function aceitaBrasil(j) {
  if (ORIGEM_EXCLUIDA.includes(j.sl)) return false;
  if (j.c === 'BR') return true;
  const local = String(j.l || '');
  if (ACEITA_BRASIL.test(local)) return true;
  if (j.c) return false;
  if (EXCLUI_BRASIL.test(local)) return false;
  return null;
}

/** O titulo do indice vem com " - Empresa" no fim. */
export function tituloLimpo(j) {
  const t = String(j.t || '').trim();
  const co = String(j.co || '').trim();
  if (co && t.toLowerCase().endsWith(` - ${co.toLowerCase()}`)) return t.slice(0, t.length - co.length - 3).trim();
  return t;
}

function interessa(titulo) {
  const t = normalizarTexto(titulo);
  if (!t) return false;
  if ((palavras.cargo_excluido || []).some((x) => casaTermo(t, x))) return false;
  if (palavras.titulo_excluido.some((x) => casaTermo(t, x))) return false;
  return Object.keys(palavras.titulo_aceito).some((k) => t.includes(normalizarTexto(k)));
}

/**
 * Item do indice vira vaga, ou null quando o proprio indice ja diz que nao
 * serve: velha demais, hibrida ou presencial, pais que exclui o Brasil,
 * junior pelo rotulo da fonte, ou titulo fora da area.
 */
export function paraVaga(j, agora = Date.now()) {
  if (typeof j?.s !== 'string' || !SLUG.test(j.s)) return null;
  const origem = urlHttps(j.u);
  if (!origem) return null;
  if (typeof j.p === 'number' && (agora - j.p) / 864e5 > DIAS_MAX) return null;
  if (j.wp === 'Hybrid' || j.wp === 'On-site') return null;
  const aceita = aceitaBrasil(j);
  if (aceita === false) return null;
  const remoto = j.rm === 1 || j.wp === 'Remote';
  // Sem sinal de remoto, so entra o que esta no Brasil: o filtro de modalidade
  // decide depois, pelo texto. Fora do Brasil sem remoto e presencial la fora.
  if (!remoto && j.c !== 'BR') return null;
  if (j.sen === 'Junior / Entry') return null;
  const titulo = tituloLimpo(j);
  if (!interessa(titulo)) return null;
  return {
    idExterno: `uxjobs:${j.s}`,
    fonte: NOME,
    camada: 'API',
    titulo,
    empresa: j.co || null,
    descricao: null,
    descricaoPendente: true,
    // O link e o da ATS de origem, nao o do UX Jobs: e la que a candidatura
    // acontece, e e por ele que o dedupe acha a mesma vaga vinda de outra fonte.
    link: origem.href,
    paginaUxJobs: `${BASE}/jobs/${j.s}/`,
    cidade: null,
    estado: null,
    pais: j.c || null,
    local: j.l || null,
    modelo: remoto ? 'remoto' : null,
    remoto,
    restricaoPais: j.l || null,
    aceitaBrasil: aceita,
    origemAgregada: j.sl || null,
    publicadaEm: typeof j.p === 'number' ? new Date(j.p).toISOString() : null,
    atualizadaEm: null,
    prazo: null,
    salarioBruto: null,
    statusFonte: 'aberta',
    validada: true,
  };
}

/** JobPosting em ld+json da pagina /jobs/<slug>/. Sem ele, null. */
export function lerDetalhe(html) {
  for (const m of String(html || '').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const x = JSON.parse(m[1]);
      if (x?.['@type'] === 'JobPosting' && x.description) {
        const t = limparHtml(x.description);
        // Parte das paginas traz so um TRECHO do anuncio, terminado em
        // reticencias (o "JD-excerpt experiment" do robots.txt deles). Trecho
        // nao serve para ler a vaga: devolve null e a descricao vem da origem.
        // Visto em 2026-10-07 na Breakmark e na Docplanner.
        if (t && t.length > 40 && !/(…|\.\.\.)\s*$/.test(t)) return t;
      }
    } catch {
      // bloco quebrado: tenta o proximo
    }
  }
  return null;
}

/** Apenas APIs publicas conhecidas; outras origens permanecem para leitura assistida. */
export async function descricaoDaOrigem(link, opcoes = {}) {
  const u = urlHttps(link);
  if (!u) return null;
  const p = u.pathname.split('/').filter(Boolean);
  if (['boards.greenhouse.io', 'job-boards.greenhouse.io'].includes(u.hostname)) {
    const id = u.searchParams.get('gh_jid') || (p[1] === 'jobs' ? p[2] : null);
    if (SEGMENTO.test(p[0] || '') && /^\d+$/.test(id || '') &&
        (p.length === 1 || p.length === 3 && p[1] === 'jobs' && /^\d+$/.test(p[2]))) {
      const j = await buscarPermitido(`https://boards-api.greenhouse.io/v1/boards/${p[0]}/jobs/${id}`, opcoes);
      return limparHtml(j?.content) || null;
    }
  }
  if (u.hostname === 'jobs.ashbyhq.com' && p.length === 2 && p.every(x => SEGMENTO.test(x))) {
    const j = await buscarPermitido(`https://api.ashbyhq.com/posting-api/job-board/${p[0]}`, opcoes);
    const x = (Array.isArray(j?.jobs) ? j.jobs : []).find(y => y.id === p[1]);
    return x ? limparHtml(x.descriptionPlain || x.descriptionHtml) || null : null;
  }
  if (u.hostname === 'jobs.lever.co' && p.length === 2 && p.every(x => SEGMENTO.test(x))) {
    const j = await buscarPermitido(`https://api.lever.co/v0/postings/${p[0]}/${p[1]}`, opcoes);
    const listas = (Array.isArray(j?.lists) ? j.lists : []).map(l => `${l.text || ''} ${limparHtml(l.content)}`).join(' ');
    return limparHtml(`${j?.descriptionPlain || j?.description || ''} ${listas}`) || null;
  }
  return null;
}

export async function coletar({ fetchImpl = globalThis.fetch, pausaMs = PAUSA_MS, timeoutMs = 40000 } = {}) {
  const c = novoContador(NOME);
  c.consultadas++;
  let html;
  try {
    html = await buscarPermitido(`${BASE}/`, { fetchImpl, texto: true, timeoutMs });
  } catch {
    c.falhas++;
    return { vagas: [], contador: c };
  }
  const indice = lerIndice(html);
  c.brutas += indice.length;

  const vagas = [];
  const vistos = new Set();
  for (const j of indice) {
    const v = paraVaga(j);
    if (!v || vistos.has(v.idExterno)) continue;
    vistos.add(v.idExterno);
    vagas.push(v);
  }

  for (const v of vagas) {
    try {
      v.descricao = lerDetalhe(await buscarPermitido(v.paginaUxJobs, { fetchImpl, texto: true, timeoutMs }));
      await dormir(pausaMs);
      if (!v.descricao) v.descricao = await descricaoDaOrigem(v.link, { fetchImpl, timeoutMs });
    } catch {
      // Origem que recusa (403 no teste de 2026-10-06) so custa a descricao.
      c.falhas++;
    }
    v.descricaoPendente = !v.descricao;
    await dormir(pausaMs);
  }

  return { vagas, contador: c };
}

