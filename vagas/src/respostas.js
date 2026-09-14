// Guarda local de estrutura e erros conhecidos. Não prova veracidade, adequação
// à vaga ou aprovação real; a conferência humana continua necessária.
const normalizar = (valor) => String(valor ?? '').normalize('NFD')
  .replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const texto = (valor) => typeof valor === 'string' && valor.trim().length > 0;
const USOS = new Set(['direta', 'contextual', 'pessoal', 'documento']);
const METATEXTO = /(?:traducao para (?:o )?ingles|resposta enviada em|texto sobre|\[todo\]|\btodo\s*:|ver data\/|depende da vaga|nao declarar fluencia|\b(?:tbd|lorem ipsum)\b|\[(?:preencher|inserir)[^\]]*\])/;
const PESSOAL = /\b(?:cpf|rg|rne|passaporte|passport|raca|etnia|ethnicity|race|genero|gender|pronome|pronomes|pronouns?|deficiencia|disabilit\w*|orientacao sexual|sexual orientation|data de nascimento|date of birth|nome (?:completo )?da (?:sua )?mae)\b/;
const NUMERO_DOCUMENTO = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/;

export function contemMetatexto(valor) {
  return typeof valor === 'string' && METATEXTO.test(normalizar(valor));
}

function fonteConcreta(valor) {
  if (!texto(valor) || /^(?:fonte|perfil|curriculo|confirmado|legado|teste|exemplo|a confirmar)$/i.test(valor.trim())) return false;
  // Aceita uma referência consultável, não uma etiqueta vaga de evidência.
  return /https?:\/\/\S+|(?:[\w.-]+\/)*[\w.-]+\.(?:json|md|pdf|docx|html|txt|png|jpg|jpeg|webp|png|jpg|jpeg|eml)(?:[#:]\S+)?/i.test(valor)
    || /(?:confirmacao|confirmado|conversa|autorizacao|aprovado).*(?:\d{4}-\d{2}-\d{2})/i.test(normalizar(valor));
}

function resultado(erros, pendencias = [], avisos = []) {
  return { ok: erros.length === 0 && pendencias.length === 0, erros, pendencias, avisos };
}

function textoDiretoPronto(entrada) {
  return entrada?.uso === 'direta' && entrada.aprovada === true
    && texto(entrada.resposta) && !contemMetatexto(entrada.resposta)
    && fonteConcreta(entrada.fonte) && texto(entrada.escopo);
}

export function respostaAutomatica(entrada, contexto) {
  return textoDiretoPronto(entrada) && texto(contexto?.empresa)
    && escopoCompativel(entrada.escopo, contexto);
}

export function validarBanco(banco, perfil) {
  const erros = [];
  const avisos = [];
  if (!Array.isArray(banco?.perguntas)) return resultado(['Banco: perguntas deve ser uma lista.']);
  const chaves = new Set();
  banco.perguntas.forEach((entrada, i) => {
    const local = `Banco[${i}]`;
    if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
      erros.push(`${local}: entrada deve ser um objeto.`);
      return;
    }
    if (!texto(entrada.pergunta) || !texto(entrada.normalizada)) erros.push(`${local}: pergunta e chave obrigatórias.`);
    const chave = normalizar(entrada.normalizada).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
    if (chave && chaves.has(chave)) avisos.push(`${local}: chave equivalente já existe; conferir contexto antes de reutilizar.`);
    chaves.add(chave);
    if (!USOS.has(entrada.uso)) erros.push(`${local}: uso inválido ou ausente.`);
    if (!texto(entrada.fonte) || !texto(entrada.escopo)) erros.push(`${local}: fonte e escopo obrigatórios.`);
    if (typeof entrada.aprovada !== 'boolean') erros.push(`${local}: aprovada deve ser booleano.`);
    if (entrada.resposta !== null && !texto(entrada.resposta)) erros.push(`${local}: resposta deve ser texto final não vazio ou null.`);
    if (contemMetatexto(entrada.resposta)) erros.push(`${local}: resposta contém instrução ou resumo, não texto final.`);
    if (entrada.uso === 'direta' && entrada.aprovada === true && !textoDiretoPronto(entrada)) erros.push(`${local}: resposta direta aprovada não está pronta.`);
    if (entrada.uso === 'documento' && entrada.resposta !== null) erros.push(`${local}: documento não deve ter valor no banco.`);
    if (NUMERO_DOCUMENTO.test(String(entrada.resposta ?? ''))) erros.push(`${local}: possível documento no texto; retirar e conferir na fonte privada.`);
    if (entrada.uso === 'pessoal' && entrada.resposta !== null) avisos.push(`${local}: conferir se a resposta pessoal deveria ficar somente na fonte privada.`);
  });
  if (perfil !== undefined) {
    if (!perfil || typeof perfil !== 'object' || Array.isArray(perfil)) erros.push('Perfil: deve ser objeto.');
    else {
      const consentimento = perfil.consentimento;
      if (consentimento?.marcar_lgpd_automaticamente === true
        && (consentimento.somente_candidatura_com_envio_autorizado !== true
          || consentimento.opcionais_exigem_decisao !== true || !fonteConcreta(consentimento.fonte_autorizacao))) {
        erros.push('Perfil: consentimento automático exige fonte da autorização, candidatura com envio autorizado e decisão separada para opcionais.');
      }
      for (const chave of ['ja_trabalhou_na_empresa', 'foi_indicado_por_alguem']) {
        if (texto(perfil.perguntas_comuns?.[chave])) erros.push(`Perfil: ${chave} não pode ser resposta global; depende da candidatura.`);
      }
      const regraMoeda = normalizar(perfil.remuneracao?._qual_usar);
      if (/dolar ou euro.*usd/.test(regraMoeda)) erros.push('Perfil: instrução mistura EUR com pretensão em USD.');
    }
  }
  const saida = resultado(erros, [], avisos);
  saida.total = banco.perguntas.length;
  saida.textosDiretosProntos = banco.perguntas.filter(textoDiretoPronto).length;
  return saida;
}

function escopoCompativel(escopo, candidatura) {
  if (!texto(escopo)) return false;
  const valor = normalizar(escopo);
  return valor === 'geral' || valor === normalizar(candidatura.empresa)
    || ['pais', 'regime', 'moeda'].some((campo) => texto(candidatura[campo]) && valor === normalizar(candidatura[campo]));
}

export function validarCandidatura(candidatura) {
  const erros = [];
  const pendencias = [];
  if (!candidatura || typeof candidatura !== 'object' || Array.isArray(candidatura)) return resultado(['Candidatura deve ser um objeto.']);
  for (const campo of ['idExterno', 'empresa', 'idioma']) {
    if (!texto(candidatura[campo])) erros.push(`Candidatura: ${campo} obrigatório.`);
  }
  if (!fonteConcreta(candidatura.descricaoFonte)) erros.push('Candidatura: descricaoFonte exige URL ou caminho concreto do anúncio.');
  if (!['rascunho', 'enviada'].includes(candidatura.estado)) erros.push('Candidatura: estado deve ser rascunho ou enviada.');
  if (!Array.isArray(candidatura.respostas)) erros.push('Candidatura: respostas deve ser lista; use vazia quando não houver perguntas a registrar.');
  else candidatura.respostas.forEach((resposta, i) => {
    const local = `Candidatura.respostas[${i}]`;
    if (!resposta || typeof resposta !== 'object' || Array.isArray(resposta)) {
      erros.push(`${local}: resposta deve ser objeto.`);
      return;
    }
    if (!texto(resposta.pergunta)) erros.push(`${local}: pergunta obrigatória.`);
    if (!texto(resposta.resposta)) pendencias.push(`${local}: falta o texto final.`);
    if (contemMetatexto(resposta.resposta)) erros.push(`${local}: contém instrução ou resumo em vez de texto final.`);
    if (!fonteConcreta(resposta.fonte)) erros.push(`${local}: fonte precisa de caminho, URL ou confirmação datada.`);
    if (!escopoCompativel(resposta.escopo, candidatura)) erros.push(`${local}: escopo não corresponde à empresa ou ao contexto declarado.`);
    if (resposta.aprovada !== true) pendencias.push(`${local}: aguarda aprovação específica antes do envio.`);
    if (['pessoal', 'documento'].includes(resposta.uso)
      || PESSOAL.test(normalizar(resposta.pergunta)) || NUMERO_DOCUMENTO.test(String(resposta.resposta ?? ''))
      || /dados-pessoais\.json/i.test(String(resposta.fonte ?? ''))) {
      erros.push(`${local}: documento ou dado pessoal sensível não pertence ao registro; conferir separadamente com voce.`);
    }
  });
  const a = candidatura.autorizacaoEnvio;
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(a?.em ?? '') || !fonteConcreta(a?.referencia)) {
    pendencias.push('Candidatura: falta autorização de envio de voce com data e referência concreta.');
  }
  if (candidatura.estado === 'enviada') {
    const c = candidatura.confirmacao;
    if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(c?.em ?? '')
      || !fonteConcreta(c?.referencia)) erros.push('Candidatura enviada: exige confirmação da plataforma com data e referência concreta da tela ou e-mail.');
  }
  return resultado(erros, pendencias, ['Checagem estrutural: não comprova veracidade, idioma, relevância nem a existência real da aprovação.']);
}

export function modeloCandidatura() {
  return {
    idExterno: '', empresa: '', idioma: '', descricaoFonte: '', estado: 'rascunho',
    pais: '', regime: '', moeda: '',
    respostas: [{ pergunta: '', resposta: null, fonte: '', escopo: '', aprovada: false }],
    autorizacaoEnvio: { em: '', referencia: '' },
    confirmacao: { em: '', referencia: '' },
  };
}
