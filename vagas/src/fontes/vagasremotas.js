// Vagas Remotas — WordPress com WP Job Manager.
// Achei pelo nome oficial no navegador: o link do post do LinkedIn era lnkd.in
// atras de reCAPTCHA, e CAPTCHA nao se contorna.
// Feed: ?feed=job_feed&search_keywords= devolve RSS, 10 itens por pagina.
import { buscar, limparHtml, dormir, novoContador } from '../util.js';
import { palavras } from '../config.js';

const BASE = 'https://vagasremotas.com.br/';
export const NOME = 'Vagas Remotas';

/** Parser de RSS suficiente para este feed. Sem dependencia externa. */
export function lerRss(xml) {
  if (!xml) return [];
  const itens = [];
  for (const bloco of xml.split(/<item\b/).slice(1)) {
    const pega = (tag) => {
      const m = bloco.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
      if (!m) return null;
      return m[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    };
    const link = pega('link');
    if (!link) continue;
    itens.push({
      titulo: limparHtml(pega('title')),
      link,
      descricao: limparHtml(pega('description') || pega('content:encoded')),
      data: pega('pubDate'),
      empresa: limparHtml(pega('job_listing:company')) || null,
      local: limparHtml(pega('job_listing:location')) || null,
      guid: pega('guid') || link,
    });
  }
  return itens;
}

/**
 * Texto da pagina de detalhe. O RSS entrega so o excerto, cortado no meio da
 * frase ("talent across technical, sales, and marketing roles. We are..."),
 * e com isso nao da para julgar nada. Descoberto em 2026-07-30, quando 5 vagas
 * internacionais em dolar estavam ilegiveis na fila de leitura.
 */
export function lerDetalhe(html) {
  if (!html) return null;
  const semScript = String(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const txt = limparHtml(semScript);
  const i = txt.search(/Apply for job/i);
  return i >= 0 ? txt.slice(i + 14).trim() : txt.trim();
}

/**
 * O site marca remuneracao em dolar no cabecalho. Testa no TEXTO limpo, nao no
 * HTML cru: la o rotulo vem partido por tag e o regex nunca casa.
 */
export function pagaEmDolar(html) {
  return /Vaga em D[óo]lar/i.test(limparHtml(String(html || '')));
}

export async function coletar() {
  const c = novoContador(NOME);
  const vistos = new Map();

  for (const termo of palavras.consultas_estreitas) {
    c.consultadas++;
    const url = `${BASE}?feed=job_feed&search_keywords=${encodeURIComponent(termo)}`;
    const xml = await buscar(url, { texto: true, tentativas: 2 });
    const itens = lerRss(xml);
    c.brutas += itens.length;
    for (const i of itens) {
      if (vistos.has(i.guid)) continue;
      const data = i.data ? new Date(i.data) : null;
      vistos.set(i.guid, {
        idExterno: `vagasremotas:${i.guid}`,
        fonte: NOME,
        camada: 'API',
        titulo: i.titulo,
        empresa: i.empresa,
        descricao: i.descricao,
        link: i.link,
        cidade: i.local || null,
        estado: null,
        pais: 'Brasil',
        modelo: 'remoto',
        remoto: true,
        publicadaEm: data && !Number.isNaN(data.getTime()) ? data.toISOString() : null,
        atualizadaEm: null,
        prazo: null,
        salarioBruto: null,
        statusFonte: null,
        validada: true,
      });
    }
    await dormir(200);
  }

  // Busca a descricao real de cada vaga. O RSS so tem excerto truncado.
  for (const v of vistos.values()) {
    try {
      const html = await buscar(v.link, { texto: true, tentativas: 2, timeoutMs: 25000 });
      const d = lerDetalhe(html);
      if (d && d.length > 300) v.descricao = d;
      if (pagaEmDolar(html)) v.pagaEmDolar = true;
    } catch {
      c.falhas++;
    }
    await dormir(400);
  }

  return { vagas: [...vistos.values()], contador: c };
}
