// Listagens públicas: descobre links verificáveis; não contorna login/CAPTCHA.
// Sem descrição estruturada, o anúncio fica pendente para leitura antes de aplicar.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { RAIZ } from '../config.js';
import { limparHtml, novoContador } from '../util.js';
export const NOME = 'Portais públicos';
export const PORTAIS = {
  vanhack: { nome: 'VanHack', url: 'https://app.vanhack.com/jobs', host: 'app.vanhack.com', path: /^\/job\/\d+\/?$/ },
  trampos: { nome: 'Trampos', url: 'https://trampos.co/oportunidades', host: 'trampos.co', path: /^\/oportunidades\/\d+-[^/]+\/?$/ },
  dribbble: { nome: 'Dribbble Jobs', url: 'https://dribbble.com/jobs', host: 'dribbble.com', path: /^\/jobs\/\d+-[^/]+\/?$/ },
  wellfound: { nome: 'Wellfound', url: 'https://wellfound.com/jobs', host: 'wellfound.com', path: /^\/jobs\/\d+-[^/]+\/?$/ },
  authenticjobs: { nome: 'Authentic Jobs', url: 'https://authenticjobs.com', assistida: true },
};
export function linkDaVaga(valor, portal) {
  try {
    const u = new URL(valor, portal.url);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hostname !== portal.host || !portal.path?.test(u.pathname)) return null;
    u.search = ''; u.hash = ''; return u.href;
  } catch { return null; }
}
function objetosJsonLd(html) {
  const out = [];
  function visitar(v) {
    if (Array.isArray(v)) return v.forEach(visitar);
    if (!v || typeof v !== 'object') return;
    const tipos = Array.isArray(v['@type']) ? v['@type'] : [v['@type']];
    if (tipos.includes('JobPosting')) out.push(v);
    if (v['@graph']) visitar(v['@graph']);
    if (v.itemListElement) visitar(v.itemListElement.map(x => x.item || x));
  }
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visitar(JSON.parse(m[1])); } catch { /* dados inválidos não viram fatos */ }
  }
  return out;
}
function dataEstrita(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(valor)) return null;
  const calendario = new Date(`${valor.slice(0,10)}T00:00:00Z`);
  if (Number.isNaN(calendario.getTime()) || calendario.toISOString().slice(0,10) !== valor.slice(0,10)) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}
export function lerPagina(html, id) {
  const portal = PORTAIS[id];
  if (!portal || portal.assistida) return [];
  const vagas = new Map();
  function adicionar(link, titulo, j = {}) {
    const url = linkDaVaga(link, portal);
    titulo = limparHtml(titulo);
    if (!url || !titulo || titulo.length < 3 || titulo.length > 240) return;
    const descricao = limparHtml(j.description || '');
    const data = dataEstrita(j.datePosted);
    const local = j.jobLocation?.address;
    const remoto = j.jobLocationType === 'TELECOMMUTE' ? true : null;
    const vaga = {
      idExterno: `${id}:${createHash('sha1').update(url).digest('hex').slice(0, 12)}`,
      fonte: portal.nome, camada: 'HTML público', titulo,
      empresa: j.hiringOrganization?.name || null, descricao, link: url,
      cidade: local?.addressLocality || null, estado: local?.addressRegion || null,
      pais: local?.addressCountry || null, modelo: remoto ? 'remoto' : null, remoto,
      publicadaEm: data,
      atualizadaEm: null, prazo: dataEstrita(j.validThrough), salarioBruto: null,
      statusFonte: null, validada: false, descricaoPendente: !descricao,
      elegibilidadeLatam: null, elegibilidadeMotivo: 'Conferir região e anúncio original antes de aplicar.',
    };
    if (!vagas.has(url) || descricao) vagas.set(url, vaga);
  }
  for (const j of objetosJsonLd(String(html || ''))) adicionar(j.url, j.title, j);
  for (const m of String(html || '').matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    adicionar(m[1].replace(/&amp;/g, '&'), m[2]);
  }
  return [...vagas.values()];
}
async function buscarPagina(url, fetchImpl) {
  const c = new AbortController(); const timer = setTimeout(() => c.abort(), 15000);
  try {
    const r = await fetchImpl(url, { redirect: 'error', signal: c.signal, headers: { Accept: 'text/html' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (Number(r.headers?.get('content-length')) > 3_000_000) throw new Error('Página acima do limite de leitura.');
    const html = await r.text();
    if (html.length > 3_000_000) throw new Error('Página acima do limite de leitura.');
    return html;
  } finally { clearTimeout(timer); }
}
export async function coletarDe(fontes, { fetchImpl = globalThis.fetch, incluirDesign = true } = {}) {
  const contador = novoContador(NOME); const vagas = []; const porFonte = {};
  for (const f of fontes) {
    const p = PORTAIS[f.id];
    if (!p || !f.enabled || (f.id === 'dribbble' && !incluirDesign)) continue;
    if (p.assistida) {
      porFonte[p.nome] = { brutas: 0, aproveitadas: 0, estado: 'assistida', aviso: 'Listagem exige verificação no navegador; sem coletor direto comprovado.' };
      continue;
    }
    contador.consultadas++;
    try {
      const lista = lerPagina(await buscarPagina(p.url, fetchImpl), f.id);
      vagas.push(...lista); contador.brutas += lista.length;
      porFonte[p.nome] = { brutas: lista.length, aproveitadas: lista.length, estado: lista.length ? 'links_descobertos' : 'sem_links_verificaveis', aviso: lista.length ? 'Anúncios aguardam leitura e validação de região.' : 'Lista vazia, HTML alterado ou conteúdo dinâmico. Conferir no navegador; não prova ausência de vagas.' };
    } catch (e) {
      contador.falhas++;
      const status = String(e?.message || '').match(/^HTTP \d{3}$/)?.[0];
      porFonte[p.nome] = { brutas: 0, aproveitadas: 0, estado: 'indisponivel', erro: status || 'Falha ou limite na leitura pública; confira no navegador.' };
    }
  }
  return { vagas, contador, porFonte };
}
export async function coletar(opcoes = {}) {
  return coletarDe(JSON.parse(readFileSync(join(RAIZ, 'config/fontes-portais.json'), 'utf8')).fontes, opcoes);
}
