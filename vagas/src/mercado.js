// Mercado alvo: nacional, internacional ou ambos.
//
// Decidido no onboarding (bloco 2) e gravado em config/perfil.json → mercado.
// A resposta faz tres coisas, e as tres moram aqui para nao se espalharem:
//
//   1. Liga e desliga fontes. Portal brasileiro nao serve para quem so quer
//      fora, e o inverso enche o radar de vaga US-only para quem so quer aqui.
//   2. Vira desconto na nota quando o foco e "ambos" com prioridade: a vaga do
//      mercado que a pessoa prefere sobe, a do outro entra com desconto. Nunca
//      descarta — falso positivo custa vaga boa, e esse e o erro caro.
//   3. Decide o idioma do curriculo base (isso o onboarding le daqui).
import { ehInternacional } from './senioridade.js';

export const FOCOS = ['nacional', 'internacional', 'ambos'];

/** Fontes por mercado, pelo NOME exportado em src/fontes/*.js. */
export const FONTES_NACIONAIS = ['Gupy', 'Remotar', 'InHire', 'Vagas Remotas', 'Coluna Tech', 'Vagas UX'];
export const FONTES_INTERNACIONAIS = ['Arc', 'UX Remote Talent', 'ATS internacional', 'Himalayas'];
// O LinkedIn serve aos dois: quem decide o pais e a busca da Task/Actor.
export const FONTES_AMBOS = ['LinkedIn (Apify)'];

export function validar(mercado) {
  if (!mercado || typeof mercado !== 'object') return { ok: false, erro: 'perfil.mercado ausente' };
  if (!FOCOS.includes(mercado.foco)) return { ok: false, erro: `mercado.foco precisa ser um de: ${FOCOS.join(', ')}` };
  if (mercado.foco === 'ambos' && mercado.prioridade && !['nacional', 'internacional'].includes(mercado.prioridade)) {
    return { ok: false, erro: 'mercado.prioridade precisa ser nacional ou internacional' };
  }
  return { ok: true };
}

/**
 * Filtra a lista de fontes do coletor pelo mercado e pela lista de desligadas.
 * `fontes_desligadas` existe para o onboarding tirar a Vagas UX de quem nao e
 * de design sem editar codigo.
 * @param {Array<{NOME:string}>} fontes
 * @param {object} perfil config/perfil.json
 */
export function fontesAtivas(fontes, perfil) {
  const foco = perfil?.mercado?.foco || 'ambos';
  const desligadas = new Set(perfil?.fontes_desligadas || []);
  return fontes.filter((f) => {
    if (desligadas.has(f.NOME)) return false;
    if (FONTES_AMBOS.includes(f.NOME)) return true;
    if (foco === 'nacional') return !FONTES_INTERNACIONAIS.includes(f.NOME);
    if (foco === 'internacional') return !FONTES_NACIONAIS.includes(f.NOME);
    return true;
  });
}

/**
 * Desconto na nota deterministica pela prioridade de mercado.
 * So existe com foco "ambos" e prioridade declarada. Fora disso, zero.
 */
export function descontoMercado(vaga, perfil) {
  const m = perfil?.mercado;
  if (!m || m.foco !== 'ambos' || !m.prioridade) return 0;
  const internacional = ehInternacional(vaga);
  const daPrioridade = m.prioridade === 'internacional' ? internacional : !internacional;
  return daPrioridade ? 0 : Number(m.desconto_fora_da_prioridade ?? 6);
}

/** Idioma do curriculo base que o onboarding monta primeiro. */
export function idiomaDoCurriculo(perfil) {
  const m = perfil?.mercado;
  if (!m) return 'pt';
  if (m.foco === 'internacional') return 'en';
  if (m.foco === 'ambos') return m.prioridade === 'internacional' ? 'en' : 'pt';
  return 'pt';
}
