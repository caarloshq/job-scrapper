// Filtro duro. Nada que passa daqui recebe nota; o que e descartado guarda o motivo.
import { normalizarTexto, casaTermo } from './util.js';
import { perfil, palavras } from './config.js';
import * as senioridade from './senioridade.js';
import { janela } from './frescor.js';
import { resolver as resolverSalario, mensalBRL, formatar as formatarSalario } from './salario.js';

/**
 * Quantos caracteres do inicio da descricao contam como "enquadramento da vaga".
 * O anuncio diz o que ele e nas primeiras linhas; o resto e requisito, beneficio
 * e texto juridico.
 */
const ABERTURA = 400;

/**
 * A janela do enquadramento de marketing e maior: a V4 e a Prizma gastam o
 * primeiro paragrafo em cultura da empresa e so depois dizem que a vaga e de
 * campanha e peca grafica.
 */
const ABERTURA_MARKETING = 600;

/** @returns {{passa: boolean, motivo?: string}} */
export function avaliar(vaga, agora = new Date()) {
  const titulo = normalizarTexto(vaga.titulo);
  if (!titulo) return { passa: false, motivo: 'sem titulo' };

  // 1. Titulo fora de escopo. O Gupy tem muito ruido aqui: existe "Designer de Sobrancelhas".
  for (const ex of palavras.titulo_excluido) {
    if (casaTermo(titulo, ex)) return { passa: false, motivo: `titulo excluido: ${ex}` };
  }

  // 1.5. Cargo de outra disciplina entrando pela porta do titulo. A vaga
  //      "Frontend Product Software Engineer, Design Systems" da Dropbox passou
  //      em 2026-07-30 porque "design system" casa em titulo_aceito. E vaga de
  //      engenharia, nao de design.
  for (const ex of palavras.cargo_excluido || []) {
    if (casaTermo(titulo, ex)) return { passa: false, motivo: `outra disciplina: ${ex}` };
  }

  // 2. Precisa ser reconhecivel como vaga de design de produto.
  //    Aqui o `includes` cru esta correto: sao termos longos e especificos,
  //    e queremos casar "product designer" dentro de "Senior Product Designer (App)".
  const daArea = Object.keys(palavras.titulo_aceito).some((k) => titulo.includes(normalizarTexto(k)));
  if (!daArea) return { passa: false, motivo: 'titulo fora da area' };

  // 2.5. Banco de talentos nao e vaga. Precisa olhar a descricao e nao so o titulo:
  //      a BRQ vazou com titulo "Product Designer" e descricao abrindo em
  //      "Mantemos um banco de talentos ativo para Product Designers".
  //
  //      MAS so vale no INICIO do texto, onde fica o enquadramento da vaga.
  //      Boilerplate de LGPD no pe do anuncio cita "banco de talentos" em vaga
  //      legitima: a Nomad, melhor encaixe de dominio da lista, foi descartada
  //      por isso em 2026-07-30. Falso positivo custa vaga boa.
  const enquadramento = normalizarTexto(`${vaga.titulo || ''} ${(vaga.descricao || '').slice(0, ABERTURA)}`);
  for (const ex of palavras.descricao_excluida || []) {
    if (casaTermo(enquadramento, ex)) return { passa: false, motivo: `nao e vaga aberta: ${ex}` };
  }

  // 2.6. Empregador cujo negocio inteiro e outra disciplina. Sete franqueadas
  //      da V4 Company ocuparam sete linhas do radar em 2026-07-30 com a mesma
  //      vaga de designer grafico — e o dedupe nao junta, porque o nome da
  //      franqueada entra no titulo e cada uma tem id proprio.
  const empresa = normalizarTexto(vaga.empresa);
  for (const ex of palavras.empresa_excluida || []) {
    if (empresa && empresa.includes(normalizarTexto(ex))) return { passa: false, motivo: `empregador de outra disciplina: ${ex}` };
  }

  // 2.7. Design de marketing nao e design de produto. O anuncio se denuncia na
  //      abertura; vaga de produto legitima so cita marketing la embaixo, no
  //      meio da lista de stakeholders. Por isso a janela e maior que a de
  //      banco de talentos, mas ainda e uma janela.
  const aberturaMkt = normalizarTexto((vaga.descricao || '').slice(0, ABERTURA_MARKETING));
  for (const ex of palavras.marketing_na_descricao || []) {
    if (aberturaMkt.includes(normalizarTexto(ex))) return { passa: false, motivo: `vaga de marketing: ${ex}` };
  }

  // 3. Senioridade.
  const nivel = vaga.senioridade || senioridade.detectar(vaga.titulo, vaga.descricao);
  if (perfil.senioridade.descartadas.includes(nivel)) return { passa: false, motivo: `senioridade: ${nivel}` };

  // 3.5. Salario abaixo do piso descarta, igual a vaga junior.
  //      So vale quando valor E periodo sao conhecidos: periodo desconhecido
  //      passa, porque descartar por periodo adivinhado custaria vaga boa.
  //      Caso real: bolsa de P&D de R$ 2.000/mes do CEIA entrava com det=50.
  const sal = resolverSalario(vaga);
  const mensal = mensalBRL(sal, perfil.salario);
  if (mensal !== null && mensal < perfil.salario.minimo_mensal_brl) {
    return { passa: false, motivo: `salario abaixo do piso: ${formatarSalario(sal)} (~R$ ${Math.round(mensal)}/mes)` };
  }

  // 4. Inscricao encerrada descarta em qualquer idade.
  //    Vaga de ontem ja fechada nao serve pra nada.
  if (vaga.encerrada === true) return { passa: false, motivo: 'inscricoes encerradas' };

  // 5. So remoto. Qualquer pais serve; cidade nao importa.
  const loc = avaliarLocal(vaga);
  if (!loc.passa) return loc;
  if (loc.modeloDesconhecido) vaga.modeloDesconhecido = true;

  // 6. Prazo de inscricao ja vencido.
  if (vaga.prazo) {
    const p = new Date(vaga.prazo);
    if (!Number.isNaN(p.getTime()) && p < agora) return { passa: false, motivo: 'prazo vencido' };
  }

  // 7. Zumbi.
  if (janela(vaga, agora) === 'zumbi') return { passa: false, motivo: 'zumbi: mais de 45 dias sem sinal de vida' };

  return { passa: true };
}

/**
 * Muita vaga so diz o modelo no titulo: "Product Designer | Presencial | Blumenau/SC"
 * ou "PRODUCT DESIGNER SENIOR | REMOTO". Sem ler o titulo, o filtro erra quando
 * o campo modelo da fonte vem nulo.
 */
export function pistasDoTitulo(titulo) {
  const t = normalizarTexto(titulo);
  if (/hibrid|hybrid/.test(t)) return { modelo: 'hibrido' };
  if (/presencial|on.?site|no escritorio/.test(t)) return { modelo: 'presencial' };
  if (/remot|home ?office|anywhere|100% remoto/.test(t)) return { modelo: 'remoto' };
  return { modelo: null };
}

/**
 * Regra de 2026-07-30: a vaga tem que ser REMOTA, de qualquer pais.
 * Geografia nao entra mais na conta — hibrido e presencial saem em qualquer cidade.
 */
/**
 * Modelo declarado so no corpo do anuncio. A EDGE abre com
 * "Modalidade: Presencial (Maceio ou Arapiraca)" e o titulo nao diz nada —
 * sem isto, presencial em Alagoas entrava como remoto por omissao.
 * So a abertura conta, pela mesma razao do banco de talentos.
 */
export function pistasDaDescricao(descricao) {
  const t = normalizarTexto(String(descricao || '').slice(0, ABERTURA));
  if (!t) return { modelo: null };
  if ((palavras.presencial_na_descricao || []).some((x) => t.includes(normalizarTexto(x)))) return { modelo: 'presencial' };
  if ((palavras.hibrido_na_descricao || []).some((x) => t.includes(normalizarTexto(x)))) return { modelo: 'hibrido' };
  return { modelo: null };
}

export function avaliarLocal(vaga) {
  const modelos = [
    normalizarTexto(vaga.modelo),
    pistasDoTitulo(vaga.titulo).modelo,
    pistasDaDescricao(vaga.descricao).modelo,
  ].filter(Boolean);
  const incompativel = modelos.find((m) => m === 'hibrido' || m === 'presencial');
  const sinalRemoto = modelos.includes('remoto') || vaga.remoto === true;

  if (incompativel) {
    // Hibrido e presencial entram so quando o perfil aceita (onboarding, passo
    // de salario), e so na cidade da pessoa: vaga presencial em outra cidade e
    // vaga que ela nao consegue ocupar. Sem cidade no perfil nao da para
    // conferir, e ai passa — descartar por falta de dado ja custou vaga boa.
    const aceita = incompativel === 'hibrido' ? perfil.aceita_hibrido === true : perfil.aceita_presencial === true;
    if (aceita) {
      const cidade = normalizarTexto(perfil.cidade || '');
      if (!cidade) return { passa: true, modelo: incompativel };
      const onde = normalizarTexto(`${vaga.cidade || ''} ${vaga.estado || ''} ${vaga.titulo || ''} ${(vaga.descricao || '').slice(0, 600)}`);
      if (casaTermo(onde, cidade)) return { passa: true, modelo: incompativel };
      return { passa: false, motivo: `${incompativel} fora de ${perfil.cidade}` };
    }
    const conflito = sinalRemoto ? 'conflito de modalidade: ' : '';
    return { passa: false, motivo: `${conflito}${incompativel}: so remoto entra` };
  }
  if (sinalRemoto) return { passa: true };

  // Modelo desconhecido NAO e motivo de descarte. A Remotar devolve campo nulo
  // em quase tudo: descartar por falta de dado jogou fora 57 vagas na primeira
  // rodada real, por ausencia de informacao e nao por criterio.
  if (perfil.modelo_desconhecido_passa) return { passa: true, modeloDesconhecido: true };
  return { passa: false, motivo: 'modelo de trabalho desconhecido' };
}
