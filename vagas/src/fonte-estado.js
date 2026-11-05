// Fonte de estado escolhida nesta instalação. O agente consulta o Notion pelo
// MCP e entrega um snapshot normalizado; este módulo nunca acessa a rede.
import { join } from 'node:path';
import { DIR_DADOS } from './config.js';
import { lerEstado, salvarEstado } from './estado-central.js';

const CONFIG = join(DIR_DADOS, 'fonte-estado.json');
const NOTION = join(DIR_DADOS, 'notion.json');
const LOCAL = join(DIR_DADOS, 'quadro.json');
const INICIAL = { fonte: 'local' };
const STATUS_SUPORTADOS = new Set(['Avaliar', 'Aplicar', 'Já apliquei', 'Entrevista', 'Cancelada', 'Aplicado por IA', 'Revisar']);

const texto = (valor) => typeof valor === 'string' && valor.trim() ? valor.trim() : null;
const dataIso = (valor) => texto(valor) && !Number.isNaN(Date.parse(valor)) ? valor : null;
const falha = (motivo) => { throw new Error(`ESTADO_NOTION_INVALIDO: ${motivo}`); };

export function configuracao() {
  const atual = lerEstado(CONFIG, INICIAL);
  if (atual?.fonte === 'local') return atual;
  if (atual?.fonte === 'notion' && texto(atual.databaseId)) return atual;
  throw new Error('FONTE_ESTADO_INVALIDA: escolha local ou notion com databaseId.');
}

export function selecionar(fonte, databaseId = null) {
  if (fonte !== 'local' && fonte !== 'notion') throw new Error('FONTE_ESTADO_INVALIDA: use local ou notion.');
  if (fonte === 'notion' && !texto(databaseId)) throw new Error('DATABASE_ID_OBRIGATORIO');
  const atual = configuracao();
  const proxima = fonte === 'local' ? { fonte: 'local' } : { fonte, databaseId: texto(databaseId) };
  Object.keys(atual).forEach((chave) => delete atual[chave]);
  Object.assign(atual, proxima);
  salvarEstado(CONFIG, atual, DIR_DADOS);
  return proxima;
}

/**
 * Contrato do snapshot: { origem:{tipo:'notion',databaseId}, consultadoEm,
 * paginas:[{cursorEntrada:null|string, proximoCursor:null|string,
 * temMais:boolean, vagas:[{paginaId,idExterno,status,gaps?,empresa?,titulo?,url?}]}] }.
 * A primeira página começa em null; cada cursor liga à seguinte; a última
 * declara temMais:false. O agente responde pela consulta integral via MCP.
 */
export function normalizarSnapshot(snapshot, databaseId) {
  if (snapshot?.origem?.tipo !== 'notion' || snapshot.origem.databaseId !== databaseId) falha('databaseId/origem divergente');
  if (!dataIso(snapshot.consultadoEm)) falha('consultadoEm ausente ou inválido');
  if (!Array.isArray(snapshot.paginas) || !snapshot.paginas.length) falha('paginas ausentes');
  const vagas = Object.create(null);
  const paginasVistas = new Set();
  let cursorEsperado = null;
  for (const [indice, pagina] of snapshot.paginas.entries()) {
    if (pagina?.cursorEntrada !== cursorEsperado || typeof pagina.temMais !== 'boolean' || !Array.isArray(pagina.vagas)) falha(`paginação incompleta na página ${indice + 1}`);
    if (pagina.temMais !== (indice < snapshot.paginas.length - 1)) falha('paginação não termina corretamente');
    if (pagina.temMais && !texto(pagina.proximoCursor)) falha('próximo cursor ausente');
    if (!pagina.temMais && pagina.proximoCursor !== null) falha('cursor final deve ser null');
    cursorEsperado = pagina.proximoCursor;
    for (const linha of pagina.vagas) {
      const id = texto(linha?.idExterno);
      if (!id || !texto(linha.paginaId) || !texto(linha.status)) falha('linha sem paginaId, idExterno ou status');
      if (!STATUS_SUPORTADOS.has(linha.status.trim())) falha(`status desconhecido: ${linha.status}`);
      if (['__proto__', 'constructor', 'prototype'].includes(id) || Object.hasOwn(vagas, id)) falha(`idExterno duplicado ou inválido: ${id}`);
      if (paginasVistas.has(linha.paginaId)) falha(`paginaId duplicado: ${linha.paginaId}`);
      paginasVistas.add(linha.paginaId);
      vagas[id] = {
        paginaId: linha.paginaId.trim(), status: linha.status.trim(),
        gaps: typeof linha.gaps === 'string' ? linha.gaps : null,
        empresa: texto(linha.empresa), titulo: texto(linha.titulo), url: texto(linha.url),
      };
    }
  }
  return { versao: 1, fonte: 'notion', databaseId, sincronizadoEm: snapshot.consultadoEm,
    paginacao: { completa: true, paginas: snapshot.paginas.length }, vagas };
}

export function importar(snapshot) {
  const config = configuracao();
  if (config.fonte !== 'notion') throw new Error('FONTE_ESTADO_LOCAL: selecione Notion antes de importar.');
  const proximo = normalizarSnapshot(snapshot, config.databaseId);
  const atual = lerEstado(NOTION, null);
  if (atual?.databaseId === config.databaseId && dataIso(atual.sincronizadoEm) &&
      Date.parse(proximo.sincronizadoEm) < Date.parse(atual.sincronizadoEm)) {
    throw new Error('ESTADO_NOTION_ANTIGO: consulte a database novamente antes de importar.');
  }
  // O espelho é substituído por consulta completa, sob posse e CAS. O quadro
  // local permanece intacto e nunca recebe status do Notion por acidente.
  if (atual !== null) {
    Object.keys(atual).forEach((chave) => delete atual[chave]);
    Object.assign(atual, proximo);
    salvarEstado(NOTION, atual, DIR_DADOS);
  } else {
    // lerEstado(null) já registrou o hash ausente no objeto? null não recebe
    // versão, então uma importação concorrente falha no CAS ao salvar.
    salvarEstado(NOTION, proximo, DIR_DADOS);
  }
  return proximo;
}

export function carregarFonte() {
  const config = configuracao();
  if (config.fonte === 'local') return lerEstado(LOCAL, { versao: 1, sincronizadoEm: null, vagas: {} });
  const espelho = lerEstado(NOTION, null);
  if (!espelho || espelho.fonte !== 'notion' || espelho.databaseId !== config.databaseId ||
      espelho.paginacao?.completa !== true || !dataIso(espelho.sincronizadoEm) ||
      !espelho.vagas || typeof espelho.vagas !== 'object' || Array.isArray(espelho.vagas)) {
    throw new Error('ESTADO_NOTION_AUSENTE: importe snapshot completo da database configurada pelo agente.');
  }
  return espelho;
}

export function exigirLocal() {
  if (configuracao().fonte !== 'local') throw new Error('ESTADO_NOTION_SOMENTE_LEITURA: altere o status no Notion via agente e importe novo snapshot.');
}
