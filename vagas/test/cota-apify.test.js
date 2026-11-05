import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as apify from '../src/fontes/apify.js';
import { consultarCota, diaDaInstalacao, reservarDisparo, registrarUsoExistente } from '../src/cota-apify.js';

const VAGAS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULO_COTA = pathToFileURL(path.join(VAGAS, 'src/cota-apify.js')).href;
const MODULO_APIFY = pathToFileURL(path.join(VAGAS, 'src/fontes/apify.js')).href;

function fixture(t) {
  const pasta = path.join(VAGAS, 'data/testes-cota-apify');
  fs.mkdirSync(pasta, { recursive: true });
  const dados = fs.mkdtempSync(path.join(pasta, 'cota-'));
  t.after(() => fs.rmSync(dados, { recursive: true, force: true }));
  return dados;
}

function ambiente(dados, fn) {
  const anterior = Object.fromEntries(['VAGAS_DIR_DADOS', 'VAGAS_FUSO', 'VAGAS_SEM_ENV'].map(k => [k, process.env[k]]));
  process.env.VAGAS_DIR_DADOS = dados;
  process.env.VAGAS_FUSO = 'UTC';
  process.env.VAGAS_SEM_ENV = '1';
  return Promise.resolve().then(fn).finally(() => {
    for (const [chave, valor] of Object.entries(anterior)) {
      if (valor === undefined) delete process.env[chave]; else process.env[chave] = valor;
    }
  });
}

function filho(codigo, dados, alvo = 'task-a') {
  return new Promise((resolve, reject) => {
    const env = { PATH: process.env.PATH || '', VAGAS_DIR_DADOS: dados, VAGAS_FUSO: 'UTC', VAGAS_SEM_ENV: '1' };
    const processo = spawn(process.execPath, ['--input-type=module', '-e', codigo, alvo], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = ''; let erro = '';
    processo.stdout.on('data', dadosLidos => { saida += dadosLidos; });
    processo.stderr.on('data', dadosLidos => { erro += dadosLidos; });
    processo.on('error', reject);
    processo.on('close', codigoSaida => codigoSaida === 0 ? resolve(JSON.parse(saida)) : reject(new Error(erro)));
  });
}

test('dia é calculado no fuso da instalação, inclusive perto da virada UTC', () => {
  const instante = new Date('2026-11-05T01:00:00Z');
  assert.equal(diaDaInstalacao(instante, 'America/Sao_Paulo'), '2026-11-04');
  assert.equal(diaDaInstalacao(instante, 'UTC'), '2026-11-05');
  assert.equal(diaDaInstalacao(instante, 'Asia/Tokyo'), '2026-11-05');
  assert.throws(() => diaDaInstalacao(instante, 'fuso-invalido'), /FUSO_INVALIDO/);
});

test('uso existente comprovado bloqueia nova tentativa e não grava token', (t) => {
  const dados = fixture(t);
  const dia = '2026-11-05';
  registrarUsoExistente({ dia, runId: 'run-existente', provaRef: 'data/prova-local.md' }, { dirDados: dados, fuso: 'UTC' });
  const estado = consultarCota({ dirDados: dados, fuso: 'UTC', agora: new Date(`${dia}T12:00:00Z`) });
  assert.equal(estado.usado, true);
  assert.equal(estado.uso.runId, 'run-existente');
  assert.throws(() => reservarDisparo({ dirDados: dados, fuso: 'UTC', agora: new Date(`${dia}T12:00:00Z`) }), /COTA_APIFY_USADA.*--ultimo/);
  assert.throws(() => registrarUsoExistente({ dia, runId: 'run-divergente', provaRef: 'data/outra.md' }, { dirDados: dados, fuso: 'UTC' }), /USO_DIVERGENTE/);
  assert.ok(!fs.readFileSync(path.join(dados, 'cota-apify.json'), 'utf8').includes('APIFY_TOKEN'));
});

test('dia seguinte libera uma nova reserva e troca de fuso exige reconciliação', (t) => {
  const dados = fixture(t);
  reservarDisparo({ dirDados: dados, fuso: 'UTC', agora: new Date('2026-11-05T12:00:00Z') });
  reservarDisparo({ dirDados: dados, fuso: 'UTC', agora: new Date('2026-11-06T12:00:00Z') });
  const cota = JSON.parse(fs.readFileSync(path.join(dados, 'cota-apify.json'), 'utf8'));
  assert.deepEqual(Object.keys(cota.dias).sort(), ['2026-11-05', '2026-11-06']);
  assert.throws(() => reservarDisparo({ dirDados: dados, fuso: 'America/Sao_Paulo', agora: new Date('2026-11-06T12:00:00Z') }), /FUSO_DIVERGENTE/);
});

test('seleção da rodada usa POST na primeira consulta e GET após intenção persistida', (t) => {
  const dados = fixture(t);
  const opcoes = { dirDados: dados, fuso: 'UTC', agora: new Date('2026-11-05T12:00:00Z') };
  assert.equal(consultarCota(opcoes).usado, false);
  reservarDisparo(opcoes);
  assert.equal(consultarCota(opcoes).usado, true);
  assert.equal(consultarCota({ ...opcoes, agora: new Date('2026-11-05T16:00:00Z') }).usado, true);
});

test('POST Task reserva antes da rede, segundo alvo pago bloqueia e GET continua liberado', async (t) => {
  const dados = fixture(t);
  await ambiente(dados, async () => {
    let posts = 0; let gets = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async (_url, opcoes = {}) => {
      if (opcoes.method === 'POST') { posts++; return { ok: true, json: async () => ({ data: { id: 'run-primeiro' } }) }; }
      gets++; return { ok: true, json: async () => ({ data: { items: [{ id: 'run-primeiro', status: 'SUCCEEDED' }] } }) };
    };
    try {
      const run = await apify.dispararTask('task-a', 'token-sintetico');
      assert.equal(run.id, 'run-primeiro');
      assert.equal(consultarCota().uso.runId, 'run-primeiro');
      if (typeof apify.dispararActor === 'function') {
        await assert.rejects(apify.dispararActor('actor-b', {}, 'token-sintetico'), /COTA_APIFY_USADA/);
      } else {
        await assert.rejects(apify.dispararTask('task-b', 'token-sintetico'), /COTA_APIFY_USADA/);
      }
      assert.equal(posts, 1);
      const ultimo = await apify.ultimoRun(typeof apify.dispararActor === 'function' ? { task: 'task-a' } : 'task-a', 'token-sintetico');
      assert.equal(ultimo.id, 'run-primeiro');
      assert.equal(gets, 1);
      assert.ok(!fs.readFileSync(path.join(dados, 'cota-apify.json'), 'utf8').includes('token-sintetico'));
    } finally { globalThis.fetch = original; }
  });
});

test('POST Actor também consome a cota compartilhada quando disponível', async (t) => {
  if (typeof apify.dispararActor !== 'function') return;
  const dados = fixture(t);
  await ambiente(dados, async () => {
    let posts = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async (_url, opcoes = {}) => {
      if (opcoes.method === 'POST') posts++;
      return { ok: true, json: async () => ({ data: { id: 'run-actor' } }) };
    };
    try {
      assert.equal((await apify.dispararActor('actor-a', { urls: [] }, 'token-sintetico')).id, 'run-actor');
      await assert.rejects(apify.dispararTask('task-b', 'token-sintetico'), /COTA_APIFY_USADA/);
      assert.equal(posts, 1);
      assert.equal(consultarCota().uso.runId, 'run-actor');
    } finally { globalThis.fetch = original; }
  });
});

test('reserva sobrevivente a crash bloqueia POST posterior sem rede', async (t) => {
  const dados = fixture(t);
  const reservar = `import { reservarDisparo } from ${JSON.stringify(MODULO_COTA)}; reservarDisparo(); process.stdout.write(JSON.stringify({ reservado: true }));`;
  assert.deepEqual(await filho(reservar, dados), { reservado: true });
  const tentar = `import { dispararTask } from ${JSON.stringify(MODULO_APIFY)}; let posts=0; globalThis.fetch=async()=>{ posts++; return {ok:true,json:async()=>({data:{id:'indevido'}})} }; let erro=''; try { await dispararTask(process.argv[1], 'token-sintetico'); } catch(e) { erro=e.message; } process.stdout.write(JSON.stringify({posts,erro}));`;
  const resultado = await filho(tentar, dados);
  assert.equal(resultado.posts, 0);
  assert.match(resultado.erro, /COTA_APIFY_USADA/);
});

test('falha incerta do POST mantém a reserva e não expõe token no erro', async (t) => {
  const dados = fixture(t);
  await ambiente(dados, async () => {
    let posts = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async () => { posts++; throw new Error('falha no transporte'); };
    try {
      await assert.rejects(apify.dispararTask('task-a', 'token-sintetico'), erro => {
        assert.match(erro.message, /APIFY_DISPARO_INCERTO.*--ultimo/);
        assert.ok(!erro.message.includes('token-sintetico'));
        return true;
      });
      await assert.rejects(apify.dispararTask('task-b', 'token-sintetico'), /COTA_APIFY_USADA/);
      assert.equal(posts, 1);
      assert.equal(consultarCota().uso.estado, 'reservado');
    } finally { globalThis.fetch = original; }
  });
});

test('dois processos disputando disparo produzem no máximo um POST', async (t) => {
  const dados = fixture(t);
  const codigo = `import { dispararTask } from ${JSON.stringify(MODULO_APIFY)}; let posts=0; globalThis.fetch=async()=>{ posts++; return {ok:true,json:async()=>({data:{id:'run-unico'}})} }; let erro=null; try { await dispararTask(process.argv[1], 'token-sintetico'); } catch(e) { erro=e.message; } process.stdout.write(JSON.stringify({posts,erro}));`;
  const resultados = await Promise.all([filho(codigo, dados, 'task-a'), filho(codigo, dados, 'task-b')]);
  assert.equal(resultados.reduce((soma, r) => soma + r.posts, 0), 1);
  assert.equal(resultados.filter(r => r.erro === null).length, 1);
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(dados, 'cota-apify.json'), 'utf8')).dias).length, 1);
});

test('JSON de cota truncado falha fechado antes do POST', async (t) => {
  const dados = fixture(t);
  fs.writeFileSync(path.join(dados, 'cota-apify.json'), '{');
  await ambiente(dados, async () => {
    let posts = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async () => { posts++; throw new Error('rede não deveria abrir'); };
    try {
      await assert.rejects(apify.dispararTask('task-a', 'token-sintetico'), /JSON_INVALIDO/);
      assert.equal(posts, 0);
    } finally { globalThis.fetch = original; }
  });
});
