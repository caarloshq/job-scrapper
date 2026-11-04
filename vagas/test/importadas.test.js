import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { coletar, coletarDe, normalizar, urlPublica } from '../src/fontes/importadas.js';

const CAMPOS = { title: 'title', url: 'url', company: 'company', location: 'location', description: 'description', publishedAt: 'publishedAt', id: 'id' };
const fonte = (extra = {}) => ({ fonte: 'Indeed', habilitada: true, tipo: 'apify-dataset', datasetId: 'DatasetExistente123', campos: { ...CAMPOS }, ...extra });
const vaga = (id = 'a') => ({ id, title: 'Product Designer', url: `https://www.indeed.com/viewjob?jk=${id}`, company: 'Empresa de exemplo', location: 'Brazil', description: '<p>Design de produto</p>', publishedAt: '2026-11-01' });
const config = (...fontes) => ({ fontes });
const env = { APIFY_TOKEN: 'token-ficticio-apenas-teste' };
const json = (dados, headers = {}) => new Response(JSON.stringify(dados), { headers: { 'Content-Type': 'application/json', ...headers } });
const semRede = () => { throw new Error('Teste não deve acessar a rede'); };
async function fixture(t, conteudo = [vaga()]) {
  const raiz = await mkdtemp(join(tmpdir(), 'vagas-importadas-'));
  t.after(() => rm(raiz, { recursive: true, force: true }));
  const dirDados = join(raiz, 'data');
  await mkdir(join(dirDados, 'importacoes'), { recursive: true });
  await writeFile(join(dirDados, 'importacoes', 'indeed.json'), JSON.stringify(conteudo));
  return { raiz, dirDados, local: fonte({ tipo: 'local-json', arquivo: 'importacoes/indeed.json' }) };
}

test('configuração distribuída mantém Indeed e Glassdoor desativados', async (t) => {
  t.mock.method(globalThis, 'fetch', semRede);
  const r = await coletar();
  assert.deepEqual(r.vagas, []);
  assert.equal(r.contador.status, 'desativada');
  assert.equal(r.contador.consultadas, 0);
  assert.equal(r.contador.fontes.length, 2);
  assert.ok(r.contador.fontes.every((f) => f.status === 'desativada'));
  assert.equal(r.contador.completa, false);
});

test('desativada não lê arquivo nem consulta dataset, mesmo com token presente', async () => {
  for (const tipo of ['local-json', 'apify-dataset']) {
    const r = await coletarDe(config(fonte({ habilitada: false, tipo, arquivo: '/nao/existe.json' })), { fetchImpl: semRede, env });
    assert.equal(r.contador.status, 'desativada');
    assert.equal(r.contador.consultadas, 0);
    assert.equal(r.contador.falhas, 0);
  }
});

test('configuração ausente ou inválida nunca vira sucesso vazio', async () => {
  for (const cfg of [null, {}, { fontes: [] }, config(null), config(fonte({ habilitada: 'true' })), config(fonte({ tipo: 'actor' })), config(fonte({ campos: {} }))]) {
    const r = await coletarDe(cfg, { fetchImpl: semRede, env });
    assert.equal(r.contador.status, 'erro');
    assert.equal(r.contador.falhas, 1);
    assert.ok(r.contador.erro);
  }
});

test('normalização usa somente campos explícitos e deixa fatos ausentes nulos', () => {
  const item = { job: { name: '<b>UX Designer</b>', link: 'https://www.glassdoor.com/job-listing/exemplo.htm', company: 'Exemplo &amp; Filhos' }, region: 'Brazil', publishedAt: '1 day ago', remote: true, salary: 10000 };
  const f = fonte({ fonte: 'Glassdoor', campos: { title: 'job.name', url: 'job.link', company: 'job.company', location: 'region', description: null, publishedAt: 'publishedAt', id: null } });
  const v = normalizar(item, f);
  assert.equal(v.titulo, 'UX Designer');
  assert.equal(v.empresa, 'Exemplo & Filhos');
  assert.equal(v.fonte, 'Glassdoor');
  assert.equal(v.camada, 'Importação');
  assert.equal(v.localizacao, 'Brazil');
  for (const k of ['cidade', 'estado', 'pais', 'modelo', 'remoto', 'salarioBruto', 'publicadaEm', 'prazo', 'statusFonte']) assert.equal(v[k], null, k);
  assert.equal(v.validada, false);
  assert.equal(v.descricaoPendente, true);
  assert.equal(v.descricao, null);
  assert.equal(normalizar(item, fonte()), null, 'sem inferir nomes de campos alternativos');
});

test('IDs são estáveis, separados por fonte e independentes de parâmetros de rastreio', () => {
  const item = vaga();
  assert.equal(normalizar(item, fonte()).idExterno, 'indeed:a');
  assert.equal(normalizar(item, fonte({ fonte: 'Glassdoor' })).idExterno, 'glassdoor:a');
  delete item.id;
  const id = normalizar(item, fonte()).idExterno;
  assert.match(id, /^indeed:url-[a-f0-9]{32}$/);
  assert.equal(normalizar({ ...item, title: 'Título editado', url: `${item.url}&utm_source=foo#top` }, fonte()).idExterno, id);
  assert.notEqual(normalizar({ ...item, url: `${item.url}b` }, fonte()).idExterno, id);
});

test('datas são ISO explícitas e não aceitam relativos, datas impossíveis ou números', () => {
  assert.equal(normalizar(vaga(), fonte()).publicadaEm, '2026-11-01T00:00:00.000Z');
  assert.equal(normalizar({ ...vaga(), publishedAt: '2026-11-01T10:00:00-03:00' }, fonte()).publicadaEm, '2026-11-01T13:00:00.000Z');
  for (const publishedAt of [null, '', 'hoje', '1 day ago', '11/01/2026', '2026-02-30', '2026-13-01', '2026-11-01T24:00:00Z', 1793491200]) {
    assert.equal(normalizar({ ...vaga(), publishedAt }, fonte()).publicadaEm, null, String(publishedAt));
  }
});

test('rejeita esquemas e URLs perigosas sem visitar anúncios', () => {
  const invalidas = ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.org/job', 'https://user:password@indeed.com/job', 'https://localhost/job', 'http://127.0.0.1/job', 'http://2130706433/job', 'http://0x7f000001/job', 'http://10.0.0.1/job', 'http://172.16.0.1/job', 'http://192.168.0.1/job', 'http://169.254.169.254/job', 'https://[::1]/job', 'https://[::ffff:127.0.0.1]/job', 'https://[fc00::1]/job', 'https://company.internal/job', 'https://office.local/job', '//indeed.com/job', 'https://indeed.com/job?token=private', 'https://indeed.com/job?api_key=private', 'https://indeed.com/job?X-Amz-Signature=private', 'https://indeed.com/\njob'];
  for (const url of invalidas) {
    assert.equal(urlPublica(url), null, url);
    assert.equal(normalizar({ ...vaga(), url }, fonte()), null, url);
  }
  assert.equal(urlPublica('http://www.indeed.com/viewjob?jk=123'), 'http://www.indeed.com/viewjob?jk=123');
  assert.equal(urlPublica('https://careers.example.com/job#top'), 'https://careers.example.com/job');
});

test('mapeamento rejeita protótipos, campos ausentes e valores não textuais', async () => {
  for (const title of ['constructor.name', '__proto__.title', 'prototype.name', ['title']]) {
    const r = await coletarDe(config(fonte({ campos: { ...CAMPOS, title } })), { fetchImpl: semRede, env });
    assert.equal(r.contador.falhas, 1);
  }
  assert.equal(normalizar({ ...vaga(), title: {} }, fonte()), null);
  assert.equal(normalizar(Object.create(vaga()), fonte()), null);
  assert.equal(normalizar(null, fonte()), null);
});

test('JSON local é importado com dedupe e contadores honestos', async (t) => {
  const { dirDados, local } = await fixture(t, [vaga(), vaga(), vaga('b'), { title: 'Sem URL' }]);
  const r = await coletarDe(config(local), { dirDados, fetchImpl: semRede });
  assert.equal(r.vagas.length, 2);
  assert.equal(r.contador.brutas, 4);
  assert.equal(r.contador.importadas, 2);
  assert.equal(r.contador.duplicadas, 1);
  assert.equal(r.contador.invalidas, 1);
  assert.equal(r.contador.status, 'parcial');
  assert.equal(r.contador.completa, false);
});

test('JSON local vazio é distinguido de arquivo ausente e schema incompatível', async (t) => {
  const { dirDados, local } = await fixture(t, []);
  let r = await coletarDe(config(local), { dirDados, fetchImpl: semRede });
  assert.equal(r.contador.status, 'vazia');
  assert.equal(r.contador.completa, true);
  for (const conteudo of [{ jobs: [vaga()] }, 'string', [null, { title: 'sem link' }]]) {
    await writeFile(join(dirDados, local.arquivo), JSON.stringify(conteudo));
    r = await coletarDe(config(local), { dirDados, fetchImpl: semRede });
    assert.equal(r.contador.status, 'erro');
    assert.equal(r.contador.falhas, 1);
  }
  r = await coletarDe(config({ ...local, arquivo: 'ausente.json' }), { dirDados, fetchImpl: semRede });
  assert.equal(r.contador.status, 'erro');
  assert.ok(!r.contador.erro.includes(dirDados));
});

test('arquivo local rejeita traversal, absoluto, symlinks de arquivo/pasta e root', async (t) => {
  const { raiz, dirDados, local } = await fixture(t);
  await writeFile(join(raiz, 'externo.json'), JSON.stringify([vaga()]));
  await symlink(join(raiz, 'externo.json'), join(dirDados, 'link.json'));
  await symlink(raiz, join(dirDados, 'pasta'));
  await symlink(dirDados, join(raiz, 'data-link'));
  for (const arquivo of ['../externo.json', 'importacoes/../../externo.json', join(raiz, 'externo.json'), 'link.json', 'pasta/externo.json', 'importacoes\\indeed.json', './importacoes/indeed.json']) {
    const r = await coletarDe(config({ ...local, arquivo }), { dirDados, fetchImpl: semRede });
    assert.equal(r.contador.status, 'erro', arquivo);
  }
  const r = await coletarDe(config(local), { dirDados: join(raiz, 'data-link'), fetchImpl: semRede });
  assert.equal(r.contador.status, 'erro');
});

test('tamanho e quantidade do arquivo local são limitados e truncamento é explícito', async (t) => {
  const { dirDados, local } = await fixture(t, [vaga('a'), vaga('b')]);
  const r = await coletarDe(config({ ...local, maxItens: 1 }), { dirDados, fetchImpl: semRede });
  assert.equal(r.vagas.length, 1);
  assert.equal(r.contador.truncada, true);
  assert.equal(r.contador.status, 'parcial');
  assert.equal(r.contador.fontes[0].totalDisponivel, 2);
  const grande = await coletarDe(config({ ...local, maxBytes: 10 }), { dirDados, fetchImpl: semRede });
  assert.equal(grande.contador.status, 'erro');
  assert.match(grande.contador.erro, /bytes/);
});

test('Apify só faz GET paginado do dataset existente e token só vai em Authorization', async () => {
  const chamadas = [];
  const fetchImpl = async (endereco, opcoes) => {
    const u = new URL(endereco);
    chamadas.push({ u, opcoes });
    assert.equal(u.origin, 'https://api.apify.com');
    assert.equal(u.pathname, '/v2/datasets/DatasetExistente123/items');
    assert.equal(u.searchParams.has('token'), false);
    assert.equal(opcoes.headers.Authorization, `Bearer ${env.APIFY_TOKEN}`);
    assert.equal(opcoes.method, 'GET');
    assert.equal(opcoes.redirect, 'error');
    const offset = Number(u.searchParams.get('offset'));
    return json(offset === 0 ? [vaga('a'), vaga('b')] : [vaga('c')], { 'x-apify-pagination-total': '3', 'x-apify-pagination-offset': String(offset) });
  };
  const r = await coletarDe(config(fonte({ limitePorPagina: 2 })), { fetchImpl, env });
  assert.equal(r.vagas.length, 3);
  assert.equal(r.contador.status, 'ok');
  assert.deepEqual(chamadas.map(({ u }) => u.searchParams.get('offset')), ['0', '2']);
  assert.equal(r.contador.consultadas, 2);
  assert.ok(!JSON.stringify(r).includes(env.APIFY_TOKEN));
});

test('sem total, página curta encerra; página cheia no limite permanece truncada', async () => {
  let chamadas = 0;
  const f = fonte({ limitePorPagina: 2, maxPaginas: 1 });
  let r = await coletarDe(config(f), { env, fetchImpl: async () => { chamadas++; return json([vaga('a'), vaga('b')]); } });
  assert.equal(r.contador.truncada, true);
  assert.equal(r.contador.status, 'parcial');
  assert.equal(chamadas, 1);
  r = await coletarDe(config(f), { env, fetchImpl: async () => json([vaga('a')]) });
  assert.equal(r.contador.truncada, false);
  assert.equal(r.contador.status, 'ok');
});

test('cap de itens ajusta limit, respeita total e detecta resposta fora do contrato', async () => {
  const chamadas = [];
  const r = await coletarDe(config(fonte({ limitePorPagina: 2, maxItens: 3 })), { env, fetchImpl: async (u) => {
    const url = new URL(u);
    chamadas.push(url.searchParams.get('limit'));
    return json(url.searchParams.get('offset') === '0' ? [vaga('a'), vaga('b')] : [vaga('c')], { 'x-apify-pagination-total': '4' });
  } });
  assert.deepEqual(chamadas, ['2', '1']);
  assert.equal(r.contador.truncada, true);
  for (const dados of [json([vaga(), vaga('b')]), json([], { 'x-apify-pagination-total': '10' }), json([vaga()], { 'x-apify-pagination-offset': '99' }), json([vaga()], { 'x-apify-pagination-total': 'x' }), json([vaga()], { 'x-apify-pagination-limit': '99' })]) {
    const erro = await coletarDe(config(fonte({ limitePorPagina: 1 })), { env, fetchImpl: async () => dados });
    assert.equal(erro.contador.status, 'erro');
    assert.equal(erro.contador.falhas, 1);
  }
});

test('erro posterior preserva páginas já importadas, sem esconder falha', async () => {
  let n = 0;
  const r = await coletarDe(config(fonte({ limitePorPagina: 1 })), { env, fetchImpl: async () => {
    if (n++ === 0) return json([vaga()]);
    throw new Error(`segredo ${env.APIFY_TOKEN} https://api.apify.com?token=nao-expor`);
  } });
  assert.equal(r.vagas.length, 1);
  assert.equal(r.contador.status, 'parcial');
  assert.equal(r.contador.falhas, 1);
  assert.equal(r.contador.consultadas, 2);
  assert.ok(!JSON.stringify(r).includes(env.APIFY_TOKEN));
  assert.ok(!JSON.stringify(r).includes('nao-expor'));
});

test('HTTP, redirect, JSON e schema inválidos reportam erro sem corpo externo', async () => {
  const respostas = [new Response('segredo-http', { status: 403 }), new Response('', { status: 302, headers: { location: 'http://localhost' } }), new Response('segredo-json', { headers: { 'content-type': 'application/json' } }), json({ error: 'segredo-schema' }), json([{}, null]), new Response('<html>segredo-html</html>', { headers: { 'content-type': 'text/html' } })];
  for (const resposta of respostas) {
    const r = await coletarDe(config(fonte()), { env, fetchImpl: async () => resposta });
    assert.equal(r.contador.status, 'erro');
    assert.equal(r.contador.falhas, 1);
    assert.ok(!JSON.stringify(r).includes('segredo-'));
  }
});

test('timeout cobre fetch e corpo pendurado mesmo em mocks que ignoram AbortSignal', async () => {
  for (const fetchImpl of [async () => new Promise(() => {}), async () => new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } })]) {
    const inicio = Date.now();
    const r = await coletarDe(config(fonte({ timeoutMs: 15 })), { env, fetchImpl });
    assert.equal(r.contador.status, 'erro');
    assert.match(r.contador.erro, /Tempo limite/);
    assert.ok(Date.now() - inicio < 1500);
  }
});

test('resposta Apify tem limite de bytes, com ou sem content-length', async () => {
  for (const headers of [{}, { 'content-length': '9999' }]) {
    const r = await coletarDe(config(fonte({ maxBytes: 10 })), { env, fetchImpl: async () => json([vaga()], headers) });
    assert.equal(r.contador.status, 'erro');
    assert.match(r.contador.erro, /bytes/);
  }
});

test('token ausente e destino malicioso são rejeitados antes do fetch', async () => {
  let r = await coletarDe(config(fonte()), { env: {}, fetchImpl: semRede });
  assert.match(r.contador.erro, /APIFY_TOKEN/);
  for (const extra of [{ datasetId: '../acts/test/runs' }, { datasetId: 'abc?token=segredo' }, { datasetId: 'https://localhost/dataset' }, { token: 'segredo' }, { apiKey: 'segredo' }, { actorId: 'owner/paid-actor' }, { taskId: 'task' }, { url: 'http://localhost' }, { maxPaginas: 0 }, { maxItens: Infinity }, { limitePorPagina: 100000 }, { maxBytes: 100 * 1024 * 1024 }]) {
    r = await coletarDe(config(fonte(extra)), { env, fetchImpl: semRede });
    assert.equal(r.contador.status, 'erro');
    assert.equal(r.contador.consultadas, 0);
    assert.ok(!JSON.stringify(r).includes('segredo'));
  }
});

test('falha de uma fonte não interrompe outra, que mantém nome e ID próprios', async () => {
  const r = await coletarDe(config(fonte({ datasetId: 'falha' }), fonte({ fonte: 'Glassdoor', datasetId: 'sucesso' })), { env, fetchImpl: async (url) => {
    if (url.includes('/falha/')) throw new Error('não propagar detalhes');
    return json([vaga()]);
  } });
  assert.equal(r.vagas.length, 1);
  assert.equal(r.vagas[0].fonte, 'Glassdoor');
  assert.equal(r.vagas[0].idExterno, 'glassdoor:a');
  assert.equal(r.contador.status, 'parcial');
  assert.equal(r.contador.falhas, 1);
});
