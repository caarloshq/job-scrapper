// Camada 3 — portao de vida e enriquecimento. Node puro, sem navegador.
//
// ARMADILHA JA PAGA, nao reintroduzir:
// a string "Inscricoes encerradas" aparece no HTML de vaga VIVA e de vaga MORTA,
// porque e label do bundle. Confiar nela descarta tudo. O sinal real e o campo
// "status": em 2026-07-29 a vaga morta da Localiza serviu "status":"frozen" e a
// vaga viva do Grupo SysMap serviu "status":"published".
import { buscar, limparHtml, dormir } from './util.js';

const VIVO = /^(published|open|active|live|publicada|aberta)$/i;

/** Le o campo status do HTML servido. @returns {string|null} */
export function lerStatus(html) {
  if (!html) return null;
  const m = html.match(/"status"\s*:\s*"([a-z_]+)"/i);
  return m ? m[1].toLowerCase() : null;
}

export function estaViva(status) {
  if (!status) return null; // desconhecido nao e o mesmo que morto
  return VIVO.test(status);
}

/** Data de publicacao a partir do HTML, quando a camada 2 nao trouxe nenhuma. */
export function lerData(html) {
  if (!html) return null;
  const m =
    html.match(/"publishedDate"\s*:\s*"([^"]{10,30})"/i) ||
    html.match(/"publishedAt"\s*:\s*"([^"]{10,30})"/i) ||
    html.match(/"createdAt"\s*:\s*"([^"]{10,30})"/i) ||
    html.match(/(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/);
  if (!m) return null;
  const d = new Date(m[1]);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function lerTitulo(html) {
  if (!html) return null;
  const m = html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
  if (!m) return null;
  return limparHtml(m[1]).replace(/^(job page|pagina da vaga|página da vaga)\s*\|?\s*/i, '').trim() || null;
}

/**
 * Abre a URL e devolve o que der para saber. Falha aqui NAO apaga a vaga:
 * ela entra marcada validada=false, com teto de compatibilidade.
 */
export async function validar(url) {
  try {
    const html = await buscar(url, { texto: true, tentativas: 2, timeoutMs: 20000 });
    if (!html) return { validada: false, motivo: 'sem resposta' };
    const status = lerStatus(html);
    const viva = estaViva(status);
    return {
      validada: true,
      statusFonte: status,
      encerrada: viva === false,
      publicadaEm: lerData(html),
      titulo: lerTitulo(html),
      tamanhoHtml: html.length,
    };
  } catch (e) {
    return { validada: false, motivo: String(e.message || e) };
  }
}

/** Valida uma lista em serie, com pausa. E a etapa mais cara da rodada. */
export async function validarLista(urls, { pausaMs = 700, limite = 40 } = {}) {
  const saida = [];
  for (const url of urls.slice(0, limite)) {
    saida.push({ url, ...(await validar(url)) });
    await dormir(pausaMs);
  }
  return saida;
}
