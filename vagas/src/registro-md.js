import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PROJETO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ESPERA = new Int32Array(new SharedArrayBuffer(4));
const CHAVES_PERIGOSAS = new Set(['__proto__', 'prototype', 'constructor']);
const PERGUNTA_SENSIVEL = /\b(?:cpf|rg|passaporte|passport|social security|national id|documento de identidade|identity document|data de nascimento|date of birth|birth date|raça|raca|race|etnia|ethnicity|gênero|genero|gender|orientação sexual|orientacao sexual|sexual orientation|deficiência|deficiencia|disability|pcd|religião|religiao|religion|antecedentes criminais|criminal record|autodeclaração|autodeclaracao|self.identification)\b/i;
const VALOR_SENSIVEL = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b|\bBearer\s+[A-Za-z0-9._~+/-]{16,}/i;

function objeto(valor, chaves, rotulo) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor) || ![Object.prototype, null].includes(Object.getPrototypeOf(valor))) {
    throw new Error(`PACOTE_INVALIDO: ${rotulo} deve ser objeto simples`);
  }
  for (const chave of Object.keys(valor)) {
    if (CHAVES_PERIGOSAS.has(chave) || !chaves.includes(chave)) throw new Error(`PACOTE_INVALIDO: chave não permitida em ${rotulo}`);
  }
  return valor;
}

function texto(valor, rotulo, { linha = false } = {}) {
  if (typeof valor !== 'string' || !valor.trim() || valor.includes('\0') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(valor)) {
    throw new Error(`PACOTE_INVALIDO: ${rotulo} exige texto não vazio`);
  }
  if (linha && /[\r\n\x00-\x1f\x7f]/.test(valor)) throw new Error(`PACOTE_INVALIDO: ${rotulo} deve ter uma linha`);
  return valor;
}

function mdLinha(valor) {
  return valor.replace(/[\\`*_{}\[\]()#+.!|>~-]/g, '\\$&');
}

function cerca(valor) {
  const corridas = valor.match(/~+/g) || [];
  return '~'.repeat(Math.max(3, ...corridas.map((item) => item.length + 1)));
}

function pacoteValidado(entrada) {
  objeto(entrada, ['contexto', 'campos'], 'pacote');
  const contexto = objeto(entrada.contexto, ['empresa', 'vaga', 'id', 'data'], 'contexto');
  const dados = {
    empresa: texto(contexto.empresa, 'empresa', { linha: true }),
    vaga: texto(contexto.vaga, 'vaga', { linha: true }),
    id: texto(contexto.id, 'id', { linha: true }),
    data: texto(contexto.data, 'data', { linha: true }),
  };
  const data = new Date(`${dados.data}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data) || Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== dados.data) throw new Error('PACOTE_INVALIDO: data deve ser YYYY-MM-DD');
  if (!Array.isArray(entrada.campos) || entrada.campos.length === 0) throw new Error('PACOTE_INVALIDO: campos não pode ser vazio');
  const campos = [];
  for (const [indice, bruto] of entrada.campos.entries()) {
    const campo = objeto(bruto, ['pergunta', 'texto', 'preenchida', 'evidencia', 'referenciaPrivada'], `campo ${indice + 1}`);
    if (campo.preenchida !== true && campo.preenchida !== false) throw new Error(`PACOTE_INVALIDO: campo ${indice + 1} exige preenchida booleana`);
    if (!campo.preenchida) continue;
    const pergunta = texto(campo.pergunta, 'pergunta', { linha: true });
    if (campo.evidencia !== undefined) texto(campo.evidencia, 'evidencia', { linha: true });
    if (PERGUNTA_SENSIVEL.test(pergunta)) {
      if (campo.texto !== undefined) throw new Error('DADO_SENSIVEL: use somente referenciaPrivada para esta pergunta');
      const referenciaPrivada = texto(campo.referenciaPrivada, 'referenciaPrivada', { linha: true });
      if (!/^ref:[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(referenciaPrivada)) throw new Error('DADO_SENSIVEL: referência deve ser identificador privado ref:...');
      campos.push({ pergunta, referenciaPrivada });
      continue;
    }
    if (campo.referenciaPrivada !== undefined) throw new Error('PACOTE_INVALIDO: referenciaPrivada só cabe em campo sensível');
    const resposta = texto(campo.texto, 'texto');
    if (VALOR_SENSIVEL.test(resposta)) throw new Error('DADO_SENSIVEL: padrão de dado pessoal ou segredo detectado');
    campos.push({ pergunta, resposta });
  }
  if (campos.length === 0) return null;
  return { contexto: dados, campos };
}

function bloco(pacote) {
  const { empresa, vaga, id, data } = pacote.contexto;
  const linhas = [`## ${[empresa, vaga, id, data].map(mdLinha).join(' | ')}`, ''];
  for (const campo of pacote.campos) {
    linhas.push(`### ${mdLinha(campo.pergunta)}`, '');
    if (campo.referenciaPrivada) {
      linhas.push(`Referência privada: ${campo.referenciaPrivada}`, '');
    } else {
      const delimitador = cerca(campo.resposta);
      linhas.push(`${delimitador}text`, campo.resposta + (campo.resposta.endsWith('\n') ? '' : '\n') + delimitador, '');
    }
  }
  return `${linhas.join('\n').trimEnd()}\n`;
}

function validarDiretorioReal(diretorio) {
  const raiz = path.parse(diretorio).root;
  let atual = raiz;
  for (const parte of path.relative(raiz, diretorio).split(path.sep).filter(Boolean)) {
    atual = path.join(atual, parte);
    const info = fs.lstatSync(atual);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('CAMINHO_INSEGURO: diretório não é real');
  }
  if (fs.realpathSync(diretorio) !== diretorio) throw new Error('CAMINHO_INSEGURO: diretório contém link');
}

function destinoSeguro(raizProjeto) {
  if (typeof raizProjeto !== 'string' || !path.isAbsolute(raizProjeto)) throw new Error('CAMINHO_INVALIDO: raizProjeto deve ser absoluta');
  const raiz = path.resolve(raizProjeto);
  const relativo = path.relative(PROJETO, raiz);
  if (relativo === '..' || relativo.startsWith(`..${path.sep}`) || path.isAbsolute(relativo)) throw new Error('CAMINHO_INVALIDO: raizProjeto fora do projeto');
  validarDiretorioReal(raiz);
  const pasta = path.join(raiz, 'revisoes');
  try { fs.mkdirSync(pasta, { mode: 0o700 }); }
  catch (erro) { if (erro.code !== 'EEXIST') throw erro; }
  validarDiretorioReal(pasta);
  return path.join(pasta, 'respostas.md');
}

function lerSeguro(arquivo) {
  let anterior;
  try { anterior = fs.lstatSync(arquivo); }
  catch (erro) { if (erro.code === 'ENOENT') return { conteudo: Buffer.alloc(0), hash: null }; throw erro; }
  if (!anterior.isFile() || anterior.isSymbolicLink() || anterior.nlink !== 1 || fs.realpathSync(arquivo) !== arquivo) throw new Error('CAMINHO_INSEGURO: respostas.md não é arquivo regular exclusivo');
  const fd = fs.openSync(arquivo, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const aberto = fs.fstatSync(fd);
    if (!aberto.isFile() || aberto.nlink !== 1 || aberto.dev !== anterior.dev || aberto.ino !== anterior.ino) throw new Error('ARQUIVO_ALTERADO_DURANTE_LEITURA');
    const bruto = fs.readFileSync(fd);
    const depois = fs.fstatSync(fd);
    if (depois.size !== bruto.length || depois.ino !== aberto.ino || depois.dev !== aberto.dev) throw new Error('ARQUIVO_ALTERADO_DURANTE_LEITURA');
    return { conteudo: bruto, hash: crypto.createHash('sha256').update(bruto).digest('hex') };
  } finally { fs.closeSync(fd); }
}

function comLock(arquivo, operacao) {
  const trava = path.join(path.dirname(arquivo), '.respostas.md.lock');
  const limite = Date.now() + 8000;
  let fd;
  while (fd === undefined) {
    try { fd = fs.openSync(trava, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600); }
    catch (erro) {
      if (erro.code !== 'EEXIST') throw erro;
      let info;
      try { info = fs.lstatSync(trava); }
      catch (falha) { if (falha.code === 'ENOENT') continue; throw falha; }
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('CAMINHO_INSEGURO: lock inválido');
      if (Date.now() >= limite) throw new Error('LOCK_OCUPADO: tente novamente; verifique lock órfão se persistir');
      Atomics.wait(ESPERA, 0, 0, 25);
    }
  }
  const lockAberto = fs.fstatSync(fd);
  try { return operacao(); }
  finally {
    fs.closeSync(fd);
    const info = fs.lstatSync(trava);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.dev !== lockAberto.dev || info.ino !== lockAberto.ino) throw new Error('CAMINHO_INSEGURO: lock alterado');
    fs.unlinkSync(trava);
  }
}

function gravarAtomico(arquivo, conteudo, hashEsperado) {
  if (lerSeguro(arquivo).hash !== hashEsperado) throw new Error('CONFLITO_ESCRITA: respostas.md mudou durante a gravação');
  const pasta = path.dirname(arquivo);
  const temporario = path.join(pasta, `.respostas.md.${process.pid}.${crypto.randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporario, 'wx', 0o600);
    fs.writeFileSync(fd, conteudo);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    if (lerSeguro(arquivo).hash !== hashEsperado) throw new Error('CONFLITO_ESCRITA: respostas.md mudou durante a gravação');
    fs.renameSync(temporario, arquivo);
    const dfd = fs.openSync(pasta, 'r');
    try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporario); } catch (erro) { if (erro.code !== 'ENOENT') throw erro; }
  }
}

// raizProjeto serve a testes locais; o CLI sempre usa o projeto que contém vagas/.
export function registrarRespostas(entrada, { raizProjeto = PROJETO } = {}) {
  const pacote = pacoteValidado(entrada);
  if (!pacote) return { registrado: false, motivo: 'nenhum campo preenchido' };
  const arquivo = destinoSeguro(raizProjeto);
  return comLock(arquivo, () => {
    const anterior = lerSeguro(arquivo);
    const novoBloco = Buffer.from(bloco(pacote), 'utf8');
    if (anterior.conteudo.includes(novoBloco)) return { registrado: false, motivo: 'pacote já registrado', arquivo };
    const fim = anterior.conteudo.subarray(-2).toString('ascii');
    const separador = anterior.conteudo.length === 0 || fim === '\n\n' ? '' : fim.endsWith('\n') ? '\n' : '\n\n';
    gravarAtomico(arquivo, Buffer.concat([anterior.conteudo, Buffer.from(separador), novoBloco]), anterior.hash);
    return { registrado: true, campos: pacote.campos.length, arquivo };
  });
}

export const raizDoProjeto = PROJETO;
