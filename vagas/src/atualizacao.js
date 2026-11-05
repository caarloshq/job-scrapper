// Atualização conservadora: somente release estável deste repositório, por avanço linear.
// Chamar antes de entrarEscritor. A entrada de operação deve recusar .atualizacao.lock.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const executar = promisify(execFile);
const ORIGEM = 'https://github.com/caarloshq/jobrelay.git';
// Instalações anteriores à renomeação conservam esta URL no Git. O redirect
// oficial do GitHub mantém o histórico; qualquer outra origem é recusada.
const ORIGENS_PERMITIDAS = new Set([ORIGEM, 'https://github.com/caarloshq/job-scrapper.git']);
const API = 'https://api.github.com/repos/caarloshq/jobrelay';
const TAG = /^v[0-9]+\.[0-9]+\.[0-9]+(?:\+[0-9A-Za-z.-]+)?$/;
const SHA = /^[a-f0-9]{40}$/;
const MAX_RESPOSTA = 128 * 1024;
const TIMEOUT_REDE = 10000;
const TIMEOUT_GIT = 30000;

const proteger = nome => {
  const p = nome.normalize('NFKC').replaceAll('\\', '/').toLowerCase();
  const partes = p.split('/');
  return partes.some(n => n === '.env' || n.startsWith('.env.')) ||
    ['config/', 'data/', 'vagas/config/', 'vagas/data/', 'revisoes/', 'curriculo/',
      'skills/adapt-resume/materiais-fonte/', 'skills/adapt-resume/builds/'].some(prefixo => p.startsWith(prefixo)) ||
    /(^|\/)(base_content_[^/]+\.json|base_resume_[^/]+\.(pdf|docx))$/.test(p);
};

function falhar(codigo) { const erro = new Error(codigo); erro.codigo = codigo; throw erro; }

function seguroNoDisco(alvo, tipo = 'qualquer') {
  const absoluto = path.resolve(alvo);
  let atual = path.parse(absoluto).root;
  for (const parte of path.relative(atual, absoluto).split(path.sep).filter(Boolean)) {
    atual = path.join(atual, parte);
    let st;
    try { st = fs.lstatSync(atual); } catch (erro) { if (erro.code === 'ENOENT') return; throw erro; }
    if (st.isSymbolicLink()) falhar('CAMINHO_SIMBOLICO');
    if (atual === absoluto) {
      if (tipo === 'diretorio' && !st.isDirectory()) falhar('CAMINHO_INVALIDO');
      if (tipo === 'arquivo' && (!st.isFile() || st.nlink !== 1)) falhar('DESTINO_INSEGURO');
      if (tipo === 'qualquer' && st.isFile() && st.nlink !== 1) falhar('DESTINO_INSEGURO');
    } else if (!st.isDirectory()) falhar('CAMINHO_INVALIDO');
  }
}

async function git(raiz, ...args) {
  const ambiente = { ...process.env };
  for (const nome of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_SHALLOW_FILE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG_PARAMETERS']) delete ambiente[nome];
  const { stdout } = await executar('git', [
    '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'credential.helper=',
    '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always',
    '-c', 'protocol.file.allow=never', '-C', raiz, ...args,
  ], { encoding: 'utf8', timeout: TIMEOUT_GIT, maxBuffer: 4 * 1024 * 1024,
    env: { ...ambiente, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_COUNT: '0', GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/usr/bin/false' } });
  return stdout.replace(/\n$/, '');
}

async function respostaJson(url, fetchImpl) {
  const resposta = await fetchImpl(url, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_REDE),
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'jobrelay-update' },
  });
  if (!resposta.ok) falhar('RELEASE_INDISPONIVEL');
  if (new URL(resposta.url).origin !== 'https://api.github.com') falhar('ORIGEM_API_INVALIDA');
  const comprimento = Number(resposta.headers.get('content-length'));
  if (Number.isFinite(comprimento) && comprimento > MAX_RESPOSTA) falhar('RESPOSTA_GRANDE');
  const leitor = resposta.body?.getReader();
  if (!leitor) falhar('RESPOSTA_INVALIDA');
  const partes = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await leitor.read();
      if (done) break;
      total += value.length;
      if (total > MAX_RESPOSTA) falhar('RESPOSTA_GRANDE');
      partes.push(value);
    }
  } finally { leitor.releaseLock(); }
  try { return JSON.parse(Buffer.concat(partes).toString('utf8')); }
  catch { falhar('RESPOSTA_INVALIDA'); }
}

async function releaseEstavel(fetchImpl) {
  const release = await respostaJson(`${API}/releases/latest`, fetchImpl);
  if (release.draft !== false || release.prerelease !== false || !TAG.test(release.tag_name)) falhar('RELEASE_NAO_ESTAVEL');
  const ref = await respostaJson(`${API}/git/ref/tags/${encodeURIComponent(release.tag_name)}`, fetchImpl);
  if (ref.ref !== `refs/tags/${release.tag_name}` || !['tag', 'commit'].includes(ref.object?.type) || !SHA.test(ref.object?.sha)) falhar('TAG_INVALIDA');
  return { tag: release.tag_name, tagSha: ref.object.sha };
}

function estadoOperacao(dados) {
  const pasta = path.join(dados, 'operacao');
  seguroNoDisco(pasta, 'diretorio');
  for (const nome of ['.escrita.lock', '.recuperacao.lock']) {
    try { fs.lstatSync(path.join(pasta, nome)); falhar('OPERACAO_OCUPADA'); }
    catch (erro) { if (erro.code !== 'ENOENT') throw erro; }
  }
  const estado = path.join(pasta, 'estado.json');
  seguroNoDisco(estado, 'arquivo');
  if (fs.existsSync(estado)) {
    let conteudo;
    try { conteudo = JSON.parse(fs.readFileSync(estado, 'utf8')); }
    catch { falhar('ESTADO_OPERACAO_INVALIDO'); }
    if (conteudo?.contrato !== 1 || conteudo?.status !== 'encerrada') falhar('OPERACAO_OCUPADA');
  } else if (['controle-operacao.json', 'tentativas-envio.json'].some(nome => fs.existsSync(path.join(dados, nome)))) {
    falhar('ESTADO_OPERACAO_INVALIDO');
  }
}

function gravarResultado(dados, resultado) {
  const destino = path.join(dados, 'atualizacao.json');
  seguroNoDisco(destino, 'arquivo');
  const temporario = path.join(dados, `.atualizacao-${crypto.randomUUID()}.json`);
  fs.writeFileSync(temporario, JSON.stringify({ ...resultado, em: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  try { fs.renameSync(temporario, destino); }
  finally { if (fs.existsSync(temporario)) fs.unlinkSync(temporario); }
}

function caminhosAlterados(saida) { return saida ? saida.split('\0').filter(Boolean) : []; }

async function verificarDestino(raiz, commit, caminhos) {
  for (const nome of caminhos) {
    if (proteger(nome)) falhar('RELEASE_ALTERA_DADOS_PROTEGIDOS');
    if (nome === '.gitattributes' || nome === '.gitmodules' || nome.endsWith('/.gitattributes') || nome.endsWith('/.gitmodules')) falhar('RELEASE_ALTERA_FILTROS');
    seguroNoDisco(path.join(raiz, nome));
    const entrada = await git(raiz, 'ls-tree', commit, '--', nome);
    if (entrada && !/^100(644|755) blob [a-f0-9]{40}\t/.test(entrada) && !/^040000 tree [a-f0-9]{40}\t/.test(entrada)) falhar('RELEASE_CONTEM_LINK_OU_SUBMODULO');
  }
}

/** Retorna { status, motivo?, tag?, commit? }. Nunca lê .env nem inicia uma operação. */
export async function atualizarAutomaticamente({ raiz, fetchImpl = globalThis.fetch, consultarRelease = null, obterTag = null, aplicarMerge = null } = {}) {
  if (typeof raiz !== 'string' || !path.isAbsolute(raiz)) throw new TypeError('raiz absoluta obrigatória');
  // A injeção da aplicação serve apenas às fixtures offline, junto com release
  // e tag locais. A execução real sempre chama git merge --ff-only.
  if (aplicarMerge && (!consultarRelease || !obterTag || typeof aplicarMerge !== 'function')) throw new TypeError('aplicarMerge exige fixture offline');
  const projeto = path.resolve(raiz);
  const dados = path.join(projeto, 'vagas/data');
  const operacao = path.join(dados, 'operacao');
  seguroNoDisco(projeto, 'diretorio');
  seguroNoDisco(dados, 'diretorio');
  if (!fs.existsSync(dados)) falhar('DADOS_AUSENTES');
  if (!fs.existsSync(operacao)) fs.mkdirSync(operacao);
  seguroNoDisco(operacao, 'diretorio');
  const trava = path.join(operacao, '.atualizacao.lock');
  let identidade;
  try { fs.mkdirSync(trava); identidade = fs.lstatSync(trava); }
  catch (erro) { if (erro.code === 'EEXIST') return { status: 'bloqueado', motivo: 'ATUALIZACAO_OCUPADA' }; throw erro; }
  let refTemporaria;
  let resultado;
  let mergeTentado = false;
  let mergeConfirmado = false;
  const conferirTrava = () => {
    const st = fs.lstatSync(trava);
    if (st.dev !== identidade.dev || st.ino !== identidade.ino || !st.isDirectory()) falhar('TRAVA_MUDOU');
  };
  try {
    conferirTrava();
    estadoOperacao(dados);
    if (!fs.existsSync(path.join(projeto, '.git'))) falhar('RAIZ_GIT_INVALIDA');
    seguroNoDisco(path.join(projeto, '.git'));
    if (await git(projeto, 'rev-parse', '--show-toplevel') !== projeto) falhar('RAIZ_GIT_INVALIDA');
    if (!ORIGENS_PERMITIDAS.has(await git(projeto, 'remote', 'get-url', 'origin'))) falhar('ORIGEM_INVALIDA');
    try {
      if (await git(projeto, 'config', '--local', '--get-regexp', '^filter\\.')) falhar('FILTRO_LOCAL_ATIVO');
    } catch (erro) { if (erro.code !== 1) throw erro; }
    const inicio = await git(projeto, 'rev-parse', 'HEAD');
    const origem = await git(projeto, 'remote', 'get-url', 'origin');
    const branch = await git(projeto, 'symbolic-ref', '--quiet', '--short', 'HEAD');
    const statusInicio = await git(projeto, 'status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all');
    const sujos = caminhosAlterados(statusInicio).map(l => l.slice(3));
    const release = consultarRelease ? await consultarRelease() : await releaseEstavel(fetchImpl);
    if (!TAG.test(release?.tag) || !SHA.test(release?.tagSha)) falhar('TAG_INVALIDA');
    const sufixo = crypto.randomUUID().replaceAll('-', '');
    refTemporaria = `refs/codex-atualizacao/${sufixo}`;
    if (obterTag) await obterTag({ raiz: projeto, tag: release.tag, ref: refTemporaria });
    else await git(projeto, 'fetch', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules', ORIGEM, `+refs/tags/${release.tag}:${refTemporaria}`);
    if (await git(projeto, 'rev-parse', refTemporaria) !== release.tagSha) falhar('TAG_MUDOU');
    const destino = await git(projeto, 'rev-parse', `${refTemporaria}^{commit}`);
    if (!SHA.test(destino)) falhar('COMMIT_INVALIDO');
    if (destino === inicio) {
      if (sujos.some(n => !proteger(n))) falhar('CODIGO_LOCAL_MODIFICADO');
      resultado = { status: 'sem_atualizacao', tag: release.tag, commit: destino }; return resultado;
    }
    try { await git(projeto, 'merge-base', '--is-ancestor', inicio, destino); }
    catch { falhar('HISTORICO_DIVERGENTE'); }
    const mudancas = caminhosAlterados(await git(projeto, 'diff', '--name-only', '-z', '--no-renames', inicio, destino));
    await verificarDestino(projeto, destino, mudancas);
    if (sujos.some(n => !proteger(n))) falhar('CODIGO_LOCAL_MODIFICADO');
    if (await git(projeto, 'rev-parse', 'HEAD') !== inicio || await git(projeto, 'remote', 'get-url', 'origin') !== origem ||
        await git(projeto, 'symbolic-ref', '--quiet', '--short', 'HEAD') !== branch ||
        await git(projeto, 'status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all') !== statusInicio) falhar('CHECKOUT_MUDOU');
    conferirTrava();
    estadoOperacao(dados);
    // merge --ff-only faz a atualização do índice e da árvore. O guard da operação
    // impede novas entradas enquanto a atualização e o registro são escritos.
    mergeTentado = true;
    if (aplicarMerge) await aplicarMerge({ raiz: projeto, destino });
    else await git(projeto, 'merge', '--ff-only', '--no-stat', destino);
    if (await git(projeto, 'rev-parse', 'HEAD') !== destino) falhar('ATUALIZACAO_APLICACAO_INCERTA');
    mergeConfirmado = true;
    resultado = { status: 'atualizado', tag: release.tag, commit: destino };
    return resultado;
  } catch (erro) {
    resultado = { status: 'bloqueado', motivo: mergeTentado && !mergeConfirmado ? 'ATUALIZACAO_APLICACAO_INCERTA' : (erro.codigo || 'ATUALIZACAO_FALHOU') };
    return resultado;
  } finally {
    if (refTemporaria) { try { await git(projeto, 'update-ref', '-d', refTemporaria); } catch { /* referência temporária sem efeito na árvore */ } }
    if (mergeTentado && !mergeConfirmado) resultado.trava = 'revisao_necessaria';
    let registroConfirmado = false;
    try { gravarResultado(dados, resultado); registroConfirmado = true; }
    catch { resultado.registro = 'falhou'; }
    if ((mergeTentado && !mergeConfirmado) || !registroConfirmado) {
      resultado.trava = 'revisao_necessaria';
    } else {
      try {
        const atual = fs.lstatSync(trava);
        if (atual.dev === identidade.dev && atual.ino === identidade.ino) fs.rmdirSync(trava);
        else resultado.trava = 'revisao_necessaria';
      } catch { resultado.trava = 'revisao_necessaria'; }
    }
  }
}
