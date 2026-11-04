import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coletar, descricaoDaOrigem, paraVaga } from '../src/fontes/uxjobs.js';

// Toda rede e simulada. Nem os links de teste nem os hosts das APIs sao visitados.
const item = (over = {}) => ({
  s: 'senior-product-designer-example',
  u: 'https://careers.example.com/jobs/design',
  t: 'Senior Product Designer', co: 'Example', l: 'Brazil', c: 'BR',
  rm: 1, wp: 'Remote', p: Date.now(), ...over,
});
const home = (itens) => `<script id="jobs-data" type="application/json">${JSON.stringify(itens)}</script>`;
const json = (value) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

test('UX Jobs nao enriquece localhost, HTTP, credenciais, segredo, host parecido ou origem arbitraria', async () => {
  let chamadas = 0;
  const fetchImpl = async () => { chamadas++; throw new Error('Nao deveria acessar rede.'); };
  for (const link of [
    'http://127.0.0.1:8080/private', 'https://127.0.0.1/private',
    'https://[::1]/private', 'https://localhost/private', 'https://host.internal/private',
    'http://jobs.lever.co/example/123', 'https://secret@jobs.lever.co/example/123',
    'https://jobs.lever.co:8443/example/123', 'https://jobs.lever.co/example/123?token=secret',
    'https://jobs.lever.co.evil.example/example/123', 'https://evil.example/example/123',
    'https://jobs.ashbyhq.com/example%2fprivate/123', 'https://jobs.lever.co/example/123/extra',
    'https://boards.greenhouse.io/example/jobs/123/extra',
    'https://boards.greenhouse.io/example?gh_jid=123%2fprivate',
    'https://boards.greenhouse.io/example/jobs/not-a-number',
    'javascript:alert(1)', 'not a URL',
  ]) assert.equal(await descricaoDaOrigem(link, { fetchImpl }), null, link);
  assert.equal(chamadas, 0);
});

test('links e slugs perigosos nao entram no indice normalizado', () => {
  for (const u of ['http://127.0.0.1/private', 'https://localhost/private', 'javascript:alert(1)', 'https://user:secret@jobs.lever.co/example/123']) {
    assert.equal(paraVaga(item({ u })), null);
  }
  for (const s of ['../private', 'abc?next=private', 'abc#private', 'abc%2fprivate', '//evil.example', '']) {
    assert.equal(paraVaga(item({ s })), null);
  }
  assert.ok(paraVaga(item()), 'URL HTTPS publica continua disponivel para leitura manual');
});

test('Greenhouse usa somente endpoint publico fixo e recusa redirecionamentos', async () => {
  for (const link of [
    'https://boards.greenhouse.io/example/jobs/123',
    'https://job-boards.greenhouse.io/example/jobs/123',
    'https://boards.greenhouse.io/example?gh_jid=123',
  ]) {
    const chamadas = [];
    const descricao = await descricaoDaOrigem(link, { fetchImpl: async (url, opts) => {
      chamadas.push(url); assert.equal(opts.redirect, 'error'); assert.ok(opts.signal);
      return json({ content: '<p>Descricao confirmada.</p>' });
    } });
    assert.equal(descricao, 'Descricao confirmada.');
    assert.deepEqual(chamadas, ['https://boards-api.greenhouse.io/v1/boards/example/jobs/123']);
  }
});

test('Ashby casa o ID exato e Lever preserva listas via API conhecida', async () => {
  const chamadas = [];
  const fetchImpl = async (url, opts) => {
    chamadas.push(url); assert.equal(opts.redirect, 'error');
    if (url.includes('ashbyhq')) return json({ jobs: [
      { id: '12', descriptionPlain: 'Outro anuncio, ID apenas parcialmente igual.' },
      { id: '123', descriptionHtml: '<p>Descricao correta.</p>' },
    ] });
    return json({ descriptionPlain: 'Produto.', lists: [{ text: 'Requisitos', content: '<p>Pesquisa.</p>' }] });
  };
  assert.equal(await descricaoDaOrigem('https://jobs.ashbyhq.com/example/123', { fetchImpl }), 'Descricao correta.');
  assert.equal(await descricaoDaOrigem('https://jobs.lever.co/example/123', { fetchImpl }), 'Produto. Requisitos Pesquisa.');
  assert.deepEqual(chamadas, [
    'https://api.ashbyhq.com/posting-api/job-board/example',
    'https://api.lever.co/v0/postings/example/123',
  ]);
});

test('redirect de API nao e seguido e resposta ja redirecionada nao e aceita', async () => {
  for (const resposta of [
    new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } }),
    Object.defineProperty(json({ content: 'Nao confiar.' }), 'redirected', { value: true }),
  ]) {
    let chamadas = 0;
    await assert.rejects(descricaoDaOrigem('https://boards.greenhouse.io/example/jobs/123', {
      fetchImpl: async (url, opts) => { chamadas++; assert.equal(opts.redirect, 'error'); return resposta; },
    }), /recusada/);
    assert.equal(chamadas, 1);
  }
});

test('coleta deixa origem desconhecida pendente e so consulta paginas UX Jobs permitidas', async () => {
  const chamadas = [];
  const r = await coletar({ pausaMs: 0, fetchImpl: async (url, opts) => {
    chamadas.push(url); assert.equal(opts.redirect, 'error');
    return new Response(url === 'https://jobs.uxjobs.io/' ? home([item()]) : '<p>Descricao na origem.</p>');
  } });
  assert.deepEqual(chamadas, ['https://jobs.uxjobs.io/', 'https://jobs.uxjobs.io/jobs/senior-product-designer-example/']);
  assert.equal(r.vagas.length, 1);
  assert.equal(r.vagas[0].descricao, null);
  assert.equal(r.vagas[0].descricaoPendente, true);
  assert.equal(r.vagas[0].link, 'https://careers.example.com/jobs/design');
});

test('redirect da home ou detalhe UX Jobs vira falha sem nova requisicao ao destino', async () => {
  for (const redirecionarHome of [true, false]) {
    const chamadas = [];
    const r = await coletar({ pausaMs: 0, fetchImpl: async (url, opts) => {
      chamadas.push(url); assert.equal(opts.redirect, 'error');
      if (!redirecionarHome && url === 'https://jobs.uxjobs.io/') return new Response(home([item()]));
      return new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } });
    } });
    assert.equal(chamadas.length, redirecionarHome ? 1 : 2);
    assert.equal(r.contador.falhas, 1);
    if (!redirecionarHome) assert.equal(r.vagas[0].descricaoPendente, true);
  }
});

test('prazo tambem interrompe corpo travado depois dos cabecalhos', async () => {
  let sinal, cancelado = false;
  await assert.rejects(descricaoDaOrigem('https://boards.greenhouse.io/example/jobs/123', {
    timeoutMs: 15,
    fetchImpl: async (_, opts) => {
      sinal = opts.signal;
      return new Response(new ReadableStream({ cancel() { cancelado = true; } }));
    },
  }), /Prazo/);
  assert.equal(sinal.aborted, true);
  assert.equal(cancelado, true);
});

test('corpo acima de 5 MiB e recusado com ou sem content-length', async () => {
  for (const comHeader of [true, false]) {
    let cancelado = false;
    const resposta = new Response(new ReadableStream({
      start(controller) { if (!comHeader) controller.enqueue(new Uint8Array(5 * 1024 * 1024 + 1)); },
      cancel() { cancelado = true; },
    }), { headers: comHeader ? { 'Content-Length': String(5 * 1024 * 1024 + 1) } : {} });
    await assert.rejects(descricaoDaOrigem('https://boards.greenhouse.io/example/jobs/123', {
      fetchImpl: async () => resposta,
    }), /limite/);
    if (!comHeader) assert.equal(cancelado, true);
  }
});
