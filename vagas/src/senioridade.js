// Senioridade a partir do titulo. Muita vaga boa vem sem rotulo, entao
// "sem_rotulo" e um valor legitimo e nao um descarte.
import { normalizarTexto } from './util.js';
import { palavras } from './config.js';

const SENIOR = ['senior', 'senior', 'sr', 'especialista', 'specialist', 'lead', 'staff', 'principal', 'iii'];
const PLENO = ['pleno', 'mid-level', 'mid level', 'intermediario', ' ii'];

/**
 * Padroes de junioridade no CORPO do anuncio, para quando o titulo nao diz.
 * A Vagas UX so expoe o cargo numa pill ("Product Designer"), e o nivel vem no
 * texto: a vaga da Cashforce era "Product Designer Junior, R$ 3.000/mes,
 * nao exigimos experiencia previa" com titulo aparentemente neutro.
 *
 * O primeiro padrao depende da PROFISSAO e por isso e montado de
 * `cargos_da_area`: era regex cravada com (product|ux|ui|visual)?designer, a
 * ultima coisa de profissao que restava no codigo. Os outros quatro valem para
 * qualquer cargo — "nao exigimos experiencia previa" e junior em qualquer area.
 */
const CARGO_JUNIOR = new RegExp(
  `(^|[^a-z])(${(palavras.cargos_da_area || ['designer']).join('|')})\\s+(junior|j[uú]nior|jr)\\b`, 'i');

const JUNIOR_NO_CORPO = [
  CARGO_JUNIOR,
  /\bn[ií]vel\s+(junior|j[uú]nior)\b/i,
  /\bn[ãa]o\s+exigimos\s+(gradua[çc][ãa]o\s+nem\s+)?experi[êe]ncia\s+pr[ée]via\b/i,
  /\bvaga\s+para\s+iniciantes?\b/i,
  /\bprimeira\s+experi[êe]ncia\b/i,
];

export function detectar(titulo, descricao = '', aberturaChars = 700) {
  const t = ' ' + normalizarTexto(titulo) + ' ';

  for (const j of palavras.senioridade_excluida) {
    const n = normalizarTexto(j);
    if (t.includes(n.startsWith(' ') ? n : ' ' + n)) return 'junior';
  }
  for (const s of SENIOR) if (t.includes(' ' + s + ' ') || t.includes(' ' + s + '.')) return 'senior';
  for (const p of PLENO) if (t.includes(p.startsWith(' ') ? p : ' ' + p)) return 'pleno';

  // Titulo neutro: procura o nivel na abertura da descricao.
  const abertura = String(descricao || '').slice(0, aberturaChars);
  if (abertura && JUNIOR_NO_CORPO.some((re) => re.test(abertura))) return 'junior';

  return 'sem_rotulo';
}

const BASE = { senior: 10, sem_rotulo: 6, pleno: 4, junior: 0 };

// Palavras curtissimas e frequentes de cada idioma. Contar essas e mais robusto
// que procurar termo tecnico, porque descricao de vaga mistura ingles em
// qualquer lingua ("design system", "discovery", "stakeholder").
const PT = /\b(de|da|do|que|para|com|uma|voce|nos|sua|seu|nao|em|por|como|mais|sobre|ser)\b/g;
const EN = /\b(the|and|you|for|with|our|that|this|will|are|have|your|from|their|about)\b/g;

/**
 * A vaga e internacional?
 *
 * NAO usa o ATS. O Greenhouse hospeda Arco, RD Station e QuintoAndar tanto
 * quanto Figma e GitLab — ferramenta gringa nao diz nacionalidade, e essa
 * heuristica dava bonus a pleno brasileiro por engano.
 *
 * Os sinais que de fato funcionam: pagamento em moeda estrangeira, ou o
 * anuncio escrito em ingles. Empresa que contrata brasileiro para vaga
 * nacional escreve em portugues.
 */
export function ehInternacional(vaga) {
  if (!vaga) return false;
  if (vaga.pagaEmDolar === true) return true;

  const moeda = vaga.salario?.moeda || vaga.salarioBruto?.salaryCurrency || vaga.salarioBruto?.currency;
  if (moeda && moeda !== 'BRL') return true;

  const t = String(vaga.descricao || '').toLowerCase();
  if (t.length < 200) return false;
  const pt = (t.match(PT) || []).length;
  const en = (t.match(EN) || []).length;
  return en > pt * 1.5;
}

/**
 * Pontos de senioridade.
 *
 * Regra de 2026-07-30. O que degrada nao e o rotulo "Pleno", e ganhar menos do
 * que voce informou como remuneração de referência no perfil ou nao saber quanto vai ganhar.
 *
 *                        | salario > referencia | sem salario informado
 *   nacional             | vale senior          | perde prioridade
 *   internacional        | vale senior          | vale senior
 *
 * La fora "mid-level" costuma pagar acima do senior daqui mesmo sem anunciar,
 * entao a ausencia do numero nao e sinal de vaga pior. No Brasil e: se nao
 * disseram, e porque nao ajuda.
 *
 * @param {string} nivel
 * @param {{vaga?:object, mensalBRL?:number|null, perfilSalario?:object}} ctx
 */
export function pontos(nivel, ctx = {}) {
  const base = BASE[nivel] ?? 6;
  if (nivel !== 'pleno') return base;

  const cfg = ctx.perfilSalario;
  if (!cfg?.pleno_ok_acima_da_referencia) return base;
  const ref = cfg.referencia_atual_brl;

  if (Number.isFinite(ctx.mensalBRL) && Number.isFinite(ref)) {
    return ctx.mensalBRL > ref ? BASE.senior : base;
  }
  // Salario nao informado: so a vaga internacional ganha o beneficio da duvida.
  return ehInternacional(ctx.vaga) ? BASE.senior : base;
}
