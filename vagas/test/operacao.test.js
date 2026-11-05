import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { operar, comEscritaCentral, validarEnvio } from '../src/operacao.js';
import { lerJsonSeguro, lerJsonComHash, gravarJsonAtomico } from '../src/persistencia.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/testes-operacao');
const preflight = { origemStatus: 'quadro', statusAtual: 'avaliar', statusRef: 'fixture:status', anuncioRef: 'fixture:anuncio', autorizacaoRef: 'fixture:autorizacao', formularioRef: 'fixture:formulario', validacaoRef: 'fixture:validacao' };
function fixture(t) {
  fs.mkdirSync(raiz, { recursive: true });
  const dados = fs.mkdtempSync(path.join(raiz, 'operacao-'));
  t.after(() => fs.rmSync(dados, { recursive: true, force: true }));
  return dados;
}
function fonteLocal(dados, token, identidade) {
  const mapa = {
    anuncio: path.join(dados, 'fonte-anuncio.json'),
    base: path.join(dados, 'fonte-base.json'),
    regras: [path.join(dados, 'fonte-regra-1.json'), path.join(dados, 'fonte-regra-2.json')],
  };
  fs.writeFileSync(mapa.anuncio, '{"fixture":true}\n');
  fs.writeFileSync(mapa.base, '{"base":true}\n');
  fs.writeFileSync(mapa.regras[0], '{"regra":1}\n');
  fs.writeFileSync(mapa.regras[1], '{"regra":2}\n');
  const { fontesEsperadas } = operar(dados, 'fixar_fontes', { token, identidade, fontesEsperadas: mapa });
  return fontesEsperadas.map(fonte => ({ ...fonte }));
}

test('persistência rejeita JSON truncado, link simbólico e preserva publicação válida', t => {
  const dados = fixture(t);
  const arquivo = path.join(dados, 'x.json');
  gravarJsonAtomico(arquivo, { n: 1 });
  assert.deepEqual(lerJsonSeguro(arquivo), { n: 1 });
  assert.deepEqual(lerJsonComHash(arquivo).dados, { n: 1 });
  assert.match(lerJsonComHash(arquivo).hash, /^[a-f0-9]{64}$/);
  fs.writeFileSync(arquivo, '{');
  assert.throws(() => lerJsonSeguro(arquivo, {}), /JSON_INVALIDO/);
  const alvo = path.join(dados, 'alvo.json');
  fs.writeFileSync(alvo, '{}');
  const link = path.join(dados, 'link.json');
  fs.symlinkSync(alvo, link);
  assert.throws(() => gravarJsonAtomico(link, { n: 2 }), /CAMINHO_INSEGURO/);
  assert.throws(() => lerJsonComHash(link), /CAMINHO_INSEGURO/);
  assert.deepEqual(lerJsonComHash(path.join(dados, 'ausente.json'), {}).hash, null);
  assert.deepEqual(JSON.parse(fs.readFileSync(alvo, 'utf8')), {});
});

test('posse exclusiva e geração antiga não escrevem após retomada confirmada', async t => {
  const dados = fixture(t);
  const { token: antigo } = await operar(dados, 'iniciar', { dono: 'maestro-a', bootstrapNovo: true });
  assert.throws(() => operar(dados, 'iniciar', { dono: 'maestro-b' }), /OPERACAO_ATIVA/);
  assert.throws(() => operar(dados, 'retomar', { dono: 'maestro-b' }), /PARADA_NAO_CONFIRMADA/);
  const { token: novo } = await operar(dados, 'retomar', { dono: 'maestro-b', paradaConfirmada: true, runId: antigo.runId });
  assert.ok(novo.geracao > antigo.geracao);
  process.env.VAGAS_OPERACAO_TOKEN = JSON.stringify(antigo);
  try { assert.throws(() => comEscritaCentral(dados, () => gravarJsonAtomico(path.join(dados, 'indevido.json'), {})), /POSSE_NEGADA/); }
  finally { delete process.env.VAGAS_OPERACAO_TOKEN; }
  assert.equal(fs.existsSync(path.join(dados, 'indevido.json')), false);
  await operar(dados, 'encerrar', { token: novo });
  assert.deepEqual(lerJsonSeguro(path.join(dados, 'controle-operacao.json')).geracao, novo.geracao);
});

test('identidade forte, revisão independente, estoque e intenção durável bloqueiam repetição', async t => {
  const dados = fixture(t);
  const { token } = await operar(dados, 'iniciar', { dono: 'maestro', bootstrapNovo: true, estoqueAlvo: 1 });
  const identidade = { canonico: 'req:42', aliases: ['board:42'] };
  const { reserva } = await operar(dados, 'reservar', { token, identidade, etapa: 'preparar', dono: 'aux' });
  const fontesLocais = fonteLocal(dados, token, identidade);
  const mesma = await operar(dados, 'reservar', { token, identidade: { aliases: ['board:42'] }, etapa: 'preparar', dono: 'aux' });
  assert.equal(mesma.reserva.taskId, reserva.taskId);
  assert.throws(() => operar(dados, 'reservar', { token, identidade, etapa: 'preparar', dono: 'outro' }), /JA_RESERVADA/);
  assert.throws(() => operar(dados, 'reservar', { token, identidade: { indicio: 'empresa e título' }, etapa: 'preparar', dono: 'aux' }), /IDENTIDADE_FORTE_OBRIGATORIA/);
  const { entrega } = await operar(dados, 'entregar', { token, taskId: reserva.taskId, tipo: 'pacote', revisao: 1, autor: 'aux', versoes: { anuncio: 'a', base: 'b' }, fontesLocais, evidencias: ['fixture'] });
  assert.throws(() => operar(dados, 'revisar', { token, entregaId: entrega.entregaId, hash: entrega.hash, revisor: 'aux', parecer: 'aprovado' }), /REVISAO_NAO_INDEPENDENTE/);
  await operar(dados, 'revisar', { token, entregaId: entrega.entregaId, hash: entrega.hash, revisor: 'revisor', parecer: 'aprovado' });
  await operar(dados, 'pronta', { token, entregaId: entrega.entregaId });
  assert.throws(() => operar(dados, 'intencao', { token, identidade, versoes: { anuncio: 'mudou', base: 'b' }, preflight }), /FONTES_MUDARAM/);
  const { tentativaId, liberadoClique } = await operar(dados, 'intencao', { token, identidade, versoes: { anuncio: 'a', base: 'b' }, preflight });
  assert.equal(liberadoClique, false);
  assert.throws(() => validarEnvio(dados, 'board:42'), /ENVIO_INCERTO/);
  assert.throws(() => operar(dados, 'intencao', { token, identidade, versoes: { anuncio: 'a', base: 'b' }, preflight }), /NAO_PRONTA|ENVIO_INCERTO/);
  const confirmado = await operar(dados, 'confirmar', { token, tentativaId, provaRef: 'fixture:confirmacao-42' });
  assert.equal(confirmado.tentativa.desfecho, 'confirmado');
  assert.throws(() => validarEnvio(dados, 'req:42'), /JA_ENVIADA/);
  await operar(dados, 'encerrar', { token });
  assert.equal(lerJsonSeguro(path.join(dados, 'tentativas-envio.json')).tentativas[tentativaId].desfecho, 'confirmado');
});

test('entrada legada só obtém posse temporária sem operação ativa', async t => {
  const dados = fixture(t);
  await comEscritaCentral(dados, () => gravarJsonAtomico(path.join(dados, 'legado.json'), { ok: true }));
  assert.equal(lerJsonSeguro(path.join(dados, 'operacao', 'estado.json')).status, 'encerrada');
  const { token } = await operar(dados, 'iniciar', { dono: 'maestro', bootstrapNovo: true });
  assert.throws(() => comEscritaCentral(dados, () => null), /POSSE_NEGADA/);
  process.env.VAGAS_OPERACAO_TOKEN = JSON.stringify(token);
  try { await comEscritaCentral(dados, () => gravarJsonAtomico(path.join(dados, 'autorizado.json'), { ok: true })); }
  finally { delete process.env.VAGAS_OPERACAO_TOKEN; }
  assert.deepEqual(lerJsonSeguro(path.join(dados, 'autorizado.json')), { ok: true });
});

test('dois processos disputam iniciar; controle durável impede bootstrap silencioso após perda do estado', async t => {
  const dados = fixture(t);
  const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/operacao.mjs');
  const rodar = dono => new Promise((resolve, reject) => {
    const filho = spawn(process.execPath, [cli, 'iniciar', '--dados', dados, '--json', JSON.stringify({ dono, bootstrapNovo: true })], { env: { PATH: process.env.PATH || '' } });
    let out = '', err = '';
    filho.stdout.on('data', x => { out += x; });
    filho.stderr.on('data', x => { err += x; });
    filho.on('error', reject);
    filho.on('close', code => resolve({ code, out, err }));
  });
  const resultados = await Promise.all([rodar('a'), rodar('b')]);
  assert.deepEqual(resultados.map(x => x.code).sort(), [0, 1]);
  assert.match(resultados.find(x => x.code === 1).err, /OPERACAO_ATIVA|ESCRITA_OCUPADA/);
  fs.unlinkSync(path.join(dados, 'operacao', 'estado.json'));
  assert.throws(() => operar(dados, 'status'), /ESTADO_OPERACAO_AUSENTE/);
  assert.throws(() => comEscritaCentral(dados, () => null), /ESTADO_OPERACAO_AUSENTE/);
});

test('hash do artefato é revalidado e intenção atravessa encerramento e novo run', t => {
  const dados = fixture(t);
  const { token } = operar(dados, 'iniciar', { dono: 'a', bootstrapNovo: true });
  const identidade = { canonico: 'req:77', aliases: ['fonte:77'] };
  const { reserva } = operar(dados, 'reservar', { token, identidade, etapa: 'preparar', dono: 'autor' });
  const pdf = path.join(dados, 'material.pdf');
  fs.writeFileSync(pdf, 'conteudo-fixture-v1');
  const fontesLocais = fonteLocal(dados, token, identidade);
  const { entrega } = operar(dados, 'entregar', { token, taskId: reserva.taskId, tipo: 'curriculo', revisao: 1, autor: 'autor', versoes: { anuncio: 'v1' }, fontesLocais, artefatos: [{ caminho: pdf }] });
  fs.writeFileSync(pdf, 'conteudo-fixture-v2');
  assert.throws(() => operar(dados, 'revisar', { token, entregaId: entrega.entregaId, hash: entrega.hash, revisor: 'outro', parecer: 'aprovado' }), /ARTEFATO_MUDOU/);
  fs.writeFileSync(pdf, 'conteudo-fixture-v1');
  operar(dados, 'revisar', { token, entregaId: entrega.entregaId, hash: entrega.hash, revisor: 'outro', parecer: 'aprovado' });
  operar(dados, 'pronta', { token, entregaId: entrega.entregaId });
  fs.writeFileSync(pdf, 'conteudo-fixture-v2');
  assert.throws(() => operar(dados, 'intencao', { token, identidade, versoes: { anuncio: 'v1' }, preflight }), /ARTEFATO_MUDOU/);
  fs.writeFileSync(pdf, 'conteudo-fixture-v1');
  const { tentativaId } = operar(dados, 'intencao', { token, identidade, versoes: { anuncio: 'v1' }, preflight });
  assert.throws(() => operar(dados, 'reconciliar', { token, tentativaId, desfecho: 'nao_enviado', provaRef: 'sem recibo' }), /RECONCILIACAO_INSUFICIENTE/);
  operar(dados, 'encerrar', { token });
  const { token: novo } = operar(dados, 'iniciar', { dono: 'b' });
  assert.throws(() => validarEnvio(dados, 'fonte:77'), /ENVIO_INCERTO/);
  assert.throws(() => operar(dados, 'reservar', { token: novo, identidade, etapa: 'preparar', dono: 'b' }), /VAGA_BLOQUEADA/);
  assert.equal(lerJsonSeguro(path.join(dados, 'tentativas-envio.json')).tentativas[tentativaId].desfecho, null);
});

test('bloqueio preserva etapa; retomada exige referência e versão; plano respeita estoque', t => {
  const dados = fixture(t);
  const { token } = operar(dados, 'iniciar', { dono: 'maestro', bootstrapNovo: true, estoqueAlvo: 1 });
  const identidade = { canonico: 'req:88' };
  const { reserva } = operar(dados, 'reservar', { token, identidade, etapa: 'preparar', dono: 'aux' });
  const fontesLocais = fonteLocal(dados, token, identidade);
  assert.equal(operar(dados, 'planejar').papeis.preparacao[0].taskId, reserva.taskId);
  const { entrega } = operar(dados, 'entregar', { token, taskId: reserva.taskId, revisao: 1, tipo: 'pacote', autor: 'aux', versoes: { anuncio: 'v1' }, fontesLocais });
  assert.equal(operar(dados, 'planejar').papeis.revisao[0].entregaId, entrega.entregaId);
  operar(dados, 'revisar', { token, entregaId: entrega.entregaId, revisor: 'revisor', hash: entrega.hash, parecer: 'aprovado' });
  operar(dados, 'pronta', { token, entregaId: entrega.entregaId });
  assert.equal(operar(dados, 'planejar').estoque.podePreparar, false);
  assert.equal(operar(dados, 'planejar').papeis.aplicador[0].liberadoUI, false);
  const { tarefa } = operar(dados, 'bloquear', { token, identidade, estado: 'aguardando_pessoa', motivo: 'pergunta pessoal', referencia: 'fixture:pergunta' });
  assert.equal(tarefa.bloqueio.estadoAnterior, 'pronta');
  assert.equal(tarefa.bloqueio.etapa, 'preparar');
  assert.equal(operar(dados, 'planejar').estoque.podePreparar, true);
  assert.throws(() => operar(dados, 'retomar_tarefa', { token, identidade, versoes: { anuncio: 'v1' } }), /CAMPO_OBRIGATORIO/);
  assert.throws(() => operar(dados, 'retomar_tarefa', { token, identidade, resolucaoRef: 'fixture:resposta', versoes: { anuncio: 'v2' } }), /FONTES_MUDARAM/);
  const retomada = operar(dados, 'retomar_tarefa', { token, identidade, resolucaoRef: 'fixture:resposta', versoes: { anuncio: 'v1' } });
  assert.equal(retomada.tarefa.estado, 'pronta');
  assert.equal(retomada.formularioPreenchido, false);
  assert.throws(() => operar(dados, 'intencao', { token, identidade, preflight }), /VERSOES_ATUAIS_OBRIGATORIAS/);
  assert.throws(() => operar(dados, 'intencao', { token, identidade, versoes: { anuncio: 'v1' }, preflight: true }), /PREFLIGHT_OBRIGATORIO/);
  operar(dados, 'bloquear', { token, identidade, estado: 'terminal', motivo: 'vaga encerrada', referencia: 'fixture:status-fechado' });
  assert.throws(() => operar(dados, 'retomar_tarefa', { token, identidade, resolucaoRef: 'fixture:outra' }), /TAREFA_NAO_RETOMAVEL/);
});

test('artefatos por symlink e hardlink são rejeitados antes de hash ou revisão', t => {
  const dados = fixture(t);
  const { token } = operar(dados, 'iniciar', { dono: 'maestro', bootstrapNovo: true });
  const identidade = { canonico: 'req:99' };
  const { reserva } = operar(dados, 'reservar', { token, identidade, etapa: 'preparar', dono: 'aux' });
  const fontesLocais = fonteLocal(dados, token, identidade);
  const original = path.join(dados, 'original.pdf');
  fs.writeFileSync(original, 'fixture');
  const link = path.join(dados, 'link.pdf');
  fs.symlinkSync(original, link);
  assert.throws(() => operar(dados, 'entregar', { token, taskId: reserva.taskId, revisao: 1, tipo: 'pacote', autor: 'aux', fontesLocais, artefatos: [{ caminho: link }] }), /ARTEFATO_INSEGURO/);
  const hardlink = path.join(dados, 'hardlink.pdf');
  fs.linkSync(original, hardlink);
  assert.throws(() => operar(dados, 'entregar', { token, taskId: reserva.taskId, revisao: 1, tipo: 'pacote', autor: 'aux', fontesLocais, artefatos: [{ caminho: hardlink }] }), /ARTEFATO_INSEGURO/);
});

test('persistência recusa ancestral symlink antes de criar pasta e JSON por hardlink', t => {
  const dados = fixture(t);
  const real = path.join(dados, 'real');
  fs.mkdirSync(real);
  const linkDir = path.join(dados, 'linkdir');
  fs.symlinkSync(real, linkDir);
  assert.throws(() => gravarJsonAtomico(path.join(linkDir, 'nao-criar', 'x.json'), { n: 1 }), /CAMINHO_INSEGURO/);
  assert.equal(fs.existsSync(path.join(real, 'nao-criar')), false);
  const json = path.join(dados, 'dado.json');
  gravarJsonAtomico(json, { n: 1 });
  const link = path.join(dados, 'hardlink.json');
  fs.linkSync(json, link);
  assert.throws(() => lerJsonSeguro(link), /CAMINHO_INSEGURO/);
  assert.throws(() => gravarJsonAtomico(json, { n: 2 }), /CAMINHO_INSEGURO/);
});

test('avanço durável da geração sem estado revoga token antigo e exige retomada explícita', t => {
  const dados = fixture(t);
  const { token } = operar(dados, 'iniciar', { dono: 'a', bootstrapNovo: true });
  gravarJsonAtomico(path.join(dados, 'controle-operacao.json'), { contrato: 1, geracao: token.geracao + 1 });
  process.env.VAGAS_OPERACAO_TOKEN = JSON.stringify(token);
  try { assert.throws(() => comEscritaCentral(dados, () => gravarJsonAtomico(path.join(dados, 'indevido.json'), {})), /GERACAO_DIVERGENTE/); }
  finally { delete process.env.VAGAS_OPERACAO_TOKEN; }
  assert.equal(fs.existsSync(path.join(dados, 'indevido.json')), false);
  assert.throws(() => operar(dados, 'status'), /GERACAO_DIVERGENTE/);
  assert.throws(() => operar(dados, 'reservar', { token, identidade: { canonico: 'req:1' }, etapa: 'preparar', dono: 'a' }), /GERACAO_DIVERGENTE/);
  const { token: novo } = operar(dados, 'retomar', { dono: 'b', runId: token.runId, paradaConfirmada: true });
  assert.equal(novo.geracao, token.geracao + 2);
  assert.throws(() => operar(dados, 'reservar', { token: novo, identidade: { canonico: '__proto__' }, etapa: 'preparar', dono: 'b' }), /IDENTIDADE_INVALIDA/);
  assert.throws(() => operar(dados, 'reservar', { token: novo, identidade: { aliases: ['constructor'] }, etapa: 'preparar', dono: 'b' }), /IDENTIDADE_INVALIDA/);
});

test('ledger projetado bloqueia pacote mesmo se estado efêmero ficou antes da intenção', t => {
  const dados = fixture(t);
  const { token } = operar(dados, 'iniciar', { dono: 'maestro', bootstrapNovo: true });
  const identidade = { canonico: 'req:crash', aliases: ['board:crash'] };
  const { reserva } = operar(dados, 'reservar', { token, identidade, etapa: 'preparar', dono: 'aux' });
  const { entrega } = operar(dados, 'entregar', { token, taskId: reserva.taskId, revisao: 1, tipo: 'pacote', autor: 'aux', versoes: { anuncio: 'v1' }, fontesLocais: fonteLocal(dados, token, identidade) });
  operar(dados, 'revisar', { token, entregaId: entrega.entregaId, revisor: 'outro', hash: entrega.hash, parecer: 'aprovado' });
  operar(dados, 'pronta', { token, entregaId: entrega.entregaId });
  const tentativaId = crypto.randomUUID();
  gravarJsonAtomico(path.join(dados, 'tentativas-envio.json'), { contrato: 1, tentativas: { [tentativaId]: { tentativaId, chave: 'req:crash', aliases: ['board:crash'], desfecho: null } } });
  assert.equal(operar(dados, 'status').estado.tarefas['req:crash'].estado, 'envio_incerto');
  assert.equal(operar(dados, 'planejar').papeis.aplicador.length, 0);
  assert.throws(() => operar(dados, 'reservar', { token, identidade, etapa: 'preparar', dono: 'aux' }), /VAGA_BLOQUEADA/);
  assert.equal(lerJsonSeguro(path.join(dados, 'operacao', 'estado.json')).tarefas['req:crash'].estado, 'envio_incerto');
  operar(dados, 'retomar', { dono: 'novo', runId: token.runId, paradaConfirmada: true });
  assert.equal(operar(dados, 'status').estado.tarefas['req:crash'].estado, 'envio_incerto');
  gravarJsonAtomico(path.join(dados, 'tentativas-envio.json'), { contrato: 1, tentativas: { [tentativaId]: { tentativaId, chave: 'req:crash', aliases: ['board:crash'], desfecho: 'confirmado', provaRef: 'fixture:recibo' } } });
  assert.equal(operar(dados, 'status').estado.tarefas['req:crash'].estado, 'enviada');
  assert.equal(operar(dados, 'planejar').papeis.aplicador.length, 0);
});

test('concessão filha limita arquivos, geração e ações; revogação corta escrita', t => {
  const dados = fixture(t);
  const { token } = operar(dados, 'iniciar', { dono: 'principal', bootstrapNovo: true });
  const concedido = path.join(dados, 'filho.json');
  const outro = path.join(dados, 'outro.json');
  const { token: filho } = operar(dados, 'conceder', { token, donoFilho: 'coletor', arquivos: [concedido], janela: 'coleta-1', etapa: 'coletar' });
  process.env.VAGAS_OPERACAO_TOKEN = JSON.stringify(filho);
  try {
    assert.throws(() => comEscritaCentral(dados, () => null), /ARQUIVO_CONCEDIDO_OBRIGATORIO/);
    assert.throws(() => comEscritaCentral(dados, () => null, [outro]), /ARQUIVO_NAO_CONCEDIDO/);
    comEscritaCentral(dados, () => gravarJsonAtomico(concedido, { ok: true }), [concedido]);
    assert.throws(() => operar(dados, 'encerrar', { token: filho }), /ACAO_RESTRITA_AO_PRINCIPAL/);
    assert.throws(() => operar(dados, 'retomar', { dono: 'coletor', runId: token.runId, paradaConfirmada: true }), /TOKEN_INESPERADO/);
  } finally { delete process.env.VAGAS_OPERACAO_TOKEN; }
  assert.deepEqual(lerJsonSeguro(concedido), { ok: true });
  assert.equal(fs.existsSync(outro), false);
  const forjado = { ...filho, arquivos: [outro] };
  process.env.VAGAS_OPERACAO_TOKEN = JSON.stringify(forjado);
  try { assert.throws(() => comEscritaCentral(dados, () => null, [outro]), /POSSE_NEGADA/); }
  finally { delete process.env.VAGAS_OPERACAO_TOKEN; }
  operar(dados, 'revogar', { token, concessao: filho.concessao });
  process.env.VAGAS_OPERACAO_TOKEN = JSON.stringify(filho);
  try { assert.throws(() => comEscritaCentral(dados, () => null, [concedido]), /POSSE_NEGADA/); }
  finally { delete process.env.VAGAS_OPERACAO_TOKEN; }
});

test('fonte local alterada invalida plano e bloqueia intenção com DTO antigo', t => {
  const dados = fixture(t);
  const { token } = operar(dados, 'iniciar', { dono: 'principal', bootstrapNovo: true });
  const identidade = { canonico: 'req:fonte' };
  const { reserva } = operar(dados, 'reservar', { token, identidade, etapa: 'preparar', dono: 'aux' });
  const fontesLocais = fonteLocal(dados, token, identidade);
  const { entrega } = operar(dados, 'entregar', { token, taskId: reserva.taskId, revisao: 1, tipo: 'pacote', autor: 'aux', versoes: { anuncio: 'v1' }, fontesLocais });
  fs.writeFileSync(fontesLocais[0].caminho, '{"fixture":false}\n');
  assert.throws(() => operar(dados, 'revisar', { token, entregaId: entrega.entregaId, revisor: 'outro', hash: entrega.hash, parecer: 'aprovado' }), /FONTE_MUDOU/);
  fs.writeFileSync(fontesLocais[0].caminho, '{"fixture":true}\n');
  operar(dados, 'revisar', { token, entregaId: entrega.entregaId, revisor: 'outro', hash: entrega.hash, parecer: 'aprovado' });
  operar(dados, 'pronta', { token, entregaId: entrega.entregaId });
  fs.writeFileSync(fontesLocais[0].caminho, '{"fixture":false}\n');
  assert.equal(operar(dados, 'planejar').papeis.aplicador.length, 0);
  assert.match(operar(dados, 'planejar').pacotesInvalidos[0].invalida, /FONTE_MUDOU/);
  assert.throws(() => operar(dados, 'intencao', { token, identidade, versoes: { anuncio: 'v1' }, preflight }), /FONTE_MUDOU/);
});

test('dois recuperadores liberados juntos não tomam nem removem a posse um do outro', async t => {
  const dados = fixture(t);
  const { token } = operar(dados, 'iniciar', { dono: 'antigo', bootstrapNovo: true });
  const lock = path.join(dados, 'operacao', '.escrita.lock');
  fs.mkdirSync(lock);
  gravarJsonAtomico(path.join(lock, 'dono.json'), { pid: 2147483647, desde: 'fixture' });
  const modulo = new URL('../src/operacao.js', import.meta.url).href;
  const codigo = `import { operar } from ${JSON.stringify(modulo)}; process.send('ready'); process.on('message', () => { try { operar(process.argv[1], 'retomar', JSON.parse(process.argv[2])); process.exitCode = 0; } catch (e) { process.stderr.write(e.message); process.exitCode = 1; } process.disconnect(); });`;
  function iniciarFilho(dono) {
    const filho = spawn(process.execPath, ['--input-type=module', '-e', codigo, dados, JSON.stringify({ dono, runId: token.runId, paradaConfirmada: true })], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { PATH: process.env.PATH || '' } });
    const pronto = new Promise((resolve, reject) => { filho.once('message', resolve); filho.once('error', reject); });
    const fim = new Promise((resolve, reject) => {
      let erro = '';
      filho.stderr.on('data', x => { erro += x; });
      filho.once('close', code => resolve({ code, erro }));
      filho.once('error', reject);
    });
    return { filho, pronto, fim };
  }
  const a = iniciarFilho('a');
  const b = iniciarFilho('b');
  await Promise.all([a.pronto, b.pronto]);
  a.filho.send('go'); b.filho.send('go');
  const resultados = await Promise.all([a.fim, b.fim]);
  assert.deepEqual(resultados.map(x => x.code).sort(), [0, 1]);
  assert.match(resultados.find(x => x.code === 1).erro, /RECUPERACAO_OCUPADA|RECUPERACAO_ORFA|RUN_DIVERGENTE|ESCRITA_OCUPADA/);
  assert.equal(fs.existsSync(lock), false);
  assert.equal(fs.existsSync(path.join(dados, 'operacao', '.recuperacao.lock')), false);
  assert.equal(operar(dados, 'status').estado.status, 'ativa');
});

test('principal fixa anúncio, base e várias regras; omissão ou papel errado bloqueia entrega', t => {
  const dados = fixture(t);
  const { token } = operar(dados, 'iniciar', { dono: 'principal', bootstrapNovo: true });
  const identidade = { canonico: 'req:manifesto' };
  const { reserva } = operar(dados, 'reservar', { token, identidade, etapa: 'preparar', dono: 'aux' });
  const anuncio = path.join(dados, 'anuncio.json');
  const base = path.join(dados, 'base.json');
  const regra1 = path.join(dados, 'regra-1.json');
  const regra2 = path.join(dados, 'regra-2.json');
  for (const arquivo of [anuncio, base, regra1, regra2]) fs.writeFileSync(arquivo, '{}\n');
  assert.throws(() => operar(dados, 'fixar_fontes', { token, identidade, fontesEsperadas: { anuncio, base } }), /PAPEL_FONTE_AUSENTE/);
  const { fontesEsperadas } = operar(dados, 'fixar_fontes', { token, identidade, fontesEsperadas: { anuncio, base: [base], regras: [regra1, regra2] } });
  const entregar = fontesLocais => operar(dados, 'entregar', { token, taskId: reserva.taskId, revisao: 1, tipo: 'pacote', autor: 'aux', versoes: { anuncio: 'v1' }, fontesLocais });
  assert.equal(fontesEsperadas.length, 4);
  assert.throws(() => entregar(fontesEsperadas.slice(0, -1)), /FONTES_LOCAIS_INCOMPLETAS/);
  assert.throws(() => entregar(fontesEsperadas.map(f => f.papel === 'regras' ? { ...f, papel: 'base' } : f)), /FONTE_PAPEL_OU_CAMINHO_DIVERGENTE/);
  assert.ok(entregar(fontesEsperadas).entrega.hash);
});

test('guard órfão exige diagnóstico e manutenção offline com confirmação e fingerprint', t => {
  const dados = fixture(t);
  const { token } = operar(dados, 'iniciar', { dono: 'antigo', bootstrapNovo: true });
  const guard = path.join(dados, 'operacao', '.recuperacao.lock');
  fs.mkdirSync(guard);
  gravarJsonAtomico(path.join(guard, 'dono.json'), { pid: 2147483647, nonce: 'fixture-orfa' });
  const { guard: diagnostico } = operar(dados, 'diagnostico');
  assert.equal(diagnostico.orfa, true);
  assert.match(diagnostico.fingerprint, /^\d+:\d+$/);
  assert.throws(() => operar(dados, 'retomar', { dono: 'novo', runId: token.runId, paradaConfirmada: true }), /RECUPERACAO_ORFA/);
  assert.throws(() => operar(dados, 'manutencao_guard', { fingerprint: diagnostico.fingerprint, confirmacaoRef: 'fixture:parada' }), /PARADA_GLOBAL_NAO_CONFIRMADA/);
  assert.throws(() => operar(dados, 'manutencao_guard', { paradaGlobalConfirmada: true, fingerprint: '0:0', confirmacaoRef: 'fixture:parada' }), /FINGERPRINT_DIVERGENTE/);
  const manutencao = operar(dados, 'manutencao_guard', { paradaGlobalConfirmada: true, fingerprint: diagnostico.fingerprint, confirmacaoRef: 'fixture:parada' });
  assert.equal(fs.existsSync(guard), false);
  assert.equal(fs.existsSync(manutencao.backup), true);
  assert.equal(fs.existsSync(manutencao.guardMovido), true);
  assert.ok(manutencao.geracaoRevogada > token.geracao);
  assert.throws(() => operar(dados, 'status'), /GERACAO_DIVERGENTE/);
  const { token: novo } = operar(dados, 'retomar', { dono: 'novo', runId: token.runId, paradaConfirmada: true });
  assert.ok(novo.geracao > manutencao.geracaoRevogada);
});

test('manutenção recusa guard pertencente a processo vivo', t => {
  const dados = fixture(t);
  operar(dados, 'iniciar', { dono: 'principal', bootstrapNovo: true });
  const guard = path.join(dados, 'operacao', '.recuperacao.lock');
  fs.mkdirSync(guard);
  gravarJsonAtomico(path.join(guard, 'dono.json'), { pid: process.pid, nonce: 'fixture-viva' });
  const { guard: diagnostico } = operar(dados, 'diagnostico');
  assert.equal(diagnostico.orfa, false);
  assert.throws(() => operar(dados, 'manutencao_guard', { paradaGlobalConfirmada: true, fingerprint: diagnostico.fingerprint, confirmacaoRef: 'fixture:parada' }), /RECUPERACAO_OCUPADA/);
  assert.equal(fs.existsSync(guard), true);
});

test('crash entre mkdir do guard e gravação do dono permanece bloqueado até manutenção explícita', t => {
  const dados = fixture(t);
  const { token } = operar(dados, 'iniciar', { dono: 'antigo', bootstrapNovo: true });
  const guard = path.join(dados, 'operacao', '.recuperacao.lock');
  fs.mkdirSync(guard);
  const { guard: diagnostico } = operar(dados, 'diagnostico');
  assert.equal(diagnostico.orfa, true);
  assert.match(diagnostico.erroDono, /ARQUIVO_AUSENTE/);
  assert.throws(() => operar(dados, 'retomar', { dono: 'novo', runId: token.runId, paradaConfirmada: true }), /RECUPERACAO_ORFA/);
  assert.throws(() => operar(dados, 'manutencao_guard', { fingerprint: diagnostico.fingerprint, confirmacaoRef: 'fixture:parada' }), /PARADA_GLOBAL_NAO_CONFIRMADA/);
  assert.equal(fs.existsSync(guard), true);
});

test('revisão tardia não tira a entrega atual da fila nem permite autorrevisão normalizada', t => {
  const dados = fixture(t);
  const { token } = operar(dados, 'iniciar', { dono: 'maestro', bootstrapNovo: true });
  const identidade = { canonico: 'req:revisao-tardia' };
  const { reserva } = operar(dados, 'reservar', { token, identidade, etapa: 'preparar', dono: 'autor' });
  const fontesLocais = fonteLocal(dados, token, identidade);
  const base = { token, taskId: reserva.taskId, tipo: 'pacote', autor: 'autor', versoes: { anuncio: 'v1' }, fontesLocais };
  const antiga = operar(dados, 'entregar', { ...base, revisao: 1 }).entrega;
  const atual = operar(dados, 'entregar', { ...base, revisao: 2, substituiId: antiga.entregaId, evidencias: ['nova revisão'] }).entrega;
  assert.throws(() => operar(dados, 'revisar', { token, entregaId: antiga.entregaId, hash: antiga.hash, revisor: 'outro', parecer: 'aprovado' }), /ENTREGA_SUPERADA/);
  assert.deepEqual(operar(dados, 'planejar').papeis.revisao, [{ chave: 'req:revisao-tardia', entregaId: atual.entregaId }]);
  assert.equal(operar(dados, 'status').estado.tarefas['req:revisao-tardia'].estado, 'em_revisao');
  assert.throws(() => operar(dados, 'revisar', { token, entregaId: atual.entregaId, hash: atual.hash, revisor: ' autor ', parecer: 'aprovado' }), /REVISAO_NAO_INDEPENDENTE/);
  const revisada = operar(dados, 'revisar', { token, entregaId: atual.entregaId, hash: atual.hash, revisor: ' outro ', parecer: 'aprovado' }).entrega;
  assert.equal(revisada.revisao.revisor, 'outro');
});

test('retomada confirmada recupera lock vazio de crash e revoga geração antiga', t => {
  const dados = fixture(t);
  const { token: antigo } = operar(dados, 'iniciar', { dono: 'antigo', bootstrapNovo: true });
  const lock = path.join(dados, 'operacao', '.escrita.lock');
  fs.mkdirSync(lock);
  assert.throws(() => operar(dados, 'retomar', { dono: 'novo', runId: antigo.runId }), /ESCRITA_OCUPADA/);
  assert.equal(fs.existsSync(lock), true);
  fs.writeFileSync(path.join(lock, 'dono.json'), '{');
  assert.throws(() => operar(dados, 'retomar', { dono: 'novo', runId: antigo.runId, paradaConfirmada: true }), /JSON_INVALIDO/);
  fs.unlinkSync(path.join(lock, 'dono.json'));
  const { token: novo } = operar(dados, 'retomar', { dono: 'novo', runId: antigo.runId, paradaConfirmada: true });
  assert.ok(novo.geracao > antigo.geracao);
  assert.equal(fs.existsSync(lock), false);
  assert.equal(fs.readdirSync(path.dirname(lock)).filter(nome => nome.startsWith('.escrita.lock.revogado-')).length, 1);
  assert.throws(() => operar(dados, 'reservar', { token: antigo, identidade: { canonico: 'req:velha' }, etapa: 'preparar', dono: 'antigo' }), /POSSE_NEGADA/);
  assert.equal(operar(dados, 'status').estado.dono, 'novo');
});


test('atualização exclui operação e escrita legada sem remover a trava do atualizador', t => {
  const dados = fixture(t);
  fs.mkdirSync(path.join(dados, 'operacao'), { recursive: true });
  const guard = path.join(dados, 'operacao', '.atualizacao.lock');
  fs.mkdirSync(guard);
  assert.throws(() => operar(dados, 'iniciar', { dono: 'maestro' }), /ATUALIZACAO_EM_ANDAMENTO/);
  assert.throws(() => comEscritaCentral(dados, () => assert.fail('não deve escrever')), /ATUALIZACAO_EM_ANDAMENTO/);
  assert.equal(fs.existsSync(guard), true);
  fs.rmdirSync(guard);
  const { token } = operar(dados, 'iniciar', { dono: 'maestro', bootstrapNovo: true });
  operar(dados, 'encerrar', { token });
});


test('modo mapear bloqueia validação e intenção mesmo com operação ativa', t => {
  const dados = fixture(t);
  const { token } = operar(dados, 'iniciar', { dono: 'maestro', bootstrapNovo: true });
  fs.writeFileSync(path.join(dados, 'politica-autonomia.json'), JSON.stringify({ modoCandidatura: 'mapear' }));
  assert.throws(() => validarEnvio(dados, 'vaga'), /MODO_MAPEAMENTO/);
  assert.throws(() => operar(dados, 'intencao', { token, identidade: 'vaga', preflight }), /MODO_MAPEAMENTO/);
  operar(dados, 'encerrar', { token });
});
