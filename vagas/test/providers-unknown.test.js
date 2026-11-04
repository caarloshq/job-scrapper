import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coletarDe } from '../src/fontes/gringas.js';
import { juntar } from '../src/dedupe.js';
import nodesk, { parseNodeskFeed } from '../src/fontes/careerops/providers/nodesk.mjs';
import wwr, { parseWwrFeed } from '../src/fontes/careerops/providers/weworkremotely.mjs';
import jobicy, { parseJobicyResponse } from '../src/fontes/careerops/providers/jobicy.mjs';

// Providers reais e adaptador real, com transporte inteiramente simulado.
const criterios = { titulo_aceito: { 'product owner': 20 }, titulo_excluido: [] };
const rss = (host, tituloConhecido) => `<rss><channel>
  <item><title>Product Owner</title><link>https://${host}/remote-jobs/unknown-a</link></item>
  <item><title>Product Owner</title><link>https://${host}/remote-jobs/unknown-b</link></item>
  <item><title>${tituloConhecido}</title><link>https://${host}/remote-jobs/known</link></item>
</channel></rss>`;
const fixtures = [
  { id: 'nodesk', nome: 'NoDesk', provider: nodesk, parser: parseNodeskFeed, dados: rss('nodesk.co', 'Senior Product Owner at Empresa fictícia') },
  { id: 'weworkremotely', nome: 'We Work Remotely', provider: wwr, parser: parseWwrFeed, dados: rss('weworkremotely.com', 'Empresa fictícia: Senior Product Owner') },
  { id: 'jobicy', nome: 'Jobicy', provider: jobicy, parser: parseJobicyResponse, dados: { jobs: [
    { jobTitle: 'Product Owner', url: 'https://jobicy.com/jobs/unknown-a', jobGeo: 'Worldwide' },
    { jobTitle: 'Product Owner', url: 'https://jobicy.com/jobs/unknown-b', jobGeo: 'Worldwide', companyName: '  ' },
    { jobTitle: 'Senior Product Owner', url: 'https://jobicy.com/jobs/known', jobGeo: 'Worldwide', companyName: 'Empresa fictícia' },
  ] } },
];

for (const f of fixtures) {
  test(`${f.nome}: provider até adaptador preserva empresa nula e não funde desconhecidos`, async () => {
    let chamadas = 0;
    const transporte = async (_url, opts) => {
      chamadas++;
      assert.equal(opts.redirect, 'error');
      return f.dados;
    };
    const result = await coletarDe([{ name: f.nome, provider: f.id, enabled: true }],
      async () => f.provider, { fetchText: transporte, fetchJson: transporte }, criterios);
    assert.equal(chamadas, 1);
    assert.equal(result.contador.falhas, 0);
    assert.equal(result.vagas.length, 3);
    assert.deepEqual(result.vagas.map(v => v.empresa), [null, null, 'Empresa fictícia']);
    assert.ok(result.vagas.every(v => v.fonte === f.nome));
    assert.ok(result.vagas.every(v => v.publicadaEm === null && v.salarioBruto === null));
    assert.equal(juntar(result.vagas).vagas.length, 3);
  });

  test(`${f.nome}: parser não usa rótulo de board como empregador`, () => {
    // Um segundo argumento legado não pode reintroduzir o fallback removido.
    const itens = f.parser(f.dados, f.nome);
    assert.deepEqual(itens.map(v => v.company), [null, null, 'Empresa fictícia']);
  });
}
