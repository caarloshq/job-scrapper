// Fontes internacionais do career-ops, ligadas no nosso coletor.
//
// As fontes em si sao copia do upstream (careerops/CREDITO.md) e continuam
// falando o contrato delas: fetch(entrada, ctx) devolve {title, url, company,
// location, description?, postedAt?}. Este arquivo so traduz para a vaga do
// JobRelay aplica as duas portas que o career-ops nao tem do nosso jeito:
// o titulo da area e o "aceita Brasil" de intl.js.
//
// O filtro de elegibilidade lê a região inteira; remoto não implica Brasil/LATAM.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { limparHtml, novoContador, normalizarTexto, normalizarLink, casaTermo } from '../util.js';
import { palavras } from '../config.js';
import { avaliarElegibilidade } from './intl.js';

export const NOME = 'Gringas (career-ops)';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CONFIG = join(AQUI, '..', '..', 'config', 'fontes-gringas.json');
const PROVEDORES = join(AQUI, 'careerops', 'providers');

function interessa(titulo, criterios = palavras) {
  const t = normalizarTexto(titulo);
  if (!t) return false;
  if ((criterios.cargo_excluido || []).some((x) => casaTermo(t, x))) return false;
  if ((criterios.titulo_excluido || []).some((x) => casaTermo(t, x))) return false;
  return Object.keys(criterios.titulo_aceito || {}).some((k) => t.includes(normalizarTexto(k)));
}

/** "Remote · Chile · Brazil", "United States, Remote", "Remote — Cyprus, Czechia". */
export function partesDoLocal(local) {
  return String(local || '')
    .split(/\s*[·;|—–]\s*|\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Id estavel entre rodadas: link inteiro + titulo, resumidos.
 *
 * Ja foi o ultimo pedaco da URL, e o code review de 2026-09-23 mediu o estrago:
 * no Hacker News o link costuma ser a home da empresa (duas vagas da Modash, um
 * id so), e no Remotli links de ATS diferentes terminam igual. 67 de 257 e 42 de
 * 695 vagas sumiam como repetidas.
 */
function idDaVaga(url, titulo) {
  const chave = `${normalizarLink(url) || url}|${normalizarTexto(titulo)}`;
  return createHash('sha1').update(chave).digest('hex').slice(0, 12);
}

/** @returns {object|null} a vaga no formato do JobRelay, ou null se nao serve */
export function paraVaga(item, entrada, idProvedor, criterios = palavras) {
  if (!item?.url || !interessa(item.title, criterios)) return null;
  const descricao = limparHtml(item.description || '');
  const eleg = avaliarElegibilidade({ restricoes: partesDoLocal(item.location), descricao });
  if (!eleg.entra) return null;

  const pub = Number.isFinite(item.postedAt) ? new Date(item.postedAt) : null;
  return {
    idExterno: `${idProvedor}:${idDaVaga(item.url, item.title)}`,
    fonte: entrada.name,
    camada: 'API',
    titulo: item.title,
    empresa: item.company || null,
    descricao,
    link: item.url,
    cidade: null,
    estado: null,
    pais: item.location || null,
    modelo: /\b(remote|remoto)\b/i.test(item.location || '') ? 'remoto' : null,
    remoto: /\b(remote|remoto)\b/i.test(item.location || '') ? true : null,
    publicadaEm: pub && !Number.isNaN(pub.getTime()) ? pub.toISOString() : null,
    atualizadaEm: null,
    prazo: null,
    salarioBruto: null,
    statusFonte: null,
    validada: true,
    elegibilidadeLatam: eleg.latam,
    elegibilidadeMotivo: eleg.motivo,
  };
}

async function carregarProvedor(id) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('Identificador de fonte inválido.');
  const mod = await import(pathToFileURL(join(PROVEDORES, `${id}.mjs`)).href);
  return mod.default;
}

async function contexto() {
  const http = await import(pathToFileURL(join(PROVEDORES, '_http.mjs')).href);
  return { ...http.makeHttpCtx(), sinceMs: null, includeUndated: true, locationHints: null };
}

/**
 * Uma fonte que quebra vira falha no contador, nunca derruba as outras: o
 * estado de falha fica separado de uma resposta válida sem vagas.
 */
export async function coletarDe(fontes, carregar = carregarProvedor, ctx = {}, criterios = palavras) {
  const c = novoContador(NOME);
  const vagas = [];
  const vistos = new Set();
  const porFonte = {};

  for (const entrada of expandirConsultas(fontes, criterios).filter((f) => f.enabled)) {
    c.consultadas++;
    porFonte[entrada.name] ||= { brutas: 0, aproveitadas: 0, erro: null };
    try {
      const provedor = await carregar(entrada.provider);
      const itens = await provedor.fetch(entrada, ctx);
      const lista = Array.isArray(itens) ? itens : [];
      c.brutas += lista.length;
      porFonte[entrada.name].brutas += lista.length;
      for (const item of lista) {
        const v = paraVaga(item, entrada, entrada.provider, criterios);
        if (!v || vistos.has(v.idExterno)) continue;
        vistos.add(v.idExterno);
        vagas.push(v);
        porFonte[entrada.name].aproveitadas++;
      }
    } catch (e) {
      c.falhas++;
      porFonte[entrada.name].erro = String(e?.message || e).slice(0, 120);
    }
  }
  return { vagas, contador: c, porFonte };
}

export function expandirConsultas(fontes, criterios = palavras) {
  const termos = [...new Set((criterios.consultas_estreitas || Object.keys(criterios.titulo_aceito || {})).filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()))].slice(0, 5);
  return fontes.flatMap(f => {
    if (!termos.length) return [f];
    const e = structuredClone(f);
    if (e.builtin) e.builtin.queries = termos;
    if (e.wttj) e.wttj.queries = termos;
    if ('q' in e) e.q = termos[0];
    if ('search' in e) return termos.map(search => ({ ...e, search }));
    return [e];
  });
}

export async function coletar() {
  const { fontes } = JSON.parse(readFileSync(CONFIG, 'utf8'));
  return coletarDe(fontes, carregarProvedor, await contexto());
}

