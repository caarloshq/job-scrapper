// UX Remote Talent — uxremotetalent.com. Board 100% de UX/UI remoto, entao o
// ruido de titulo e quase zero: e a mesma vantagem que faz a Vagas UX valer a
// pena mesmo trazendo pouca vaga.
//
// Webflow com HTML servido. Nada de API interna: o dado vem das paginas
// publicas, que e o que qualquer visitante recebe. robots.txt deles bloqueia so
// /ads.txt.
//
// O CAMPO QUE DECIDE TUDO e a restricao de pais, que o board escreve na propria
// listagem: "USA Only", "Europe Only", "Latin America Only", "Anywhere in the
// World". Medido em 2026-08-25: a MAIORIA e "USA Only". Sem ler esse campo, o
// radar encheria de vaga onde voce nao pode se candidatar — ruido caro,
// porque parece encaixe ate ele abrir o anuncio.
//
// ARMADILHA: "North America Only" NAO inclui o Brasil, e a leitura descuidada
// deixa passar porque "America" aparece no texto. A regra e por lista fechada.
import { buscar, limparHtml, dormir, novoContador } from '../util.js';

const BASE = 'https://www.uxremotetalent.com';
export const NOME = 'UX Remote Talent';

export const PAGINAS = ['/', '/remote-ux-jobs'];

const PAUSA_MS = 700;

/**
 * Restricoes que ACEITAM alguem no Brasil. Lista fechada de propósito: qualquer
 * rotulo novo cai no desconhecido e PASSA, marcado, porque descartar por falta
 * de dado ja jogou fora 57 vagas boas na primeira rodada deste projeto.
 */
const ACEITA_BRASIL = [
  'anywhere in the world',
  'latin america only',
  'south america only',
  'americas only',
  'brazil only',
  'worldwide',
];

/** Restricoes que sabidamente EXCLUEM o Brasil. */
const EXCLUI_BRASIL = [
  'usa only',
  'us only',
  'canada only',
  'north america only',
  'europe only',
  'emea only',
  'uk only',
  'apac only',
  'asia only',
  'africa only',
  'australia only',
  'india only',
];

/**
 * @returns {true|false|null} true aceita, false exclui, null desconhecido.
 * Desconhecido nao e o mesmo que exclui, e o filtro trata os dois diferente.
 */
export function aceitaBrasil(restricao) {
  const t = String(restricao || '').trim().toLowerCase();
  if (!t) return null;
  if (ACEITA_BRASIL.some((r) => t === r || t.includes(r))) return true;
  if (EXCLUI_BRASIL.some((r) => t === r || t.includes(r))) return false;
  return null;
}

/**
 * Tipo de contrato, nao restricao de pais. O board mistura os dois na mesma
 * lista de pills e nem toda vaga declara os dois.
 */
const CONTRATOS = ['full-time', 'part-time', 'contract', 'freelance', 'internship', 'temporary', 'fulltime', 'parttime'];

export function ehContrato(texto) {
  const t = String(texto || '').trim().toLowerCase();
  return CONTRATOS.includes(t);
}

const MESES = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** "August 25, 2026" vira ISO. Texto nao reconhecido devolve null, NUNCA hoje. */
export function lerData(texto) {
  const m = /([a-z]+)\s+(\d{1,2}),\s*(\d{4})/i.exec(String(texto || ''));
  if (!m) return null;
  const mes = MESES[m[1].toLowerCase()];
  if (!mes) return null;
  const d = new Date(Date.UTC(Number(m[3]), mes - 1, Number(m[2])));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Le os itens da colecao Webflow. As classes sao estaveis e descritivas:
 * `regular-job-title` o cargo, `card-company-name` a empresa, e os demais
 * `card-job-detail` trazem restricao e contrato NESSA ORDEM.
 */
export function lerItens(html) {
  if (!html) return [];
  const itens = [];
  const blocos = String(html).split('w-dyn-item').slice(1);

  for (const b of blocos) {
    const href = /href="(\/ux-job\/[^"]+)"/.exec(b)?.[1];
    if (!href) continue;
    const titulo = limparHtml(/<h2[^>]*class="[^"]*regular-job-title[^"]*"[^>]*>([\s\S]*?)<\/h2>/.exec(b)?.[1]);
    if (!titulo) continue;

    const empresa = limparHtml(
      /card-job-detail card-company-name"[^>]*>\s*<div[^>]*>([\s\S]*?)<\/div>/.exec(b)?.[1],
    );

    // Os detalhes que NAO sao a empresa.
    //
    // ARMADILHA JA PAGA, 2026-08-25: a primeira versao lia por POSICAO, o
    // primeiro detalhe como restricao e o segundo como contrato. Vaga que nao
    // declara restricao — a "UI/UX Designer for AI Training Projects" da
    // OpenTrain AI — so tem um detalhe, e "Part-time" virava restricao de pais.
    // O erro nao descartava a vaga, mas gravava dado falso no campo, que e a
    // regra 1 do projeto quebrada em silencio. Classificamos pelo CONTEUDO.
    const detalhes = [];
    const re = /<div class="card-job-detail(?: card-company-name)?"><div[^>]*class="regular-job-info"[^>]*>([\s\S]*?)<\/div>/g;
    let m;
    while ((m = re.exec(b))) detalhes.push(limparHtml(m[1]));
    const semEmpresa = detalhes.filter((d) => d && d !== empresa);

    itens.push({
      link: BASE + href,
      slug: href.split('/').pop(),
      titulo,
      empresa: empresa || null,
      restricao: semEmpresa.find((d) => !ehContrato(d)) || null,
      contrato: semEmpresa.find((d) => ehContrato(d)) || null,
      data: limparHtml(/class="regular-job-info date"[^>]*>([\s\S]*?)<\/div>/.exec(b)?.[1]),
    });
  }
  return itens;
}

/** A descricao mora no bloco rich text da pagina de detalhe. */
export function lerDetalhe(html) {
  if (!html) return null;
  const bloco = String(html).split('rich-text-block w-richtext')[1];
  if (!bloco) return null;
  const texto = limparHtml(bloco.split('</div>').slice(0, 40).join(' '));
  return texto && texto.length > 40 ? texto : null;
}

export function paraVaga(i) {
  const aceita = aceitaBrasil(i.restricao);
  return {
    idExterno: `uxremotetalent:${i.slug}`,
    fonte: NOME,
    camada: 'API',
    titulo: i.titulo,
    empresa: i.empresa,
    descricao: null,
    descricaoPendente: true,
    link: i.link,
    cidade: null,
    estado: null,
    pais: null,
    modelo: 'remoto',
    remoto: true,
    contrato: i.contrato || null,
    restricaoPais: i.restricao || null,
    aceitaBrasil: aceita,
    publicadaEm: lerData(i.data),
    atualizadaEm: null,
    prazo: null,
    salarioBruto: null,
    statusFonte: 'aberta',
    validada: true,
  };
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
      // O dominio caiu em 2 de 5 tentativas na medicao de 2026-08-25 (503 e 504).
      // Falha aqui nao derruba a rodada, so custa a pagina.
      c.falhas++;
      continue;
    }
    const itens = lerItens(html);
    c.brutas += itens.length;
    for (const i of itens) {
      if (vistos.has(i.slug)) continue;
      const v = paraVaga(i);
      // Restricao que sabidamente exclui o Brasil sai aqui, antes de gastar uma
      // requisicao de detalhe com ela.
      if (v.aceitaBrasil === false) continue;
      vistos.set(i.slug, v);
    }
    await dormir(PAUSA_MS);
  }

  for (const v of vistos.values()) {
    try {
      const html = await buscar(v.link, { texto: true, tentativas: 2, timeoutMs: 25000 });
      const d = lerDetalhe(html);
      if (d) {
        v.descricao = d;
        v.descricaoPendente = false;
      }
    } catch {
      c.falhas++;
    }
    await dormir(PAUSA_MS);
  }

  return { vagas: [...vistos.values()], contador: c };
}
