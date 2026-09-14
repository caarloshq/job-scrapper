// Vagas UX — board da comunidade brasileira de UX. A fonte mais especifica da lista:
// tudo aqui e design, entao o ruido de titulo praticamente nao existe.
//
// robots.txt deles: "Disallow: /api" e "Disallow: /_next". RESPEITAMOS.
// Nada de bater na API interna. O dado vem do HTML servido das paginas publicas,
// que e o que qualquer visitante recebe, e o sitemap esta declarado no robots.txt.
//
// O site e um Notion publicado (classes notion-collection-list, notion-pill).
// ATENCAO ao formato, que e invertido em relacao as outras fontes:
//   - o TITULO do item e a EMPRESA ("Cashforce — Fintech de Risco Sacado")
//   - o CARGO vem numa pill ("Product Designer")
import { buscar, limparHtml, dormir, novoContador, normalizarTexto, casaTermo } from '../util.js';
import { palavras } from '../config.js';

const BASE = 'https://vagasux.com.br';
export const NOME = 'Vagas UX';

export const PAGINAS = [
  '/oportunidades/vagas-remotas',
  '/oportunidades/vagas-de-design-system-e-ops',
  '/oportunidades/apenas-vagas-de-ui-designer',
];

/** Cargos que o board usa nas pills, e quanto cada um interessa. */
const CARGO_PILL = ['product designer', 'ux designer', 'ui designer', 'design system', 'ops', 'ux/ui', 'product design', 'design ops', 'ux research'];

/**
 * Parser dos itens da colecao. Sem dependencia: recorta por item e le as
 * propriedades pelas classes do Notion.
 * @returns {object[]}
 */
export function lerItens(html) {
  if (!html) return [];
  const itens = [];
  const blocos = String(html).split('notion-collection-list__item ').slice(1);

  for (const b of blocos) {
    const href = /data-link-uri=\\?"([^"\\]+)/.exec(b)?.[1] || /href=\\?"(\/oportunidades\/[^"\\]+)/.exec(b)?.[1];
    if (!href) continue;

    const titulo = pegar(b, 'notion-property__title');
    if (!titulo) continue;

    const pills = [...b.matchAll(/notion-pill[^>]*>([^<\\]+)/g)].map((m) => limparHtml(m[1]).trim()).filter(Boolean);
    const data = pegar(b, 'notion-property__date');

    itens.push({
      empresa: titulo,
      cargo: pills.find((p) => CARGO_PILL.some((c) => normalizarTexto(p).includes(c))) || pills[0] || null,
      contrato: pills.find((p) => /^(pj|clt|freelance|estagio|est[aá]gio|temporario)$/i.test(p)) || null,
      pills,
      data,
      link: href.startsWith('http') ? href : BASE + href,
    });
  }
  return itens;
}

function pegar(bloco, classe) {
  const re = new RegExp(`${classe}[^>]*>([^<\\\\]+)`, 'i');
    const m = re.exec(bloco);
  return m ? limparHtml(m[1]).trim() : null;
}

/** "Mar 5, 2026 6:28 PM" -> ISO. Devolve null em vez de arriscar data errada. */
export function lerData(txt) {
  if (!txt) return null;
  const d = new Date(String(txt).replace(/\s+/g, ' ').trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function interessa(cargo, empresa) {
  const t = normalizarTexto(`${cargo || ''} ${empresa || ''}`);
  if (!t) return false;
  if (palavras.titulo_excluido.some((x) => casaTermo(t, x))) return false;
  return Object.keys(palavras.titulo_aceito).some((k) => t.includes(normalizarTexto(k)));
}

/**
 * Texto da pagina de detalhe. Sem isto a vaga chega sem descricao, e o score
 * fica cego: a vaga da Cashforce parecia encaixe perfeito de dominio (risco
 * sacado) e a descricao revelou "Product Designer Junior, R$ 3.000/mes".
 * Dominio certo, cargo errado. So a descricao mostra isso.
 */
export function lerDetalhe(html) {
  if (!html) return null;
  const semScript = String(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const txt = limparHtml(semScript);
  // O conteudo util comeca depois do menu do site.
  const i = txt.search(/Descri[çc][ãa]o/i);
  return i >= 0 ? txt.slice(i).trim() : txt.trim();
}

export async function coletar() {
  const c = novoContador(NOME);
  const vistos = new Map();

  for (const pagina of PAGINAS) {
    c.consultadas++;
    let html = null;
    try {
      html = await buscar(BASE + pagina, { texto: true, tentativas: 2, timeoutMs: 25000 });
    } catch {
      c.falhas++;
      continue;
    }
    const itens = lerItens(html);
    c.brutas += itens.length;

    for (const i of itens) {
      if (vistos.has(i.link) || !interessa(i.cargo, i.empresa)) continue;
      // A pagina de vagas remotas garante remoto; as outras duas nao dizem,
      // entao fica como desconhecido e o filtro deixa passar marcado.
      const remoto = pagina.includes('vagas-remotas');
      vistos.set(i.link, {
        idExterno: `vagasux:${i.link.split('/').pop()}`,
        fonte: NOME,
        camada: 'API',
        titulo: i.cargo || 'Product Designer',
        empresa: i.empresa,
        descricao: null,
        descricaoPendente: true,
        link: i.link,
        cidade: null,
        estado: null,
        pais: 'Brasil',
        modelo: remoto ? 'remoto' : null,
        remoto: remoto || null,
        contrato: i.contrato,
        publicadaEm: lerData(i.data),
        atualizadaEm: null,
        prazo: null,
        salarioBruto: null,
        statusFonte: 'aberta',
        validada: true,
        origemPagina: pagina,
      });
    }
    await dormir(600);
  }

  // Busca a descricao de cada vaga que sobrou. Sao poucas, entao o custo e baixo
  // e o ganho e grande: sem descricao o score fica cego e a senioridade escapa.
  for (const v of vistos.values()) {
    try {
      const html = await buscar(v.link, { texto: true, tentativas: 2, timeoutMs: 25000 });
      const d = lerDetalhe(html);
      if (d && d.length > 40) {
        v.descricao = d;
        v.descricaoPendente = false;
      }
    } catch { c.falhas++; /* fica sem descricao, marcada como pendente */ }
    await dormir(500);
  }

  return { vagas: [...vistos.values()], contador: c };
}
