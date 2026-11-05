// Uma intenção gravada antes do POST consome a cota do dia, mesmo se a resposta
// da rede se perder. Task e Actor compartilham o mesmo arquivo por instalação.
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { lerJsonComHash, gravarJsonAtomico } from './persistencia.js';
import { comEscritaCentral } from './operacao.js';

const DIR_PADRAO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const arquivoEm = dirDados => path.join(dirDados, 'cota-apify.json');
const dirPadrao = () => process.env.VAGAS_DIR_DADOS ? path.resolve(process.env.VAGAS_DIR_DADOS) : DIR_PADRAO;
const fusoPadrao = () => process.env.VAGAS_FUSO || Intl.DateTimeFormat().resolvedOptions().timeZone;

function diaValido(dia) {
  if (typeof dia !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error('COTA_APIFY_DIA_INVALIDO');
  const data = new Date(`${dia}T00:00:00Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== dia) throw new Error('COTA_APIFY_DIA_INVALIDO');
  return dia;
}

function fusoValido(fuso) {
  if (typeof fuso !== 'string' || !fuso.trim()) throw new Error('COTA_APIFY_FUSO_INVALIDO');
  try { new Intl.DateTimeFormat('en-US', { timeZone: fuso }); }
  catch { throw new Error('COTA_APIFY_FUSO_INVALIDO'); }
  return fuso;
}

export function diaDaInstalacao(agora = new Date(), fuso = fusoPadrao()) {
  const data = agora instanceof Date ? agora : new Date(agora);
  if (Number.isNaN(data.getTime())) throw new Error('COTA_APIFY_RELOGIO_INVALIDO');
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fusoValido(fuso), year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(data);
  const valor = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
  return `${valor.year}-${valor.month}-${valor.day}`;
}

function lerCota(arquivo, fuso) {
  const { dados } = lerJsonComHash(arquivo, { versao: 1, fuso, dias: {} });
  if (!dados || dados.versao !== 1 || dados.fuso !== fuso || !dados.dias || typeof dados.dias !== 'object' || Array.isArray(dados.dias)) {
    throw new Error('COTA_APIFY_INVALIDA_OU_FUSO_DIVERGENTE: reconcilie o arquivo antes de disparar');
  }
  for (const [dia, uso] of Object.entries(dados.dias)) {
    diaValido(dia);
    if (!uso || typeof uso !== 'object' || !['reservado', 'disparado', 'existente'].includes(uso.estado)) throw new Error('COTA_APIFY_INVALIDA: dia sem uso válido');
  }
  return dados;
}

function textoSeguro(valor, nome, padrao) {
  if (typeof valor !== 'string' || !padrao.test(valor) || /(?:token|bearer|secret|password|senha|chave)/i.test(valor)) throw new Error(`COTA_APIFY_${nome}_INVALIDO`);
  return valor;
}

function bloqueio(dia, uso) {
  const run = uso.runId ? ` Run ${uso.runId} registrado.` : ' Run ainda não confirmado.';
  return new Error(`COTA_APIFY_USADA: ${dia}. Nenhum novo POST pago hoje.${run} Reimporte com --ultimo ou consulte o run existente por GET.`);
}

export function consultarCota({ dirDados = dirPadrao(), agora = new Date(), fuso = fusoPadrao() } = {}) {
  const zona = fusoValido(fuso);
  const dia = diaDaInstalacao(agora, zona);
  const uso = lerCota(arquivoEm(dirDados), zona).dias[dia] || null;
  return { dia, fuso: zona, usado: Boolean(uso), uso };
}

export function reservarDisparo({ dirDados = dirPadrao(), agora = new Date(), fuso = fusoPadrao() } = {}) {
  const zona = fusoValido(fuso);
  const dia = diaDaInstalacao(agora, zona);
  const arquivo = arquivoEm(dirDados);
  return comEscritaCentral(dirDados, () => {
    const cota = lerCota(arquivo, zona);
    if (cota.dias[dia]) throw bloqueio(dia, cota.dias[dia]);
    const reservaId = crypto.randomUUID();
    cota.dias[dia] = { estado: 'reservado', reservaId, registradoEm: new Date(agora).toISOString() };
    gravarJsonAtomico(arquivo, cota);
    return { dia, reservaId };
  }, [arquivo]);
}

export function confirmarDisparo({ dia, reservaId, runId }, { dirDados = dirPadrao(), fuso = fusoPadrao() } = {}) {
  diaValido(dia);
  textoSeguro(reservaId, 'RESERVA', /^[0-9a-f-]{36}$/i);
  textoSeguro(runId, 'RUN', /^[A-Za-z0-9_-]{1,128}$/);
  const zona = fusoValido(fuso);
  const arquivo = arquivoEm(dirDados);
  return comEscritaCentral(dirDados, () => {
    const cota = lerCota(arquivo, zona);
    const uso = cota.dias[dia];
    if (!uso || uso.reservaId !== reservaId || (uso.runId && uso.runId !== runId)) throw new Error('COTA_APIFY_RESERVA_DIVERGENTE: consulte o run por GET');
    if (uso.runId === runId) return uso;
    cota.dias[dia] = { ...uso, estado: 'disparado', runId };
    gravarJsonAtomico(arquivo, cota);
    return cota.dias[dia];
  }, [arquivo]);
}

// Uso humano: semeia uma coleta comprovada que já aconteceu, sem fazer rede.
export function registrarUsoExistente({ dia, runId, provaRef }, { dirDados = dirPadrao(), fuso = fusoPadrao() } = {}) {
  diaValido(dia);
  textoSeguro(runId, 'RUN', /^[A-Za-z0-9_-]{1,128}$/);
  textoSeguro(provaRef, 'PROVA', /^[A-Za-z0-9_./:#-]{1,240}$/);
  const zona = fusoValido(fuso);
  const arquivo = arquivoEm(dirDados);
  return comEscritaCentral(dirDados, () => {
    const cota = lerCota(arquivo, zona);
    const uso = cota.dias[dia];
    if (uso?.runId && uso.runId !== runId) throw new Error('COTA_APIFY_USO_DIVERGENTE: não substitua um run já registrado');
    if (uso?.runId === runId && uso.provaRef === provaRef) return uso;
    cota.dias[dia] = { ...uso, estado: uso ? 'disparado' : 'existente', runId, provaRef, registradoEm: uso?.registradoEm || new Date().toISOString() };
    gravarJsonAtomico(arquivo, cota);
    return cota.dias[dia];
  }, [arquivo]);
}
