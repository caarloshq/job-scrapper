// Importação opcional de Indeed/Glassdoor. Não faz scraping nem inicia Actors.
// A única chamada externa permitida é GET de um dataset Apify já existente.
import { open, lstat, realpath, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DIR_DADOS, RAIZ } from '../config.js';
import { limparHtml, normalizarLink, novoContador } from '../util.js';

export const NOME = 'Importadas';
const FONTES = new Set(['Indeed', 'Glassdoor']);
const CAMPOS = ['title', 'url', 'company', 'location', 'description', 'publishedAt', 'id'];
const MAX_BYTES = 10 * 1024 * 1024;
const MENSAGENS = Object.freeze({
  configuracao: 'Configuração de importação inválida ou ausente.',
  arquivo: 'Arquivo JSON indisponível, inválido ou fora da pasta data.',
  tamanho: 'Arquivo ou resposta excedeu o limite de bytes.',
  esquema: 'Importação exige uma lista JSON de objetos com título e URL mapeados.',
  token: 'Falta APIFY_TOKEN no ambiente para ler o dataset existente.',
  rede: 'Falha ao ler o dataset existente; detalhes externos foram omitidos.',
  tempo: 'Tempo limite ao ler o dataset existente, incluindo seu corpo.',
  http: 'A API recusou a leitura do dataset existente.',
  paginacao: 'Resposta de paginação inconsistente; importação incompleta.',
});
class FalhaImportacao extends Error {
  constructor(codigo) { super(MENSAGENS[codigo]); this.codigo = codigo; }
}
const falhar = (codigo) => { throw new FalhaImportacao(codigo); };
const objeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const texto = (x) => typeof x === 'string' ? limparHtml(x).trim() : '';
const hash = (x) => createHash('sha256').update(x).digest('hex').slice(0, 32);

function caminhoValido(p) {
  return typeof p === 'string' && p.length <= 200 && p.split('.').length <= 8 &&
    p.split('.').every((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) &&
      !['__proto__', 'constructor', 'prototype'].includes(s));
}
function mapaValido(campos) {
  return objeto(campos) && CAMPOS.every((c) => Object.hasOwn(campos, c) &&
    (c !== 'title' && c !== 'url' && campos[c] === null || caminhoValido(campos[c])));
}
function campo(item, caminho) {
  if (caminho === null) return null;
  let valor = item;
  for (const parte of caminho.split('.')) {
    if (!objeto(valor) || !Object.hasOwn(valor, parte)) return null;
    valor = valor[parte];
  }
  return valor;
}

/** URLs públicas apenas. Não resolve DNS nem visita anúncios. */
export function urlPublica(valor) {
  if (typeof valor !== 'string' || valor.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(valor)) return null;
  try {
    const u = new URL(valor);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return null;
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    // Apenas domínios web: todos os IPs literais, inclusive formas numéricas
    // normalizadas por URL, e nomes locais ficam fora. Não há fetch deste link.
    if (isIP(host.replace(/^\[|\]$/g, '')) || !host.includes('.') ||
      /(^|\.)(localhost|local|internal|intranet|lan|home|test|invalid)$/.test(host) ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]+$/.test(host)) return null;
    // Não persistir tokens, assinaturas ou senhas trazidos por links de exportação.
    if ([...u.searchParams.keys()].some((k) => /token|secret|password|passwd|authorization|credential|signature|api[_-]?key|^key$|^sig$/i.test(k))) return null;
    u.hash = '';
    return u.href;
  } catch { return null; }
}

function dataPublicada(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(valor)) return null;
  if (valor.includes('T') && (Number(valor.slice(11, 13)) > 23 || Number(valor.slice(14, 16)) > 59 || Number(valor.slice(17, 19)) > 59)) return null;
  const [ano, mes, dia] = valor.slice(0, 10).split('-').map(Number);
  const calendario = new Date(`${valor.slice(0, 10)}T00:00:00Z`);
  if (calendario.getUTCFullYear() !== ano || calendario.getUTCMonth() + 1 !== mes || calendario.getUTCDate() !== dia) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

/** Mapeamento explícito, sem presumir o schema de um Actor de terceiros. */
export function normalizar(item, fonte) {
  if (!objeto(item) || !objeto(fonte) || !FONTES.has(fonte.fonte) || !mapaValido(fonte.campos)) return null;
  const ler = (nome) => campo(item, fonte.campos[nome]);
  const titulo = texto(ler('title'));
  const link = urlPublica(ler('url'));
  if (!titulo || !link) return null;
  const id = ler('id');
  const idSeguro = (typeof id === 'string' || typeof id === 'number') && /^[A-Za-z0-9_-]{1,200}$/.test(String(id)) ? String(id) : null;
  const descricao = texto(ler('description'));
  return {
    idExterno: `${fonte.fonte.toLowerCase()}:${idSeguro || `url-${hash(normalizarLink(link))}`}`,
    fonte: fonte.fonte,
    camada: 'Importação',
    titulo,
    empresa: texto(ler('company')) || null,
    descricao: descricao || null,
    link,
    // location é texto bruto, não uma cidade ou país comprovados.
    localizacao: texto(ler('location')) || null,
    cidade: null, estado: null, pais: null,
    modelo: null, remoto: null,
    publicadaEm: dataPublicada(ler('publishedAt')),
    atualizadaEm: null, prazo: null, salarioBruto: null, statusFonte: null,
    validada: false,
    descricaoPendente: !descricao,
  };
}

function inteiro(valor, padrao, maximo) {
  if (valor === undefined) return padrao;
  if (!Number.isSafeInteger(valor) || valor < 1 || valor > maximo) falhar('configuracao');
  return valor;
}
function validarFonte(fonte) {
  if (!objeto(fonte) || !FONTES.has(fonte.fonte) || fonte.habilitada !== true ||
    !['local-json', 'apify-dataset'].includes(fonte.tipo) || !mapaValido(fonte.campos)) falhar('configuracao');
  const opcoes = {
    maxBytes: inteiro(fonte.maxBytes, 5 * 1024 * 1024, MAX_BYTES),
    maxItens: inteiro(fonte.maxItens, 1000, 10000),
    maxPaginas: inteiro(fonte.maxPaginas, 10, 100),
    limitePorPagina: inteiro(fonte.limitePorPagina, 100, 1000),
    timeoutMs: inteiro(fonte.timeoutMs, 20000, 60000),
  };
  // Não aceitar segredos em configuração ou caminhos arbitrários de API.
  if (['token', 'apiKey', 'url', 'actor', 'actorId', 'taskId'].some((k) => Object.hasOwn(fonte, k))) falhar('configuracao');
  if (fonte.tipo === 'apify-dataset' && (typeof fonte.datasetId !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(fonte.datasetId))) falhar('configuracao');
  return opcoes;
}

async function lerLocal(arquivo, dirDados, maxBytes) {
  let handle;
  try {
    if (typeof arquivo !== 'string' || isAbsolute(arquivo) || arquivo.includes('\\') ||
      !/\.json$/i.test(arquivo) || arquivo.split('/').some((p) => !p || p === '.' || p === '..')) falhar('arquivo');
    const raiz = resolve(dirDados);
    if (!(await lstat(raiz)).isDirectory() || (await lstat(raiz)).isSymbolicLink()) falhar('arquivo');
    const raizReal = await realpath(raiz);
    let atual = raiz;
    for (const parte of arquivo.split('/')) {
      atual = join(atual, parte);
      if ((await lstat(atual)).isSymbolicLink()) falhar('arquivo');
    }
    const caminhoReal = await realpath(atual);
    const dentro = relative(raizReal, caminhoReal);
    if (!dentro || dentro === '..' || dentro.startsWith(`..${sep}`) || isAbsolute(dentro)) falhar('arquivo');
    const antes = await lstat(caminhoReal);
    if (!antes.isFile()) falhar('arquivo');
    handle = await open(caminhoReal, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.dev !== antes.dev || stat.ino !== antes.ino) falhar('arquivo');
    if (stat.size > maxBytes) falhar('tamanho');
    const buffer = Buffer.alloc(maxBytes + 1);
    let lidos = 0;
    while (lidos < buffer.length) {
      const { bytesRead } = await handle.read(buffer, lidos, buffer.length - lidos, null);
      if (!bytesRead) break;
      lidos += bytesRead;
    }
    if (lidos > maxBytes) falhar('tamanho');
    try { return JSON.parse(buffer.subarray(0, lidos).toString('utf8')); }
    catch { falhar('esquema'); }
  } catch (e) {
    if (e instanceof FalhaImportacao) throw e;
    falhar('arquivo');
  } finally { await handle?.close(); }
}

async function lerCorpo(res, maxBytes, signal) {
  const tamanho = res.headers.get('content-length');
  if (tamanho !== null && Number(tamanho) > maxBytes) falhar('tamanho');
  const tipo = res.headers.get('content-type') || '';
  if (!/^application\/json(?:\s*;|$)/i.test(tipo) || !res.body?.getReader) falhar('esquema');
  const leitor = res.body.getReader();
  const cancelar = () => { leitor.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancelar, { once: true });
  const partes = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) falhar('tamanho');
      partes.push(value);
    }
    try { return JSON.parse(Buffer.concat(partes).toString('utf8')); }
    catch { falhar('esquema'); }
  } catch (e) {
    leitor.cancel().catch(() => {});
    throw e;
  } finally { signal.removeEventListener('abort', cancelar); leitor.releaseLock(); }
}

async function paginaDataset(fonte, opcoes, offset, limite, fetchImpl, env) {
  const token = env.APIFY_TOKEN;
  if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) falhar('token');
  const url = new URL(`https://api.apify.com/v2/datasets/${fonte.datasetId}/items`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', String(limite));
  const ctrl = new AbortController();
  let timer;
  const expiracao = new Promise((_, reject) => {
    timer = setTimeout(() => { ctrl.abort(); reject(new FalhaImportacao('tempo')); }, opcoes.timeoutMs);
  });
  try {
    return await Promise.race([expiracao, (async () => {
      const res = await fetchImpl(url.href, {
        method: 'GET', redirect: 'error', signal: ctrl.signal,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token.trim()}` },
      });
      if (!res.ok || res.redirected) falhar('http');
      const dados = await lerCorpo(res, opcoes.maxBytes, ctrl.signal);
      const numeroHeader = (chave) => {
        const valor = res.headers.get(chave);
        if (valor === null) return null;
        if (!/^\d+$/.test(valor) || !Number.isSafeInteger(Number(valor))) falhar('paginacao');
        return Number(valor);
      };
      const inicio = numeroHeader('x-apify-pagination-offset');
      const total = numeroHeader('x-apify-pagination-total');
      const limiteAplicado = numeroHeader('x-apify-pagination-limit');
      if (limiteAplicado !== null && limiteAplicado !== limite) falhar('paginacao');
      if (inicio !== null && inicio !== offset) falhar('paginacao');
      return { dados, total };
    })()]);
  } catch (e) {
    if (e instanceof FalhaImportacao) throw e;
    falhar('rede');
  } finally { clearTimeout(timer); ctrl.abort(); }
}

function contar(fonte) {
  return { ...novoContador(fonte), status: 'pendente', importadas: 0, invalidas: 0, duplicadas: 0, truncada: false, completa: false, avisos: [] };
}
function registrarFalha(contador, erro) {
  contador.falhas++;
  contador.status = contador.importadas ? 'parcial' : 'erro';
  contador.completa = false;
  contador.erro = erro instanceof FalhaImportacao ? erro.message : MENSAGENS.rede;
}

/** Injeção de fetch/env/data exclusivamente para testes offline e reutilização. */
export async function coletarDe(config, { fetchImpl = globalThis.fetch, env = process.env, dirDados = DIR_DADOS } = {}) {
  const contador = { ...contar(NOME), fontes: [] };
  const vagas = new Map();
  if (!objeto(config) || !Array.isArray(config.fontes) || !config.fontes.length || config.fontes.length > 20) {
    registrarFalha(contador, new FalhaImportacao('configuracao'));
    return { vagas: [], contador };
  }
  for (const fonte of config.fontes) {
    const c = contar(FONTES.has(fonte?.fonte) ? fonte.fonte : NOME);
    contador.fontes.push(c);
    if (objeto(fonte) && FONTES.has(fonte.fonte) && fonte.habilitada === false) {
      c.status = 'desativada';
      c.avisos.push('Importação desativada; nenhum arquivo ou dataset foi lido.');
      continue;
    }
    try {
      const opcoes = validarFonte(fonte);
      const adicionar = (dados) => {
        if (!Array.isArray(dados)) falhar('esquema');
        c.brutas += dados.length;
        for (const item of dados) {
          const vaga = normalizar(item, fonte);
          if (!vaga) { c.invalidas++; continue; }
          if (vagas.has(vaga.idExterno)) { c.duplicadas++; continue; }
          vagas.set(vaga.idExterno, vaga);
          c.importadas++;
        }
      };
      if (fonte.tipo === 'local-json') {
        c.consultadas++;
        const dados = await lerLocal(fonte.arquivo, dirDados, opcoes.maxBytes);
        if (!Array.isArray(dados)) falhar('esquema');
        c.truncada = dados.length > opcoes.maxItens;
        adicionar(dados.slice(0, opcoes.maxItens));
        c.totalDisponivel = dados.length;
      } else {
        let offset = 0;
        for (let pagina = 0; pagina < opcoes.maxPaginas && offset < opcoes.maxItens; pagina++) {
          const limite = Math.min(opcoes.limitePorPagina, opcoes.maxItens - offset);
          c.consultadas++;
          const { dados, total } = await paginaDataset(fonte, opcoes, offset, limite, fetchImpl, env);
          if (!Array.isArray(dados)) falhar('esquema');
          if (dados.length > limite || total !== null && total < offset + dados.length) falhar('paginacao');
          adicionar(dados);
          offset += dados.length;
          c.totalDisponivel = total;
          // Sem total, uma página cheia no teto não comprova conclusão.
          const terminou = total !== null ? offset >= total : dados.length < limite;
          if (!dados.length && !terminou) falhar('paginacao');
          c.truncada = !terminou;
          if (terminou) break;
        }
      }
      if (c.invalidas) c.avisos.push('Itens inválidos foram descartados; revise o mapeamento de campos e URLs.');
      if (c.brutas > 0 && c.invalidas === c.brutas) falhar('esquema');
      if (c.truncada) c.avisos.push('Limite de importação atingido; podem existir itens não lidos.');
      c.completa = !c.truncada && c.invalidas === 0;
      c.status = c.completa ? (c.brutas ? 'ok' : 'vazia') : 'parcial';
    } catch (e) { registrarFalha(c, e); }
  }
  for (const c of contador.fontes) {
    for (const k of ['consultadas', 'brutas', 'falhas', 'importadas', 'invalidas', 'duplicadas']) contador[k] += c[k];
    contador.truncada ||= c.truncada;
  }
  const ativas = contador.fontes.filter((c) => c.status !== 'desativada');
  contador.completa = ativas.length > 0 && ativas.every((c) => c.completa);
  contador.status = !ativas.length ? 'desativada' : contador.completa ? (contador.brutas ? 'ok' : 'vazia') : contador.importadas ? 'parcial' : 'erro';
  contador.erro = ativas.filter((c) => c.erro).map((c) => `${c.fonte}: ${c.erro}`).join(' ') || null;
  contador.avisos = contador.fontes.flatMap((c) => c.avisos.map((a) => `${c.fonte}: ${a}`));
  return { vagas: [...vagas.values()], contador };
}

export async function coletar() {
  let config;
  try {
    config = JSON.parse(await readFile(join(RAIZ, 'config', 'fontes-importadas.json'), 'utf8'));
  } catch {
    return coletarDe(null);
  }
  return coletarDe(config);
}
