// Salario. Estruturado onde a fonte da, extraido do texto onde nao da.
// O Gupy nunca da: enumerei as 18 chaves em 20 vagas em 2026-07-29.
// Regra 1 do projeto: sem mencao clara, o campo e "—". Nunca estimativa.
import { normalizarTexto } from './util.js';

const MOEDA = { 'r$': 'BRL', 'rs': 'BRL', brl: 'BRL', us$: 'USD', usd: 'USD', '$': 'USD', '€': 'EUR', eur: 'EUR' };

// Alternacao e ordenada: a ramificacao do "k" vem PRIMEIRO de proposito.
// Se a de digitos vier antes, "18k" casa como "18" e o valor cai no teste
// de plausibilidade, descartando um salario que estava no texto.
const NUM = '\\d+\\s*k|[\\d]{1,3}(?:[.,]\\d{3})*(?:[.,]\\d+)?';
const CUR = 'r\\$|rs|us\\$|usd|\\$|€';
// Guarda obrigatoria antes da moeda. Sem ela, o backtracking guloso do
// `[^\\d]{0,40}` parte "R$" e casa so o "$", que mapeia para USD: uma bolsa de
// "R$ 2.000/mes" do CEIA saiu como "USD 2k" em 2026-07-30. Numero inventado
// e o pior defeito possivel aqui.
const ANTES = '(?<![a-z0-9])';

// Periodicidade. Sem ela nao da para comparar valor com piso: "USD 120.000" ao
// ano e otimo, "R$ 3.000" ao mes nao e. Quando NAO da para saber, fica null e o
// piso nao se aplica — descartar por periodo adivinhado custaria vaga boa.
const POR_MES = /(?:\/|por\s+|ao\s+)?\s*(?:m[êe]s|mensal|mensais|monthly|per\s+month)/i;
const POR_ANO = /(?:\/|por\s+|ao\s+)?\s*(?:ano|anual|anuais|year|yr|annually|per\s+annum)/i;
const POR_HORA = /(?:\/|por\s+)?\s*(?:hora|hour|hr)\b/i;

/** Le a periodicidade nos 30 caracteres seguintes ao valor. */
export function lerPeriodo(texto, posDepois) {
  const janela = String(texto).slice(Math.max(0, posDepois), Math.max(0, posDepois) + 30);
  if (POR_MES.test(janela)) return 'mes';
  if (POR_ANO.test(janela)) return 'ano';
  if (POR_HORA.test(janela)) return 'hora';
  return null;
}

/**
 * Normaliza para reais por mes, para comparar com o piso.
 * Devolve null quando o periodo e desconhecido: nesse caso o piso nao se aplica.
 */
export function mensalBRL(sal, perfilSalario) {
  if (!sal || !sal.periodo) return null;
  const taxa = perfilSalario?.cambio?.[sal.moeda] ?? null;
  if (!taxa) return null;
  const valor = sal.de ?? sal.ate;
  if (!Number.isFinite(valor)) return null;
  const emBRL = valor * taxa;
  if (sal.periodo === 'mes') return emBRL;
  if (sal.periodo === 'ano') return emBRL / 12;
  if (sal.periodo === 'hora') return emBRL * 160;
  return null;
}

/** Normaliza o objeto estruturado das fontes que tem campo proprio. */
export function daFonte(obj) {
  if (!obj) return null;
  const de = obj.from ?? obj.de ?? obj.minSalary ?? obj.salary_min ?? null;
  const ate = obj.to ?? obj.ate ?? obj.maxSalary ?? obj.salary_max ?? null;
  const tipo = obj.type ?? obj.tipo ?? null;
  if (tipo === 'uninformed') return null;
  if (!de && !ate) return null;
  const moeda = obj.currency ?? obj.salaryCurrency ?? 'BRL';
  // `hora` vem antes das outras porque o `mensalBRL` ja sabia converter hora
  // (x160) desde sempre e nada aqui produzia esse periodo — capacidade morta ate
  // o Arc entrar em 2026-08-25, que informa a faixa por hora. Sem esta linha,
  // "30 a 50 USD por hora" era lido como periodo desconhecido: nao dava numero
  // errado, mas jogava fora um salario que da R$ 26 mil por mes.
  const periodo = /hour|hora|hourly|\/h\b/i.test(String(tipo))
    ? 'hora'
    : /month|mensal|mes/i.test(String(tipo))
      ? 'mes'
      : /year|annual|ano/i.test(String(tipo))
        ? 'ano'
        : null;
  return { de: de || null, ate: ate || null, moeda, origem: 'fonte', periodo };
}

/**
 * Extrai faixa do texto livre. Conservador de proposito: prefere devolver
 * null do que arriscar um numero errado no campo de salario.
 */
export function doTexto(texto) {
  if (!texto) return null;
  const t = normalizarTexto(texto).replace(/ /g, ' ');

  // "de R$ 12.000 a R$ 16.000" | "R$ 12.000 - R$ 16.000" | "R$ 12k a R$ 18k"
  const faixa = t.match(new RegExp(`${ANTES}(${CUR})\\s*(${NUM})\\s*(?:a|-|ate|até|as|to)\\s*(?:${CUR})?\\s*(${NUM})`, 'i'));
  if (faixa) {
    // Grupos: 1 = moeda, 2 = primeiro numero, 3 = segundo numero.
    // Os (?:...) do meio nao capturam.
    const de = paraNumero(faixa[2]);
    const ate = paraNumero(faixa[3]);
    if (plausivel(de) && plausivel(ate) && ate >= de) {
      return { de, ate, moeda: MOEDA[faixa[1].toLowerCase()] || 'BRL', origem: 'texto', periodo: lerPeriodo(t, faixa.index + faixa[0].length) };
    }
  }

  // valor unico com rotulo explicito de salario por perto
  const unico = t.match(
    new RegExp(`(?:salario|salário|remuneracao|remuneração|faixa salarial|compensation)[^\\d]{0,40}${ANTES}(${CUR})\\s*(${NUM})`, 'i')
  );
  if (unico) {
    const v = paraNumero(unico[2]);
    if (plausivel(v)) return { de: v, ate: null, moeda: MOEDA[unico[1].toLowerCase()] || 'BRL', origem: 'texto', periodo: lerPeriodo(t, unico.index + unico[0].length) };
  }

  // "R$ 3.000/mes" e "R$ 12.000 mensais" nao trazem rotulo de salario, mas a
  // periodicidade logo depois do valor e sinal suficiente.
  const periodico = t.match(new RegExp(`${ANTES}(${CUR})\\s*(${NUM})\\s*(?:\\/|por\\s+)?\\s*(?:mes|mês|mensal|mensais|m[êe]s|hora|ano|anual)`, 'i'));
  if (periodico) {
    const v = paraNumero(periodico[2]);
    if (plausivel(v)) return { de: v, ate: null, moeda: MOEDA[periodico[1].toLowerCase()] || 'BRL', origem: 'texto', periodo: lerPeriodo(t, periodico.index) || 'mes' };
  }

  return null;
}

export function paraNumero(s) {
  if (!s) return NaN;
  let v = String(s).trim().toLowerCase();
  const ehK = /k$/.test(v.replace(/\s/g, ''));
  v = v.replace(/\s*k$/, '');

  const ptDec = v.lastIndexOf('.');
  const vgDec = v.lastIndexOf(',');
  if (ptDec >= 0 && vgDec >= 0) {
    // Os DOIS separadores presentes: o ULTIMO e o decimal, o outro e milhar.
    // Vale nas duas convencoes — "8,100.00" e "1.500,00" sao ambos milhar
    // seguido de centavos. Sem este ramo, apagar todos os separadores fazia
    // "R$8,100.00" virar 810.000, e o Apify serve o salario exatamente assim.
    const corte = Math.max(ptDec, vgDec);
    v = v.slice(0, corte).replace(/[.,]/g, '') + '.' + v.slice(corte + 1);
  } else if (/[.,]\d{3}(?:\D|$)/.test(v)) {
    // 12.000 e 12,000 sao doze mil
    v = v.replace(/[.,]/g, '');
  } else {
    // 12.5 e doze e meio
    v = v.replace(',', '.');
  }
  const n = parseFloat(v);
  return ehK ? n * 1000 : n;
}

/** Salario de designer no Brasil ou no exterior cabe nesta janela. Fora dela e outro numero. */
function plausivel(n) {
  return Number.isFinite(n) && n >= 1000 && n <= 2000000;
}

export function formatar(sal) {
  if (!sal) return '—';
  const m = { BRL: 'R$', USD: 'USD', EUR: 'EUR' }[sal.moeda] || sal.moeda || '';
  const k = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}k`.replace('.0k', 'k') : String(n));
  // O periodo entra no rotulo quando NAO e mensal. "USD 30–50" de uma faixa por
  // hora le como salario do mes e assusta a toa; escrito por extenso, o mesmo
  // numero le como o que e. Mensal fica sem sufixo porque e o padrao do radar.
  const sufixo = sal.periodo === 'hora' ? '/hora' : sal.periodo === 'ano' ? '/ano' : '';
  if (sal.de && sal.ate) return `${m} ${k(sal.de)}–${k(sal.ate)}${sufixo}`;
  return `${m} ${k(sal.de || sal.ate)}${sufixo}`;
}

export function resolver(vaga) {
  return daFonte(vaga.salarioBruto) || doTexto(vaga.descricao) || null;
}
