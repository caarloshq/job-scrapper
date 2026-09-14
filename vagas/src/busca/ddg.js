// Camada 2 — busca site:, a dica do Leo.
// Motivo de existir, medido em 2026-07-29: a API do Gupy e o employability-portal
// e ela so lista quem optou pelo portal publico. "site:gupy.io product designer senior"
// devolveu Localiza, Pagaleve, Asaas, Afya, Beep Saude, Gringo&Zapay, FCamara, ALLOSTECH.
// A da Localiza responde {"message":"Job with ID 11130005 not found"} na API do portal.
// Nao e hipotese: e uma populacao diferente de vagas.
//
// Google nao tem API gratuita e CAPTCHA nao se contorna. Aqui usamos o DuckDuckGo HTML,
// que respeita site:. O Claude, quando esta na rodada, roda os mesmos dorks com WebSearch,
// que da resultado melhor, e passa as URLs para enriquecer().
import { buscar, dormir, novoContador } from '../util.js';
import { dorks } from '../config.js';
import { extrair } from './extrair-id.js';

const DDG = 'https://html.duckduckgo.com/html/';

/**
 * O DuckDuckGo devolve uma pagina de anomalia em vez de resultado quando
 * decide que o cliente e robo. Detectar isso e obrigatorio: sem essa checagem
 * a camada 2 devolvia 0 e parecia "nao achou nada", quando na verdade estava
 * bloqueada. Ficou tres rodadas assim em 2026-07-30 sem ninguem notar.
 */
export function estaBloqueado(html) {
  if (!html) return true;
  if (/uddg=|result__a/.test(html)) return false;
  return /anomaly|blocked|captcha|unusual traffic/i.test(html) || html.length < 20000;
}

/** Extrai as URLs de destino do HTML de resultados do DuckDuckGo. */
export function lerResultados(html) {
  if (!html) return [];
  const urls = new Set();
  for (const m of html.matchAll(/uddg=([^"&]+)/g)) {
    try {
      urls.add(decodeURIComponent(m[1]));
    } catch { /* ignora entrada malformada */ }
  }
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    if (!/duckduckgo|ad_provider|\.js|\.css/.test(m[1])) urls.add(m[1]);
  }
  return [...urls];
}

/**
 * O Google corta consulta longa EM SILENCIO: o teto e 32 palavras e 2024
 * caracteres, e o que passa disso some sem aviso nenhum. Com o operador OR nos
 * termos, passar do teto virou possibilidade real, entao a consulta e checada
 * antes de sair. Estourou, ela e descartada e a proxima entra no lugar: melhor
 * perder um dork do que rodar um dork mutilado achando que rodou inteiro.
 */
export function cabeNoBuscador(consulta) {
  const palavras = consulta.trim().split(/\s+/).filter(Boolean).length;
  return palavras <= (dorks.limite_palavras_consulta ?? 32)
    && consulta.length <= (dorks.limite_caracteres_consulta ?? 2024);
}

export function montarConsultas() {
  const saida = [];
  const descartadas = [];
  // TERMO POR FORA, SITE POR DENTRO, e a ordem importa.
  // Ao contrario, com teto de 3 consultas por rodada as tres caiam todas no
  // PRIMEIRO site da lista e os outros doze nunca eram consultados. Passou
  // despercebido enquanto a lista tinha 8 dominios; com 13 ficou obvio.
  for (const termo of dorks.termos) {
    for (const site of dorks.sites) {
      const consulta = `site:${site} ${termo}`;
      if (!cabeNoBuscador(consulta)) { descartadas.push(consulta); continue; }
      saida.push(consulta);
      if (saida.length >= dorks.max_consultas_por_rodada) {
        if (descartadas.length) avisarDescartadas(descartadas);
        return saida;
      }
    }
  }
  if (descartadas.length) avisarDescartadas(descartadas);
  return saida;
}

function avisarDescartadas(lista) {
  console.log(`  ${lista.length} dork(s) acima do teto do buscador, descartado(s) inteiro(s):`);
  for (const c of lista) console.log(`    ${c.slice(0, 90)}...`);
}

/** @returns {{achados: object[], contador: object, consultas: string[], bloqueado: boolean}} */
export async function coletar() {
  const c = novoContador('Busca site:');
  const consultas = montarConsultas();
  const achados = new Map();
  let bloqueios = 0;

  for (const q of consultas) {
    c.consultadas++;
    let html = null;
    try {
      html = await buscar(`${DDG}?q=${encodeURIComponent(q)}`, { texto: true, tentativas: 2, timeoutMs: 20000 });
    } catch (e) {
      c.erro = String(e.message || e);
      continue;
    }
    if (estaBloqueado(html)) {
      bloqueios++;
      // Bloqueio nas duas primeiras ja e resposta: nao insista e nao gaste rodada.
      if (bloqueios >= 2) {
        c.erro = 'DuckDuckGo bloqueou. A camada 2 depende do WebSearch do Claude.';
        break;
      }
      await dormir(1200);
      continue;
    }
    for (const url of lerResultados(html)) {
      const id = extrair(url);
      if (!id) continue;
      c.brutas++;
      if (!achados.has(id.idExterno)) {
        achados.set(id.idExterno, { ...id, link: url, camada: 'Busca site:', dork: q });
      }
    }
    await dormir(2500); // pausa longa: com 1,2s ele rate-limitava na terceira consulta
  }

  return { achados: [...achados.values()], contador: c, consultas, bloqueado: bloqueios >= 2 };
}
