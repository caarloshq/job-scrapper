// Fontes internacionais — o que elas tem em comum.
//
// A decisao que define se esta fase presta: SO ENTRA VAGA QUE ACEITA LATAM.
// Sem isso o radar enche de vaga US-only, que e a maioria absoluta do remoto
// internacional e que voce nunca vai conseguir. A prova de que o filtro
// importa veio do CodePath: ele entrou com 79% justamente porque a descricao
// dizia "Remote (United States, Europe, Canada, or LATAM)".
import { normalizarTexto, casaTermo } from '../util.js';

/** Aceita explicitamente: mundo todo, Americas, LATAM, America do Sul, Brasil. */
const ACEITA = [
  'worldwide', 'anywhere', 'global', 'any location', 'remote - global',
  'latam', 'latin america', 'america latina', 'south america', 'americas',
  'brazil', 'brasil', 'br',
];

/**
 * Palavra que diz "remoto" sem dizer ONDE. Sozinha, nao decide nada.
 */
const REMOTO_VAGO = /^(remote|remoto|distributed|home ?office|hybrid|h[íi]brido|on.?site|presencial|full.?time|part.?time|-|\s)+$/i;

/**
 * @param {string[]|string|null} restricoes valor de locationRestrictions,
 *   candidate_required_location, ou texto livre de localizacao
 * @returns {{elegivel: boolean|null, motivo: string}}
 *   `null` significa NAO SEI — e isso passa, porque descartar por falta de dado
 *   ja custou vaga boa tres vezes neste projeto.
 */
export function elegivelLatam(restricoes) {
  const lista = Array.isArray(restricoes) ? restricoes : restricoes ? [String(restricoes)] : [];
  if (!lista.length) return { elegivel: null, motivo: 'sem restricao declarada' };

  const texto = lista.join(' | ');
  for (const bom of ACEITA) {
    if (casaTermo(texto, bom)) return { elegivel: true, motivo: `aceita ${bom}` };
  }

  // Regra invertida, e e ela que faz o filtro funcionar: enumerar cidade do
  // mundo inteiro e impossivel, entao qualquer campo que NOMEIA UM LUGAR e nao
  // cita LATAM esta dizendo onde fica o escritorio. "San Francisco, CA" nao
  // casava em nenhuma lista de bloqueio e virava "nao sei", e ai o texto
  // decidia — foi assim que a Figma inteira entrou no radar.
  if (REMOTO_VAGO.test(texto.trim())) {
    return { elegivel: null, motivo: 'diz remoto mas nao diz onde' };
  }
  return { elegivel: false, motivo: `local especifico, sem mencao a LATAM: ${texto.slice(0, 48)}` };
}

/**
 * Detecta LATAM no corpo do anuncio — mas SO no enquadramento, nunca no texto
 * inteiro. Empresa grande cita "Brazil" ou "LATAM" em lista de escritorio e em
 * texto de igualdade de oportunidade, e isso nao quer dizer que a vaga aceita
 * candidato daqui. Na primeira versao, vaga da Figma em Sao Francisco e em Tel
 * Aviv entrou por causa disso — mesmo erro do boilerplate de LGPD.
 *
 * So conta quando a mencao esta colada num rotulo de localizacao ou elegibilidade.
 */
const CONTEXTO_LOCAL = /(location|locations|based in|eligible|eligibility|work from|hiring in|open to|remote in|localizacao|localiza[çc][ãa]o|elegibilidade|contratamos em)[^.]{0,120}?(latam|latin america|america latina|south america|brazil|brasil|worldwide|anywhere)/i;

export function citaLatamNoTexto(descricao) {
  const t = normalizarTexto(descricao);
  if (!t) return false;
  // Declaracao inequivoca de remoto global, em qualquer lugar do texto.
  if (/\b(fully remote worldwide|remote worldwide|work from anywhere)\b/.test(t)) return true;
  return CONTEXTO_LOCAL.test(t);
}

/**
 * Decide se a vaga internacional entra. Ordem importa: o campo estruturado
 * vence o texto, e "nao sei" passa marcado em vez de sumir.
 */
export function avaliarElegibilidade({ restricoes, descricao }) {
  const campo = elegivelLatam(restricoes);
  if (campo.elegivel === true) return { entra: true, latam: true, motivo: campo.motivo };
  // CAMPO ESTRUTURADO VENCE. Se a fonte diz "San Francisco, CA", nao existe
  // mencao no corpo que transforme isso em vaga para o Brasil. Deixar o texto
  // sobrescrever encheu o radar de vaga da Figma em SF e em Tel Aviv.
  if (campo.elegivel === false) return { entra: false, latam: false, motivo: campo.motivo };
  // Campo desconhecido: o texto decide, e na duvida entra marcado.
  if (citaLatamNoTexto(descricao)) return { entra: true, latam: true, motivo: 'texto cita LATAM' };
  return { entra: true, latam: null, motivo: 'elegibilidade nao declarada' };
}
