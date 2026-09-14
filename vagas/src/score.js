// Score deterministico, 0 a 60. Sem LLM: roda em milissegundos, e testavel, e reproduzivel.
// Os 40 pontos restantes sao semanticos e o Claude atribui na rodada.
import { normalizarTexto } from './util.js';
import { perfil, palavras } from './config.js';
import * as senioridade from './senioridade.js';
import { pontosFrescor } from './frescor.js';
import { resolver as resolverSalario, mensalBRL } from './salario.js';
import { descontoMercado } from './mercado.js';

// O plural mantém tokens/design systems; siglas precisam ser palavras inteiras.
function padraoTermo(termo, flags = 'u') {
  const alvo = normalizarTexto(termo);
  const esc = alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const plural = alvo.length > 3 && !alvo.endsWith('s') ? 's?' : '';
  return new RegExp(`(?<![\\p{L}\\p{N}])${esc}${plural}(?![\\p{L}\\p{N}])`, flags);
}

function contemTermo(texto, termo) {
  return padraoTermo(termo).test(texto);
}

export function pontosTitulo(titulo) {
  const t = normalizarTexto(titulo);
  let melhor = 0;
  for (const [chave, valor] of Object.entries(palavras.titulo_aceito)) {
    if (contemTermo(t, chave)) melhor = Math.max(melhor, valor);
  }
  return Math.min(melhor, perfil.pesos.titulo_max);
}

export function pontosDominio(texto) {
  // Retira só expressões ambíguas conhecidas, sem apagar a seção nem o resto da frase.
  let t = normalizarTexto(texto);
  for (const contexto of palavras.dominio_contextos_neutros || []) {
    t = t.replace(padraoTermo(contexto, 'gu'), ' ');
  }
  if (palavras.dominio_alto.some((d) => contemTermo(t, d))) return 10;
  if (palavras.dominio_medio.some((d) => contemTermo(t, d))) return 7;
  return 3;
}

export function pontosSinais(texto) {
  const t = normalizarTexto(texto);
  const grupos = (palavras.sinais_equivalentes || []).map((grupo) => grupo.map(normalizarTexto));
  const vistos = new Set();
  const achados = palavras.sinais.filter((s) => {
    const termo = normalizarTexto(s);
    if (!contemTermo(t, termo)) return false;
    const chave = grupos.find((grupo) => grupo.includes(termo))?.[0] ?? termo;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
  return { pontos: Math.min(achados.length * 1.5, perfil.pesos.sinais_max), achados };
}

/** Ingles nao bloqueia nada. Vira desconto leve e nota obrigatoria em Gaps. */
export function exigenciaIngles(texto) {
  const t = normalizarTexto(texto);
  if (palavras.exige_ingles_forte.some((x) => contemTermo(t, x))) return 'forte';
  if (palavras.exige_ingles_desejavel.some((x) => contemTermo(t, x))) return 'desejavel';
  return 'nenhuma';
}

export function calcular(vaga, agora = new Date()) {
  const corpo = `${vaga.titulo || ''} ${vaga.empresa || ''} ${vaga.descricao || ''}`;
  const nivel = vaga.senioridade || senioridade.detectar(vaga.titulo, vaga.descricao);
  const sinais = pontosSinais(corpo);

  const sal = vaga.salario ?? resolverSalario(vaga);
  const emReais = mensalBRL(sal, perfil.salario);

  const parcelas = {
    titulo: pontosTitulo(vaga.titulo),
    senioridade: senioridade.pontos(nivel, { vaga, mensalBRL: emReais, perfilSalario: perfil.salario }),
    dominio: pontosDominio(corpo),
    sinais: sinais.pontos,
    frescor: pontosFrescor(vaga, agora),
  };

  const ingles = exigenciaIngles(corpo);
  const descontoIngles =
    ingles === 'forte' ? perfil.ingles.desconto_forte : ingles === 'desejavel' ? perfil.ingles.desconto_desejavel : 0;

  // Mercado fora da prioridade entra com desconto, nunca descartada (src/mercado.js).
  const descMercado = descontoMercado({ ...vaga, salario: sal }, perfil);

  const bruto = Object.values(parcelas).reduce((a, b) => a + b, 0);
  const determinado = Math.max(0, Math.round((bruto - descontoIngles - descMercado) * 10) / 10);

  return { parcelas, sinaisAchados: sinais.achados, nivel, ingles, descontoIngles, descontoMercado: descMercado, determinado };
}

/**
 * Compatibilidade final 0 a 100. O semantico e opcional: sem ele o numero
 * ainda serve para ranquear, so nao chega perto do teto.
 */
export function compatibilidade(vaga, semantico = null) {
  const base = vaga.score?.determinado ?? calcular(vaga).determinado;
  let total = semantico === null ? base : base + Math.max(0, Math.min(semantico, perfil.pesos.semantico_max));

  if (vaga.validada === false) total = Math.min(total, perfil.limites.teto_nao_validada);
  if (vaga.fonte === 'Solta') total = Math.min(total, perfil.limites.teto_fonte_solta);

  return Math.max(0, Math.min(100, Math.round(total)));
}

export function faixa(pct) {
  if (pct >= 75) return 'Aplicar ja';
  if (pct >= 55) return 'Vale olhar';
  if (pct >= 40) return 'Radar';
  return 'Fora';
}
