// Utilitarios compartilhados. Sem dependencia externa: fetch e nativo no Node 20+.

/** Minusculas, sem acento, espacos colapsados. Base de toda comparacao de texto. */
export function normalizarTexto(s) {
  if (!s) return '';
  return String(s)
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Entidades nomeadas do Latin-1. A InHire serve descricao inteira assim:
// "concep&ccedil;&atilde;o", "S&ecirc;nior". Sem decodificar, o texto que vai
// para o score semantico e para o Notion fica ilegivel.
const NOMEADAS = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  aacute: 'á', agrave: 'à', atilde: 'ã', acirc: 'â', auml: 'ä', aring: 'å', aelig: 'æ',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
  oacute: 'ó', ograve: 'ò', otilde: 'õ', ocirc: 'ô', ouml: 'ö', oslash: 'ø',
  uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
  ccedil: 'ç', ntilde: 'ñ', yacute: 'ý',
  Aacute: 'Á', Agrave: 'À', Atilde: 'Ã', Acirc: 'Â', Auml: 'Ä',
  Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Euml: 'Ë',
  Iacute: 'Í', Icirc: 'Î', Oacute: 'Ó', Otilde: 'Õ', Ocirc: 'Ô', Ouml: 'Ö',
  Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü', Ccedil: 'Ç', Ntilde: 'Ñ',
  mdash: '—', ndash: '–', hellip: '…', lsquo: "'", rsquo: "'",
  ldquo: '"', rdquo: '"', bull: '·', middot: '·', deg: '°',
  euro: '€', pound: '£', yen: '¥', cent: '¢', copy: '©', reg: '®', trade: '™',
  laquo: '«', raquo: '»', sup2: '²', sup3: '³', frac12: '½',
};

/**
 * Remove tags HTML e decodifica entidade.
 *
 * A ORDEM IMPORTA e ja errou uma vez: decodificar VEM PRIMEIRO. O Greenhouse
 * entrega o conteudo com as tags escapadas (`&lt;div&gt;`), entao remover tags
 * antes de decodificar deixa passar o escapado, que vira tag visivel no texto.
 * A vaga da Arco chegou na fila de leitura com `<div class="content-intro">`
 * cru no meio da descricao.
 *
 * Decodifica, remove tag, decodifica de novo — a segunda passada pega entidade
 * que estava dentro do conteudo escapado.
 */
export function limparHtml(s) {
  if (!s) return '';
  return decodificar(decodificar(String(s)).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Uma passada de decodificacao: nomeadas e numericas. */
function decodificar(t) {
  return t
    .replace(/&([a-zA-Z][a-zA-Z0-9]{1,9});/g, (todo, nome) =>
      Object.prototype.hasOwnProperty.call(NOMEADAS, nome) ? NOMEADAS[nome] : todo
    )
    .replace(/&#39;/g, "'")
    // &#8211; e o en-dash, e sem decodificar ele nenhum split por travessao funciona.
    .replace(/&#(\d+);/g, (_, n) => seguroDoCodigo(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => seguroDoCodigo(parseInt(h, 16)));
}

function seguroDoCodigo(n) {
  if (!Number.isFinite(n) || n < 9 || n > 0x10ffff) return '';
  try {
    // catch com fallback, nao erro engolido: entrada malformada devolve vazio.
    return String.fromCodePoint(n);
  } catch {
    return '';
  }
}

/**
 * Chave de dedupe entre fontes diferentes.
 * A Remotar e ela mesma agregadora (integrationSource = inhire, recrutei, greenhouse),
 * entao a mesma vaga chega por mais de um caminho com utm_* diferente.
 */
export function normalizarLink(url) {
  if (!url) return '';
  try {
    const u = new URL(String(url).trim());
    for (const p of [...u.searchParams.keys()]) {
      // gh_src entrou em 2026-09-07: o link da Arco no Greenhouse chegou pela Remotar
      // com ?gh_src=5be8bfef3us e a mesma vaga JA APLICADA nao casou, porque o
      // parametro de rastreio sobrevivia na chave. Rastreio nunca identifica vaga.
      if (/^(utm_|jobBoardSource$|source$|ref$|fbclid$|gclid$|gh_src$|gh_jid$|origem$|lang$|locale$)/i.test(p)) u.searchParams.delete(p);
    }
    const path = u.pathname.replace(/\/+$/, '');
    const qs = u.searchParams.toString();
    return `${u.hostname.replace(/^www\./, '')}${path}${qs ? '?' + qs : ''}`.toLowerCase();
  } catch {
    // catch com fallback, nao erro engolido: URL malformada volta como string crua.
    return String(url).trim().toLowerCase();
  }
}

export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET com retry e timeout. Devolve null em vez de estourar: fonte quebrada nao derruba a rodada. */
export async function buscar(url, { headers = {}, tentativas = 3, timeoutMs = 25000, texto = false } = {}) {
  for (let i = 0; i < tentativas; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'Accept': texto ? 'text/html,*/*' : 'application/json', 'User-Agent': UA, ...headers },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        if (res.status === 404 || res.status === 400) return null;
        throw new Error(`HTTP ${res.status}`);
      }
      return texto ? await res.text() : await res.json();
    } catch (e) {
      clearTimeout(t);
      if (i === tentativas - 1) throw e;
      await dormir(600 * (i + 1));
    }
  }
  return null;
}

// Marcas combinantes. Escrito como escape ASCII de proposito: literal aqui
// e normalizado por alguns editores e a classe deixa de casar silenciosamente.
export const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g');

export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

/**
 * Casa um termo de exclusao respeitando limite de palavra.
 *
 * `includes` cru nao serve aqui. Termo curto vira estrago silencioso:
 * "cad" (software CAD) casou dentro de "Risco Sa-CAD-o" e descartou a melhor
 * vaga do board de UX em 2026-07-30. "3d" casaria em "R3D"; "ui" em "gratuito".
 *
 * A fronteira e no INICIO da palavra, com sufixo de plural opcional. Fronteira
 * nas duas pontas quebraria plural: "sobrancelha" nao casaria em "Designer de
 * Sobrancelhas". Sufixo arbitrario NAO passa, entao "cad" nao casa "cadastro"
 * e "moda" nao casa "modalidade".
 *
 * Termo com espaco ("banco de talentos") ja e especifico e casa como frase.
 */
export function casaTermo(texto, termo) {
  const t = normalizarTexto(texto);
  const alvo = normalizarTexto(termo);
  if (!t || !alvo) return false;
  if (alvo.includes(' ')) return t.includes(alvo);
  const esc = alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}(s|es|is)?([^a-z0-9]|$)`, 'i').test(t);
}

/** Verdadeiro se qualquer termo da lista casar. */
export function casaAlgum(texto, termos) {
  return (termos || []).some((x) => casaTermo(texto, x));
}

export function hoje() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Contador por fonte. So campos que sao de fato incrementados:
 * `aposFiltro`, `novas`, `duplicadas` e `colididas` viviam aqui e saiam
 * sempre 0 no relatorio, porque quem sabe esses numeros e o coletar, nao a
 * fonte. Numero morto finge informacao — pior que numero ausente.
 * `falhas` conta erro de rede engolido, que antes desaparecia em silencio.
 */
export function novoContador(fonte) {
  return { fonte, consultadas: 0, brutas: 0, falhas: 0, erro: null };
}
