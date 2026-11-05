import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { lerJsonSeguro, gravarJsonAtomico } from './persistencia.js';

const CONTRATO = 1;
const agora = () => new Date().toISOString();
const falha = (codigo, detalhe = '') => { throw new Error(`${codigo}${detalhe ? `: ${detalhe}` : ''}`); };
const hash = valor => crypto.createHash('sha256').update(Buffer.isBuffer(valor) || typeof valor === 'string' ? valor : JSON.stringify(valor)).digest('hex');
const string = (valor, nome) => {
  if (typeof valor !== 'string' || !valor.trim()) falha('CAMPO_OBRIGATORIO', nome);
  return valor.trim();
};
const idForte = (valor, nome) => {
  const id = string(valor, nome);
  if (['__proto__', 'constructor', 'prototype'].includes(id)) falha('IDENTIDADE_INVALIDA', id);
  return id;
};
const caminhos = dirDados => {
  const dados = path.resolve(string(dirDados, 'dirDados'));
  if (!fs.existsSync(dados)) falha('DADOS_AUSENTES', dados);
  if (fs.realpathSync(dados) !== dados) falha('CAMINHO_INSEGURO', 'dirDados contém link simbólico');
  return {
    dados,
    pasta: path.join(dados, 'operacao'),
    lock: path.join(dados, 'operacao', '.escrita.lock'),
    recuperacao: path.join(dados, 'operacao', '.recuperacao.lock'),
    backupsRecuperacao: path.join(dados, 'operacao', 'backups-recuperacao'),
    estado: path.join(dados, 'operacao', 'estado.json'),
    controle: path.join(dados, 'controle-operacao.json'),
    tentativas: path.join(dados, 'tentativas-envio.json'),
    entregas: path.join(dados, 'operacao', 'entregas'),
  };
};

function estadoInicial() {
  return { contrato: CONTRATO, runId: null, geracao: 0, dono: null, concessao: null, status: 'encerrada', iniciadoEm: null,
    ultimoProgresso: null, reservas: {}, identidades: {}, aliases: {}, suspeitas: [], entregas: {}, tarefas: {}, prontas: {}, concessoes: {}, estoqueAlvo: 2 };
}

function normalizarEstado(estado) {
  if (estado.contrato !== CONTRATO || !['ativa', 'encerrada'].includes(estado.status)) falha('CONTRATO_INCOMPATIVEL');
  return estado;
}

function lerEstado(p) {
  if (!fs.existsSync(p.estado)) {
    if (fs.existsSync(p.controle) || fs.existsSync(p.tentativas)) falha('ESTADO_OPERACAO_AUSENTE', 'registro durável existe; recuperação explícita necessária');
    return estadoInicial();
  }
  return normalizarEstado(lerJsonSeguro(p.estado, estadoInicial()));
}

function tokenValido(estado, token) {
  if (estado.status !== 'ativa' || !token || token.runId !== estado.runId || token.geracao !== estado.geracao) return null;
  if (token.dono === estado.dono && token.concessao === estado.concessao) return 'principal';
  const concessao = estado.concessoes?.[token.concessao];
  if (concessao?.status === 'ativa' && concessao.runId === estado.runId && concessao.geracao === estado.geracao &&
      concessao.donoFilho === token.dono && concessao.etapa === token.etapa && concessao.janela === token.janela &&
      JSON.stringify(concessao.arquivos) === JSON.stringify(token.arquivos)) return 'filho';
  return null;
}

function tokenDoAmbiente() {
  if (!process.env.VAGAS_OPERACAO_TOKEN) return null;
  try { return JSON.parse(process.env.VAGAS_OPERACAO_TOKEN); }
  catch { falha('TOKEN_INVALIDO', 'VAGAS_OPERACAO_TOKEN não é JSON'); }
}

function verificarGeracao(p, estado) {
  if (estado.status !== 'ativa') return;
  const controle = lerJsonSeguro(p.controle);
  if (controle.contrato !== CONTRATO || controle.geracao !== estado.geracao) falha('GERACAO_DIVERGENTE', 'controle durável e estado da operação não coincidem');
}

function verificarToken(p, estado, token = tokenDoAmbiente()) {
  verificarGeracao(p, estado);
  const papel = tokenValido(estado, token);
  if (!papel) falha('POSSE_NEGADA', 'token ausente, revogado ou de outra geração');
  return papel;
}

function conferirArquivoPermitido(token, arquivo, dados) {
  if (!arquivo) return;
  const absoluto = path.resolve(arquivo);
  const projeto = path.resolve(dados, '..', '..');
  const raiz = projeto + path.sep;
  if (!absoluto.startsWith(raiz)) falha('CAMINHO_FORA_DO_PROJETO', absoluto);
  if (Array.isArray(token?.arquivos) && token.arquivos.length && !token.arquivos.some(p => absoluto === path.resolve(p) || absoluto.startsWith(path.resolve(p) + path.sep))) {
    falha('ARQUIVO_NAO_CONCEDIDO', absoluto);
  }
}

function validarArquivoConcedido(arquivo, dados) {
  if (typeof arquivo !== 'string' || !path.isAbsolute(arquivo)) falha('ARQUIVO_CONCEDIDO_INVALIDO', 'caminho absoluto obrigatório');
  const absoluto = path.resolve(arquivo);
  conferirArquivoPermitido(null, absoluto, dados);
  const raiz = path.parse(absoluto).root;
  let atual = raiz;
  for (const parte of path.relative(raiz, absoluto).split(path.sep).filter(Boolean)) {
    atual = path.join(atual, parte);
    let info;
    try { info = fs.lstatSync(atual); }
    catch (erro) { if (erro.code === 'ENOENT') break; throw erro; }
    if (info.isSymbolicLink()) falha('CAMINHO_INSEGURO', atual);
    if (atual === absoluto && (!info.isFile() || info.nlink !== 1)) falha('ARQUIVO_CONCEDIDO_INVALIDO', atual);
    if (atual !== absoluto && !info.isDirectory()) falha('CAMINHO_INSEGURO', atual);
  }
  return absoluto;
}

function hashArtefatoSeguro(caminho, dados) {
  conferirArquivoPermitido(null, caminho, dados);
  const absoluto = path.resolve(caminho);
  let fd;
  try {
    const real = fs.realpathSync(absoluto);
    if (real !== absoluto) falha('ARTEFATO_INSEGURO', 'link simbólico no caminho');
    const info = fs.lstatSync(absoluto);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) falha('ARTEFATO_INSEGURO', 'arquivo não regular ou com hardlink');
    fd = fs.openSync(absoluto, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const aberto = fs.fstatSync(fd);
    if (!aberto.isFile() || aberto.nlink !== 1 || aberto.ino !== info.ino || aberto.dev !== info.dev) falha('ARTEFATO_INSEGURO', 'arquivo trocado durante leitura');
    if (fs.realpathSync(absoluto) !== absoluto) falha('ARTEFATO_INSEGURO', 'caminho mudou durante leitura');
    return hash(fs.readFileSync(fd));
  } catch (erro) {
    if (erro.code === 'ENOENT') falha('ARTEFATO_INDISPONIVEL', absoluto);
    throw erro;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function pidVivo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (erro) { return erro.code === 'EPERM'; }
}

const fingerprint = info => `${info.dev}:${info.ino}`;

function diagnosticarGuard(p) {
  let pasta;
  try { pasta = fs.lstatSync(p.pasta); }
  catch (erro) { if (erro.code === 'ENOENT') return { guard: null }; throw erro; }
  if (!pasta.isDirectory() || pasta.isSymbolicLink() || fs.realpathSync(p.pasta) !== p.pasta) falha('CAMINHO_INSEGURO', p.pasta);
  let info;
  try { info = fs.lstatSync(p.recuperacao); }
  catch (erro) { if (erro.code === 'ENOENT') return { guard: null }; throw erro; }
  if (!info.isDirectory() || info.isSymbolicLink()) falha('CAMINHO_INSEGURO', p.recuperacao);
  let dono = null, erroDono = null;
  try { dono = lerJsonSeguro(path.join(p.recuperacao, 'dono.json')); }
  catch (erro) { erroDono = erro.message; }
  const vivo = pidVivo(dono?.pid);
  return { guard: { caminho: p.recuperacao, fingerprint: fingerprint(info), pid: dono?.pid || null, nonce: dono?.nonce || null,
    donoVivo: vivo, orfa: !vivo, erroDono },
    procedimento: 'Manutenção offline: confirmar parada global, registrar referência e usar manutencao_guard com fingerprint; sem takeover automático.' };
}

function manutencaoGuard(p, args) {
  if (args.paradaGlobalConfirmada !== true) falha('PARADA_GLOBAL_NAO_CONFIRMADA');
  const confirmacaoRef = string(args.confirmacaoRef, 'confirmacaoRef');
  const diagnostico = diagnosticarGuard(p);
  if (!diagnostico.guard) falha('RECUPERACAO_AUSENTE');
  if (!diagnostico.guard.orfa) falha('RECUPERACAO_OCUPADA', 'dono do guard ainda está vivo');
  if (string(args.fingerprint, 'fingerprint') !== diagnostico.guard.fingerprint) falha('FINGERPRINT_DIVERGENTE');
  try {
    const donoLock = lerJsonSeguro(path.join(p.lock, 'dono.json'));
    if (pidVivo(donoLock.pid)) falha('ESCRITA_OCUPADA', `processo ${donoLock.pid} ainda está vivo`);
  } catch (erro) {
    if (!/ARQUIVO_AUSENTE/.test(erro.message)) throw erro;
  }
  try { fs.mkdirSync(p.backupsRecuperacao); }
  catch (erro) { if (erro.code !== 'EEXIST') throw erro; }
  const infoBackups = fs.lstatSync(p.backupsRecuperacao);
  if (!infoBackups.isDirectory() || infoBackups.isSymbolicLink()) falha('CAMINHO_INSEGURO', p.backupsRecuperacao);
  const nome = `guard-${new Date().toISOString().replaceAll(':', '-')}-${crypto.randomUUID()}`;
  const backup = path.join(p.backupsRecuperacao, `${nome}-backup`);
  fs.cpSync(p.recuperacao, backup, { recursive: true, force: false, errorOnExist: true });
  gravarJsonAtomico(path.join(backup, 'manutencao.json'), { contrato: CONTRATO, fingerprint: diagnostico.guard.fingerprint, confirmacaoRef, em: agora() });
  const fdBackup = fs.openSync(p.backupsRecuperacao, 'r');
  try { fs.fsyncSync(fdBackup); } finally { fs.closeSync(fdBackup); }
  const atual = diagnosticarGuard(p).guard;
  if (!atual?.orfa || atual.fingerprint !== diagnostico.guard.fingerprint || atual.nonce !== diagnostico.guard.nonce) falha('GUARD_MUDOU_DURANTE_MANUTENCAO');
  const geracaoRevogada = proximaGeracao(p);
  const movido = path.join(p.backupsRecuperacao, `${nome}-movido`);
  fs.renameSync(p.recuperacao, movido);
  const infoMovido = fs.lstatSync(movido);
  if (fingerprint(infoMovido) !== diagnostico.guard.fingerprint) falha('GUARD_MUDOU_DURANTE_MANUTENCAO');
  for (const diretorio of [p.backupsRecuperacao, p.pasta]) {
    const fd = fs.openSync(diretorio, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  return { guardMovido: movido, backup, geracaoRevogada, precondicao: 'Parada global confirmada fora do protocolo automático' };
}

function comLock(p, fn, recuperar = false) {
  try { fs.mkdirSync(p.pasta); }
  catch (erro) { if (erro.code !== 'EEXIST') throw erro; }
  const infoPasta = fs.lstatSync(p.pasta);
  if (infoPasta.isSymbolicLink() || !infoPasta.isDirectory()) falha('CAMINHO_INSEGURO', p.pasta);
  let meuLock = null;
  let minhaRecuperacao = null;
  let nonceLock = null;
  let nonceRecuperacao = null;
  const retirarSeMeu = (caminho, identidade, nonce) => {
    if (!identidade) return;
    let atual;
    try { atual = fs.lstatSync(caminho); }
    catch (erro) { if (erro.code === 'ENOENT') return; throw erro; }
    if (atual.dev !== identidade.dev || atual.ino !== identidade.ino || !atual.isDirectory()) return;
    try {
      const dono = lerJsonSeguro(path.join(caminho, 'dono.json'));
      if (dono.nonce !== nonce) return;
    } catch (erro) { if (!/ARQUIVO_AUSENTE/.test(erro.message)) return; }
    fs.rmSync(caminho, { recursive: true });
  };
  try {
    if (recuperar) {
      try { fs.mkdirSync(p.recuperacao); }
      catch (erro) {
        if (erro.code === 'EEXIST') {
          const diagnostico = diagnosticarGuard(p);
          falha(diagnostico.guard?.orfa ? 'RECUPERACAO_ORFA' : 'RECUPERACAO_OCUPADA', diagnostico.guard?.fingerprint);
        }
        throw erro;
      }
      minhaRecuperacao = fs.lstatSync(p.recuperacao);
      nonceRecuperacao = crypto.randomUUID();
      gravarJsonAtomico(path.join(p.recuperacao, 'dono.json'), { pid: process.pid, nonce: nonceRecuperacao, desde: agora() });
    } else if (fs.existsSync(p.recuperacao)) {
      const diagnostico = diagnosticarGuard(p);
      falha(diagnostico.guard?.orfa ? 'RECUPERACAO_ORFA' : 'RECUPERACAO_OCUPADA', diagnostico.guard?.fingerprint);
    }
    try { fs.mkdirSync(p.lock); }
    catch (erro) {
      if (erro.code !== 'EEXIST') throw erro;
      if (!recuperar) falha('ESCRITA_OCUPADA', 'lock existente; recuperação requer parada confirmada');
      const antigo = fs.lstatSync(p.lock);
      if (!antigo.isDirectory() || antigo.isSymbolicLink()) falha('CAMINHO_INSEGURO', p.lock);
      let donoLock, donoAusente = false;
      try { donoLock = lerJsonSeguro(path.join(p.lock, 'dono.json')); }
      catch (erroDono) {
        if (!erroDono.message.startsWith('ARQUIVO_AUSENTE:')) throw erroDono;
        if (fs.readdirSync(p.lock).length) falha('LOCK_INCOMPLETO', 'dono ausente em lock não vazio');
        donoAusente = true;
      }
      if (pidVivo(donoLock?.pid)) falha('ESCRITA_OCUPADA', `processo ${donoLock.pid} ainda está vivo`);
      const atual = fs.lstatSync(p.lock);
      if (atual.dev !== antigo.dev || atual.ino !== antigo.ino) falha('LOCK_TROCADO_DURANTE_RECUPERACAO');
      const quarentena = `${p.lock}.revogado-${crypto.randomUUID()}`;
      fs.renameSync(p.lock, quarentena);
      const movido = fs.lstatSync(quarentena);
      if (movido.dev !== antigo.dev || movido.ino !== antigo.ino) falha('LOCK_TROCADO_DURANTE_RECUPERACAO');
      if (donoAusente && fs.readdirSync(quarentena).length) falha('LOCK_INCOMPLETO', 'lock mudou durante recuperação');
      if (!donoAusente) fs.rmSync(quarentena, { recursive: true });
      try { fs.mkdirSync(p.lock); }
      catch { falha('ESCRITA_OCUPADA', 'outro processo adquiriu o lock'); }
    }
    meuLock = fs.lstatSync(p.lock);
    nonceLock = crypto.randomUUID();
    if (fs.existsSync(p.recuperacao) && !recuperar) falha('RECUPERACAO_OCUPADA');
    gravarJsonAtomico(path.join(p.lock, 'dono.json'), { pid: process.pid, nonce: nonceLock, desde: agora() });
    if (fs.existsSync(p.recuperacao) && !recuperar) falha('RECUPERACAO_OCUPADA');
    const resultado = fn();
    if (resultado && typeof resultado.then === 'function') falha('CALLBACK_ASSINCRONO_NAO_SUPORTADO', 'escrita central exige callback síncrono');
    return resultado;
  } finally {
    retirarSeMeu(p.lock, meuLock, nonceLock);
    retirarSeMeu(p.recuperacao, minhaRecuperacao, nonceRecuperacao);
  }
}

function gravarEstado(p, estado) {
  estado.ultimoProgresso = agora();
  gravarJsonAtomico(p.estado, estado);
}

function gerarToken(estado) {
  return { tipo: 'principal', runId: estado.runId, geracao: estado.geracao, dono: estado.dono, concessao: estado.concessao, arquivos: [] };
}

function proximaGeracao(p) {
  if (!fs.existsSync(p.controle) && fs.existsSync(p.estado) && lerJsonSeguro(p.estado).geracao > 0) falha('CONTROLE_AUSENTE', 'geração durável perdida');
  const controle = lerJsonSeguro(p.controle, { contrato: CONTRATO, geracao: 0 });
  if (controle.contrato !== CONTRATO || !Number.isSafeInteger(controle.geracao) || controle.geracao < 0) falha('CONTROLE_INVALIDO');
  const geracao = controle.geracao + 1;
  gravarJsonAtomico(p.controle, { contrato: CONTRATO, geracao });
  return geracao;
}

function identidadeForte(estado, entrada) {
  if (!entrada || typeof entrada !== 'object') falha('IDENTIDADE_FORTE_OBRIGATORIA');
  const canonico = entrada.canonico ? idForte(entrada.canonico, 'identidade.canonico') : null;
  const aliases = [...new Set((entrada.aliases || []).map(x => idForte(x, 'alias')))];
  if (!canonico && !aliases.length) falha('IDENTIDADE_FORTE_OBRIGATORIA', 'título e empresa são apenas indícios');
  const existentes = new Set([canonico, ...aliases].map(x => estado.aliases[x] || (estado.identidades[x] ? x : null)).filter(Boolean));
  if (existentes.size > 1) falha('IDENTIDADE_CONFLITANTE', [...existentes].join(', '));
  const chave = [...existentes][0] || canonico || aliases[0];
  if (canonico && chave !== canonico && estado.identidades[chave]?.canonico && estado.identidades[chave].canonico !== canonico) {
    falha('IDENTIDADE_CONFLITANTE', 'duas requisições canônicas para o mesmo alias');
  }
  estado.identidades[chave] ||= { canonico: canonico || chave, aliases: [], indícios: [] };
  for (const alias of [canonico, ...aliases].filter(Boolean)) {
    if (estado.aliases[alias] && estado.aliases[alias] !== chave) falha('IDENTIDADE_CONFLITANTE', alias);
    estado.aliases[alias] = chave;
  }
  estado.identidades[chave].aliases = [...new Set([...estado.identidades[chave].aliases, ...aliases])];
  if (entrada.indicio) {
    estado.suspeitas.push({ chave, indicio: entrada.indicio, em: agora() });
  }
  return chave;
}

function chaveExistente(estado, entrada) {
  if (typeof entrada === 'string') return estado.aliases[entrada] || (estado.identidades[entrada] ? entrada : null);
  if (entrada && typeof entrada === 'object') {
    for (const id of [entrada.canonico, ...(entrada.aliases || [])]) {
      if (id && (estado.aliases[id] || estado.identidades[id])) return estado.aliases[id] || id;
    }
  }
  return null;
}

function validarPacote(estado, chave, versoes, dados) {
  const pronta = estado.prontas[chave];
  if (!pronta) falha('NAO_PRONTA', chave);
  const entrega = estado.entregas[pronta.entregaId];
  if (!entrega || entrega.estado !== 'revisada' || entrega.hash !== pronta.hash || !entrega.revisao || entrega.revisao.parecer !== 'aprovado') falha('REVISAO_INVALIDA');
  if (versoes && hash(versoes) !== hash(entrega.versoes)) falha('FONTES_MUDARAM');
  if (pronta.hashVersoes !== hash(entrega.versoes)) falha('FONTES_MUDARAM');
  conferirHashesFontes(entrega, dados, estado);
  conferirHashesArtefatos(entrega, dados);
  return pronta;
}

const PAPEIS_MINIMOS = ['anuncio', 'base', 'regras'];

function normalizarFontesEsperadas(mapa, dados) {
  if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) falha('MAPA_FONTES_OBRIGATORIO');
  for (const papel of PAPEIS_MINIMOS) if (!Object.hasOwn(mapa, papel)) falha('PAPEL_FONTE_AUSENTE', papel);
  const fontes = [];
  const caminhos = new Set();
  for (const [papel, entrada] of Object.entries(mapa)) {
    idForte(papel, 'fonte.papel');
    const lista = Array.isArray(entrada) ? entrada : [entrada];
    if (!lista.length) falha('PAPEL_FONTE_VAZIO', papel);
    for (const item of lista) {
      const caminho = validarArquivoConcedido(item, dados);
      if (caminhos.has(caminho)) falha('FONTE_REPETIDA', caminho);
      caminhos.add(caminho);
      fontes.push({ papel, caminho, hash: hashArtefatoSeguro(caminho, dados) });
    }
  }
  return fontes.sort((a, b) => `${a.papel}|${a.caminho}`.localeCompare(`${b.papel}|${b.caminho}`));
}

function normalizarFontesLocais(fontes, dados, esperadas) {
  if (!Array.isArray(esperadas) || !esperadas.length) falha('MAPA_FONTES_OBRIGATORIO');
  if (!Array.isArray(fontes) || fontes.length !== esperadas.length) falha('FONTES_LOCAIS_INCOMPLETAS');
  const recebidas = fontes.map(fonte => ({ papel: idForte(fonte?.papel, 'fonte.papel'), caminho: validarArquivoConcedido(fonte?.caminho, dados), hash: string(fonte?.hash, 'fonte.hash') }))
    .sort((a, b) => `${a.papel}|${a.caminho}`.localeCompare(`${b.papel}|${b.caminho}`));
  for (let i = 0; i < esperadas.length; i++) {
    if (recebidas[i].papel !== esperadas[i].papel || recebidas[i].caminho !== esperadas[i].caminho) falha('FONTE_PAPEL_OU_CAMINHO_DIVERGENTE');
    const atual = hashArtefatoSeguro(recebidas[i].caminho, dados);
    if (recebidas[i].hash !== atual) falha('HASH_FONTE_DIVERGENTE', recebidas[i].caminho);
    if (esperadas[i].hash !== atual) falha('FONTE_MUDOU', recebidas[i].caminho);
  }
  return recebidas;
}

function conferirHashesFontes(entrega, dados, estado) {
  const esperadas = estado.tarefas[entrega.chave]?.fontesEsperadas;
  if (!Array.isArray(esperadas) || !esperadas.length || !Array.isArray(entrega.fontesLocais) ||
      entrega.fontesLocais.length !== esperadas.length || entrega.fontesEsperadasHash !== hash(esperadas) ||
      hash(entrega.fontesLocais) !== hash(esperadas)) falha('MAPA_FONTES_DIVERGENTE');
  for (const fonte of entrega.fontesLocais) {
    const atual = hashArtefatoSeguro(fonte.caminho, dados);
    if (atual !== fonte.hash) falha('FONTE_MUDOU', fonte.caminho);
  }
}

function conferirHashesArtefatos(entrega, dados) {
  for (const artefato of entrega.artefatos || []) {
    const atual = hashArtefatoSeguro(artefato.caminho, dados);
    if (atual !== artefato.hash) falha('ARTEFATO_MUDOU', artefato.caminho);
  }
}

function lerTentativas(p, bootstrap = false) {
  const inicial = { contrato: CONTRATO, tentativas: {} };
  if (!fs.existsSync(p.tentativas) && !bootstrap) falha('TENTATIVAS_AUSENTES', 'bootstrap novo explícito obrigatório');
  const registro = lerJsonSeguro(p.tentativas, inicial);
  if (registro.contrato !== CONTRATO || !registro.tentativas || typeof registro.tentativas !== 'object') falha('TENTATIVAS_INVALIDAS');
  return registro;
}

function projetarLedger(estado, registro) {
  const projetado = structuredClone(estado);
  const efeitos = new Map();
  for (const tentativa of Object.values(registro.tentativas)) {
    if (!tentativa || !tentativa.chave) falha('TENTATIVAS_INVALIDAS');
    const ids = new Set([idForte(tentativa.chave, 'tentativa.chave'), ...(tentativa.aliases || []).map(alias => idForte(alias, 'tentativa.alias'))]);
    const chaves = new Set([tentativa.chave]);
    for (const chave of [...Object.keys(projetado.tarefas), ...Object.keys(projetado.prontas)]) {
      const identidade = projetado.identidades[chave];
      if (ids.has(chave) || ids.has(identidade?.canonico) || (identidade?.aliases || []).some(alias => ids.has(alias))) chaves.add(chave);
    }
    const efeito = tentativa.desfecho === 'confirmado' ? 'enviada' : 'envio_incerto';
    for (const chave of chaves) {
      if (efeitos.get(chave) !== 'envio_incerto') efeitos.set(chave, efeito);
    }
  }
  let alterado = false;
  for (const [chave, efeito] of efeitos) {
    projetado.tarefas[chave] ||= { revisao: 0 };
    if (projetado.tarefas[chave].estado !== efeito) { projetado.tarefas[chave].estado = efeito; alterado = true; }
    if (projetado.prontas[chave]) { delete projetado.prontas[chave]; alterado = true; }
  }
  return { estado: projetado, alterado };
}

function preflightAtestado(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) falha('PREFLIGHT_OBRIGATORIO', 'esperado atestado estruturado');
  const campos = ['origemStatus', 'statusAtual', 'statusRef', 'anuncioRef', 'autorizacaoRef', 'formularioRef', 'validacaoRef'];
  return Object.fromEntries(campos.map(campo => [campo, string(valor[campo], `preflight.${campo}`)]));
}

function planoLocal(p, estado, registroValido = true) {
  const ativa = estado.status === 'ativa';
  const prontas = Object.entries(estado.prontas).map(([chave, item]) => {
    try { validarPacote(estado, chave, null, p.dados); return { chave, entregaId: item.entregaId, exigePreflightAtual: true, liberadoUI: false }; }
    catch (erro) { return { chave, entregaId: item.entregaId, invalida: erro.message, liberadoUI: false }; }
  });
  const emFila = ativa && registroValido ? Object.values(estado.reservas).filter(r => r.runId === estado.runId && !['terminal', 'enviada', 'envio_incerto', 'aguardando_pessoa', 'bloqueada_tecnica'].includes(estado.tarefas[r.chave]?.estado)) : [];
  const estoqueValido = prontas.filter(pacote => !pacote.invalida).length;
  return {
    estoque: { alvo: estado.estoqueAlvo, prontas: estoqueValido, podePreparar: ativa && registroValido && estoqueValido < estado.estoqueAlvo },
    papeis: {
      busca: emFila.filter(r => r.etapa === 'busca').map(r => ({ chave: r.chave, taskId: r.taskId })),
      preparacao: ativa && registroValido && estoqueValido < estado.estoqueAlvo ? emFila.filter(r => r.etapa === 'preparar' && estado.tarefas[r.chave]?.estado === 'reservada').map(r => ({ chave: r.chave, taskId: r.taskId })) : [],
      revisao: ativa && registroValido ? Object.entries(estado.tarefas).filter(([, t]) => t.estado === 'em_revisao').map(([chave, t]) => ({ chave, entregaId: t.entregaId })) : [],
      aplicador: ativa && registroValido ? prontas.filter(pacote => !pacote.invalida) : [],
    },
    pacotesInvalidos: prontas.filter(pacote => pacote.invalida),
    bloqueioLedger: registroValido ? null : 'TENTATIVAS_AUSENTES_OU_INVALIDAS',
    bloqueios: Object.entries(estado.tarefas).filter(([, t]) => ['aguardando_pessoa', 'bloqueada_tecnica', 'terminal', 'envio_incerto'].includes(t.estado)).map(([chave, t]) => ({ chave, estado: t.estado, motivo: t.bloqueio?.motivo || null, referencia: t.bloqueio?.referencia || null })),
  };
}

function contarProntasValidas(estado, dados, exceto = null) {
  return Object.keys(estado.prontas).filter(chave => {
    if (chave === exceto) return false;
    try { validarPacote(estado, chave, null, dados); return true; }
    catch { return false; }
  }).length;
}

/** Envolve uma escrita legada em posse exclusiva local. O callback recebe o token vigente. */
export function comEscritaCentral(dirDados, fn, arquivos = []) {
  const p = caminhos(dirDados);
  return comLock(p, () => {
    const estado = lerEstado(p);
    const token = tokenDoAmbiente();
    if (estado.status === 'ativa') {
      const papel = verificarToken(p, estado, token);
      if (!Array.isArray(arquivos)) falha('ARQUIVOS_INVALIDOS');
      if (papel === 'filho' && !arquivos.length) falha('ARQUIVO_CONCEDIDO_OBRIGATORIO');
      for (const arquivo of arquivos) {
        const absoluto = validarArquivoConcedido(arquivo, p.dados);
        if (papel === 'filho' && !token.arquivos.includes(absoluto)) falha('ARQUIVO_NAO_CONCEDIDO', absoluto);
      }
      return fn(token);
    }
    if (token) falha('POSSE_NEGADA', 'token antigo não readquire posse');
    const temporaria = { ...estado, status: 'ativa', runId: crypto.randomUUID(), geracao: proximaGeracao(p), dono: `legado:${process.pid}`, concessao: crypto.randomUUID() };
    gravarEstado(p, temporaria);
    try { return fn(gerarToken(temporaria)); }
    finally { temporaria.status = 'encerrada'; temporaria.concessao = null; gravarEstado(p, temporaria); }
  });
}

export function consultarOperacao(dirDados) {
  const p = caminhos(dirDados);
  let estado = lerEstado(p);
  verificarGeracao(p, estado);
  let tentativas;
  let registroValido = true;
  try {
    tentativas = lerTentativas(p);
    estado = projetarLedger(estado, tentativas).estado;
  } catch (erro) { tentativas = { bloqueio: erro.message }; registroValido = false; }
  return { estado, tentativas, plano: planoLocal(p, estado, registroValido) };
}

/** Não autoriza UI. Bloqueia toda tentativa anterior sem confirmação ou desfecho explícito. */
export function validarEnvio(dirDados, identidade) {
  const p = caminhos(dirDados);
  const estado = lerEstado(p);
  verificarGeracao(p, estado);
  const chave = chaveExistente(estado, identidade) || (typeof identidade === 'string' ? identidade : null);
  if (!chave) falha('IDENTIDADE_NAO_RESOLVIDA');
  const registro = lerTentativas(p);
  const tentativas = Object.values(registro.tentativas).filter(t => t.chave === chave || (t.aliases || []).includes(chave));
  const bloqueio = tentativas[0];
  if (bloqueio) falha(bloqueio.desfecho === 'confirmado' ? 'JA_ENVIADA' : 'ENVIO_INCERTO', bloqueio.tentativaId);
  return { permitido: true, chave };
}

export function operar(dirDados, acao, args = {}) {
  const p = caminhos(dirDados);
  if (acao === 'diagnostico') return diagnosticarGuard(p);
  if (acao === 'manutencao_guard') return manutencaoGuard(p, args);
  if (acao === 'status') return consultarOperacao(dirDados);
  if (acao === 'planejar') return consultarOperacao(dirDados).plano;
  if (acao === 'validar') return validarEnvio(dirDados, args.identidade);
  const recuperar = acao === 'retomar' && args.paradaConfirmada === true;
  return comLock(p, () => {
    let estado = lerEstado(p);
    if (acao === 'iniciar' || acao === 'retomar') {
      if (args.token || tokenDoAmbiente()) falha('TOKEN_INESPERADO', 'início e retomada exigem controlador externo sem token de filho');
      if (acao === 'iniciar' && estado.status === 'ativa') falha('OPERACAO_ATIVA', estado.runId);
      if (acao === 'retomar' && (estado.status !== 'ativa' || args.paradaConfirmada !== true)) falha('PARADA_NAO_CONFIRMADA');
      if (acao === 'retomar' && string(args.runId, 'runId') !== estado.runId) falha('RUN_DIVERGENTE');
      if (fs.existsSync(p.tentativas)) estado = projetarLedger(estado, lerTentativas(p)).estado;
      estado.runId = crypto.randomUUID();
      estado.geracao = proximaGeracao(p);
      estado.dono = string(args.dono, 'dono');
      estado.concessao = crypto.randomUUID();
      estado.status = 'ativa';
      estado.iniciadoEm = agora();
      if (args.estoqueAlvo !== undefined) {
        if (!Number.isInteger(args.estoqueAlvo) || args.estoqueAlvo < 0) falha('ESTOQUE_INVALIDO');
        estado.estoqueAlvo = args.estoqueAlvo;
      }
      gravarEstado(p, estado);
      if (args.bootstrapNovo === true && !fs.existsSync(p.tentativas)) gravarJsonAtomico(p.tentativas, { contrato: CONTRATO, tentativas: {} });
      return { token: gerarToken(estado), estado };
    }
    const token = args.token || tokenDoAmbiente();
    const papel = verificarToken(p, estado, token);
    if (papel !== 'principal') falha('ACAO_RESTRITA_AO_PRINCIPAL', acao);
    if (fs.existsSync(p.tentativas)) {
      const projecao = projetarLedger(estado, lerTentativas(p));
      estado = projecao.estado;
      if (projecao.alterado) gravarEstado(p, estado);
    }
    if (acao === 'conceder') {
      const donoFilho = string(args.donoFilho, 'donoFilho');
      if (donoFilho === estado.dono) falha('DONO_FILHO_INVALIDO');
      const janela = string(args.janela, 'janela');
      const etapa = string(args.etapa, 'etapa');
      if (!Array.isArray(args.arquivos) || !args.arquivos.length) falha('ARQUIVOS_CONCEDIDOS_OBRIGATORIOS');
      const arquivos = [...new Set(args.arquivos.map(arquivo => validarArquivoConcedido(arquivo, p.dados)))];
      const concessao = crypto.randomUUID();
      estado.concessoes ||= {};
      estado.concessoes[concessao] = { concessao, runId: estado.runId, geracao: estado.geracao, donoFilho, janela, etapa, arquivos, status: 'ativa', em: agora() };
      gravarEstado(p, estado);
      return { token: { tipo: 'filho', runId: estado.runId, geracao: estado.geracao, dono: donoFilho, concessao, janela, etapa, arquivos } };
    }
    if (acao === 'revogar') {
      const concessao = estado.concessoes?.[string(args.concessao, 'concessao')];
      if (!concessao) falha('CONCESSAO_AUSENTE');
      if (concessao.status === 'revogada') return { concessao, repetida: true };
      concessao.status = 'revogada'; concessao.revogadaEm = agora();
      gravarEstado(p, estado);
      return { concessao };
    }
    if (acao === 'encerrar') {
      estado.status = 'encerrada'; estado.concessao = null; gravarEstado(p, estado);
      return { encerrada: true, geracao: estado.geracao };
    }
    if (acao === 'suspeita') {
      estado.suspeitas.push({ ...args, em: agora() }); gravarEstado(p, estado);
      return { registrada: true };
    }
    if (acao === 'bloquear') {
      const chave = chaveExistente(estado, args.identidade);
      if (!chave || !estado.tarefas[chave]) falha('TAREFA_AUSENTE');
      if (!['aguardando_pessoa', 'bloqueada_tecnica', 'terminal'].includes(args.estado)) falha('BLOQUEIO_INVALIDO');
      const tarefa = estado.tarefas[chave];
      if (['enviada', 'envio_incerto', 'terminal'].includes(tarefa.estado)) falha('VAGA_BLOQUEADA');
      if (['aguardando_pessoa', 'bloqueada_tecnica'].includes(tarefa.estado)) {
        if (tarefa.estado === args.estado && tarefa.bloqueio?.referencia === args.referencia) return { chave, tarefa, repetida: true };
        falha('BLOQUEIO_EXISTENTE');
      }
      const bloqueio = { estadoAnterior: tarefa.estado, etapa: tarefa.etapa || null, motivo: string(args.motivo, 'motivo'), referencia: string(args.referencia, 'referencia'), em: agora() };
      tarefa.bloqueio = bloqueio;
      tarefa.estado = args.estado;
      delete estado.prontas[chave];
      gravarEstado(p, estado);
      return { chave, tarefa };
    }
    if (acao === 'retomar_tarefa') {
      const chave = chaveExistente(estado, args.identidade);
      const tarefa = chave && estado.tarefas[chave];
      if (!tarefa || !['aguardando_pessoa', 'bloqueada_tecnica'].includes(tarefa.estado)) falha('TAREFA_NAO_RETOMAVEL');
      const resolucaoRef = string(args.resolucaoRef, 'resolucaoRef');
      const anterior = tarefa.bloqueio?.estadoAnterior;
      if (!anterior || ['envio_incerto', 'enviada', 'terminal'].includes(anterior)) falha('TAREFA_NAO_RETOMAVEL');
      if (anterior === 'pronta') {
        const entrega = estado.entregas[tarefa.entregaId];
        if (!entrega || !args.versoes || hash(args.versoes) !== hash(entrega.versoes)) falha('FONTES_MUDARAM');
        conferirHashesFontes(entrega, p.dados, estado);
        conferirHashesArtefatos(entrega, p.dados);
        if (contarProntasValidas(estado, p.dados) >= estado.estoqueAlvo) falha('ESTOQUE_CHEIO');
        estado.prontas[chave] = { entregaId: entrega.entregaId, hash: entrega.hash, hashVersoes: hash(entrega.versoes), em: agora() };
      }
      tarefa.historicoBloqueios ||= [];
      tarefa.historicoBloqueios.push({ ...tarefa.bloqueio, resolucaoRef, resolvidoEm: agora() });
      tarefa.bloqueio = null;
      tarefa.estado = anterior;
      gravarEstado(p, estado);
      return { chave, tarefa, formularioPreenchido: false };
    }
    if (acao === 'reservar') {
      const chave = identidadeForte(estado, args.identidade);
      const etapa = string(args.etapa, 'etapa');
      const dono = string(args.dono, 'dono');
      const id = `${chave}|${etapa}`;
      if (['terminal', 'enviada', 'envio_incerto', 'aguardando_pessoa', 'bloqueada_tecnica'].includes(estado.tarefas[chave]?.estado)) falha('VAGA_BLOQUEADA');
      if (estado.reservas[id] && estado.reservas[id].runId === estado.runId && estado.reservas[id].dono !== dono) falha('JA_RESERVADA', id);
      if (!estado.reservas[id] || estado.reservas[id].runId !== estado.runId) {
        estado.reservas[id] = { chave, etapa, dono, taskId: crypto.randomUUID(), runId: estado.runId, em: agora() };
      }
      estado.tarefas[chave] ||= { estado: 'reservada', etapa, revisao: 0 };
      gravarEstado(p, estado);
      return { reserva: estado.reservas[id] };
    }
    if (acao === 'fixar_fontes') {
      const chave = chaveExistente(estado, args.identidade);
      const tarefa = chave && estado.tarefas[chave];
      if (!tarefa) falha('TAREFA_AUSENTE');
      if (['terminal', 'enviada', 'envio_incerto', 'aguardando_pessoa', 'bloqueada_tecnica'].includes(tarefa.estado)) falha('VAGA_BLOQUEADA');
      const fontesEsperadas = normalizarFontesEsperadas(args.fontesEsperadas, p.dados);
      const mudou = hash(tarefa.fontesEsperadas || []) !== hash(fontesEsperadas);
      tarefa.fontesEsperadas = fontesEsperadas;
      if (mudou && tarefa.entregaId) { tarefa.estado = 'reservada'; delete estado.prontas[chave]; }
      gravarEstado(p, estado);
      return { chave, fontesEsperadas, mudou };
    }
    if (acao === 'entregar') {
      const taskId = string(args.taskId, 'taskId');
      const revisao = args.revisao;
      if (!Number.isInteger(revisao) || revisao < 1) falha('REVISAO_INVALIDA');
      const reserva = Object.values(estado.reservas).find(r => r.taskId === taskId);
      if (!reserva) falha('TAREFA_NAO_RESERVADA');
      if (reserva.runId !== estado.runId) falha('RUN_ANTIGO');
      const chave = reserva.chave;
      if (['terminal', 'enviada', 'envio_incerto', 'aguardando_pessoa', 'bloqueada_tecnica'].includes(estado.tarefas[chave]?.estado)) falha('VAGA_BLOQUEADA');
      const entregaId = hash({ runId: estado.runId, taskId, revisao });
      const anterior = Object.values(estado.entregas).find(e => e.taskId === taskId && e.revisaoNumero === revisao - 1);
      if (revisao > 1 && (!anterior || args.substituiId !== anterior.entregaId)) falha('SUBSTITUICAO_EXPLICITA_OBRIGATORIA');
      const fontesEsperadas = estado.tarefas[chave]?.fontesEsperadas;
      const fontesLocais = normalizarFontesLocais(args.fontesLocais, p.dados, fontesEsperadas);
      const artefatos = (args.artefatos || []).map(a => {
        conferirArquivoPermitido(token, a.caminho, p.dados);
        const caminho = path.resolve(string(a.caminho, 'artefato.caminho'));
        const digest = hashArtefatoSeguro(caminho, p.dados);
        if (a.hash && a.hash !== digest) falha('HASH_DIVERGENTE', caminho);
        return { caminho, hash: digest };
      });
      let entrega = { entregaId, runId: estado.runId, taskId, chave, aliases: estado.identidades[chave]?.aliases || [], tipo: string(args.tipo, 'tipo'),
        revisaoNumero: revisao, substituiId: args.substituiId || null, autor: string(args.autor, 'autor'), versoes: args.versoes || {},
        evidencias: args.evidencias || [], fontesLocais, fontesEsperadasHash: hash(fontesEsperadas), artefatos,
        hash: hash({ chave, tipo: args.tipo, versoes: args.versoes || {}, evidencias: args.evidencias || [], fontesLocais, fontesEsperadasHash: hash(fontesEsperadas), artefatos }),
        estado: 'em_revisao', criadaEm: agora() };
      if (estado.entregas[entregaId]) {
        const existente = estado.entregas[entregaId];
        if (existente.hash !== entrega.hash || existente.autor !== entrega.autor) falha('ENTREGA_IMUTAVEL', entregaId);
        return { entrega: existente, repetida: true };
      }
      fs.mkdirSync(p.entregas, { recursive: true });
      const arquivo = path.join(p.entregas, `${entregaId}.json`);
      if (fs.existsSync(arquivo)) {
        const preservada = lerJsonSeguro(arquivo);
        if (preservada.hash !== entrega.hash || preservada.autor !== entrega.autor || preservada.taskId !== taskId) falha('ENTREGA_IMUTAVEL', entregaId);
        entrega = preservada;
      } else gravarJsonAtomico(arquivo, entrega);
      estado.entregas[entregaId] = entrega;
      estado.tarefas[chave] = { ...estado.tarefas[chave], estado: 'em_revisao', revisao, entregaId };
      delete estado.prontas[chave];
      gravarEstado(p, estado);
      return { entrega };
    }
    if (acao === 'revisar') {
      const entrega = estado.entregas[string(args.entregaId, 'entregaId')];
      if (!entrega) falha('ENTREGA_AUSENTE');
      if (estado.tarefas[entrega.chave]?.entregaId !== entrega.entregaId) falha('ENTREGA_SUPERADA');
      if (['terminal', 'enviada', 'envio_incerto', 'aguardando_pessoa', 'bloqueada_tecnica'].includes(estado.tarefas[entrega.chave]?.estado)) falha('VAGA_BLOQUEADA');
      conferirHashesFontes(entrega, p.dados, estado);
      conferirHashesArtefatos(entrega, p.dados);
      const revisor = string(args.revisor, 'revisor');
      if (entrega.autor === revisor) falha('REVISAO_NAO_INDEPENDENTE');
      if (string(args.hash, 'hash') !== entrega.hash) falha('HASH_DIVERGENTE');
      if (entrega.revisao) {
        if (entrega.revisao.revisor === revisor && entrega.revisao.parecer === args.parecer) return { entrega, repetida: true };
        falha('REVISAO_IMUTAVEL');
      }
      if (!['aprovado', 'reprovado'].includes(args.parecer)) falha('PARECER_INVALIDO');
      entrega.revisao = { revisor, parecer: args.parecer, em: agora(), hash: entrega.hash };
      entrega.estado = args.parecer === 'aprovado' ? 'revisada' : 'reprovada';
      estado.tarefas[entrega.chave].estado = entrega.estado;
      // Parecer é uma revisão do manifesto, não altera o arquivo imutável entregue pelo autor.
      gravarEstado(p, estado);
      return { entrega };
    }
    if (acao === 'pronta') {
      const entrega = estado.entregas[string(args.entregaId, 'entregaId')];
      if (!entrega || entrega.estado !== 'revisada') falha('REVISAO_INVALIDA');
      if (['terminal', 'enviada', 'envio_incerto', 'aguardando_pessoa', 'bloqueada_tecnica'].includes(estado.tarefas[entrega.chave]?.estado)) falha('VAGA_BLOQUEADA');
      conferirHashesFontes(entrega, p.dados, estado);
      conferirHashesArtefatos(entrega, p.dados);
      if (estado.tarefas[entrega.chave]?.entregaId !== entrega.entregaId) falha('ENTREGA_SUPERADA');
      const novas = contarProntasValidas(estado, p.dados, entrega.chave);
      if (novas >= estado.estoqueAlvo) falha('ESTOQUE_CHEIO');
      estado.prontas[entrega.chave] = { entregaId: entrega.entregaId, hash: entrega.hash, hashVersoes: hash(entrega.versoes), em: agora() };
      estado.tarefas[entrega.chave].estado = 'pronta';
      gravarEstado(p, estado);
      return { chave: entrega.chave, pronta: estado.prontas[entrega.chave] };
    }
    if (acao === 'intencao') {
      const chave = chaveExistente(estado, args.identidade);
      if (!chave) falha('IDENTIDADE_NAO_RESOLVIDA');
      if (!args.versoes || typeof args.versoes !== 'object' || Array.isArray(args.versoes) || !Object.keys(args.versoes).length) falha('VERSOES_ATUAIS_OBRIGATORIAS');
      validarPacote(estado, chave, args.versoes, p.dados);
      const registro = lerTentativas(p);
      if (Object.values(registro.tentativas).some(t => t.chave === chave)) falha('ENVIO_INCERTO_OU_CONFIRMADO');
      const preflight = preflightAtestado(args.preflight);
      const tentativaId = crypto.randomUUID();
      registro.tentativas[tentativaId] = { tentativaId, chave, aliases: estado.identidades[chave]?.aliases || [], runId: estado.runId,
        geracao: estado.geracao, dono: estado.dono, entregaId: estado.prontas[chave].entregaId, versoes: args.versoes,
        preflight, intencaoEm: agora(), desfecho: null };
      gravarJsonAtomico(p.tentativas, registro);
      estado.tarefas[chave].estado = 'envio_incerto';
      delete estado.prontas[chave];
      gravarEstado(p, estado);
      return { tentativaId, estado: 'envio_incerto', liberadoClique: false, observacao: 'Somente QA local; arbitragem de UI não implementada' };
    }
    if (acao === 'confirmar') {
      const registro = lerTentativas(p);
      const tentativa = registro.tentativas[string(args.tentativaId, 'tentativaId')];
      if (!tentativa) falha('TENTATIVA_AUSENTE');
      if (tentativa.desfecho === 'confirmado') return { tentativa, repetida: true };
      if (tentativa.desfecho) falha('DESFECHO_IMUTAVEL');
      tentativa.desfecho = 'confirmado';
      tentativa.provaRef = string(args.provaRef, 'provaRef');
      tentativa.confirmadaEm = agora();
      gravarJsonAtomico(p.tentativas, registro);
      estado.tarefas[tentativa.chave] = { ...estado.tarefas[tentativa.chave], estado: 'enviada' };
      gravarEstado(p, estado);
      return { tentativa };
    }
    if (acao === 'reconciliar') {
      const registro = lerTentativas(p);
      const tentativa = registro.tentativas[string(args.tentativaId, 'tentativaId')];
      if (!tentativa) falha('TENTATIVA_AUSENTE');
      if (tentativa.desfecho) return { tentativa, repetida: true };
      if (args.desfecho === 'confirmado') {
        tentativa.provaRef = string(args.provaRef, 'provaRef');
        tentativa.desfecho = 'confirmado';
        estado.tarefas[tentativa.chave] = { ...estado.tarefas[tentativa.chave], estado: 'enviada' };
      } else falha('RECONCILIACAO_INSUFICIENTE', 'ausência de recibo não prova ausência de envio');
      tentativa.reconciliadaEm = agora();
      gravarJsonAtomico(p.tentativas, registro);
      gravarEstado(p, estado);
      return { tentativa };
    }
    falha('ACAO_DESCONHECIDA', acao);
  }, recuperar);
}
