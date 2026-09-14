import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerStatus, estaViva, lerData, lerTitulo } from '../src/liveness.js';
import { lerRss } from '../src/fontes/vagasremotas.js';
import { limparHtml } from '../src/util.js';

test('le o campo status', () => {
  assert.equal(lerStatus('...{"id":1,"status":"published","x":2}...'), 'published');
  assert.equal(lerStatus('...{"status":"frozen"}...'), 'frozen');
  assert.equal(lerStatus('sem status nenhum'), null);
});

test('published e viva, frozen e morta', () => {
  // Medido em 2026-07-29: localiza.gupy.io/jobs/11130005 serviu "frozen",
  // gruposysmap.gupy.io serviu "published".
  assert.equal(estaViva('published'), true);
  assert.equal(estaViva('frozen'), false);
  assert.equal(estaViva('closed'), false);
});

test('status desconhecido nao e o mesmo que morto', () => {
  assert.equal(estaViva(null), null);
  assert.notEqual(estaViva(null), false);
});

test('ARMADILHA: a string "Inscricoes encerradas" aparece nas duas paginas', () => {
  // Este teste existe para impedir que alguem volte a usar a string como sinal.
  // Ela e label do bundle e vem no HTML de vaga viva TAMBEM. Usa-la descarta tudo.
  const htmlViva = '<html>...Inscrições encerradas...{"status":"published"}</html>';
  const htmlMorta = '<html>...Inscrições encerradas...{"status":"frozen"}</html>';

  assert.ok(htmlViva.includes('Inscrições encerradas'));
  assert.ok(htmlMorta.includes('Inscrições encerradas'));

  assert.equal(estaViva(lerStatus(htmlViva)), true);
  assert.equal(estaViva(lerStatus(htmlMorta)), false);
});

test('le data de publicacao do HTML', () => {
  assert.equal(lerData('{"publishedDate":"2026-04-20T10:00:00.000Z"}').slice(0, 10), '2026-04-20');
  assert.equal(lerData('{"publishedAt":"2026-07-01T10:00:00.000Z"}').slice(0, 10), '2026-07-01');
  assert.equal(lerData('sem data'), null);
});

test('le o titulo limpando o prefixo do Gupy', () => {
  assert.equal(lerTitulo('<title>Job Page | PRODUCT DESIGNER SÊNIOR | REMOTO</title>'), 'PRODUCT DESIGNER SÊNIOR | REMOTO');
  assert.equal(lerTitulo('<title>Página da Vaga | Product Designer</title>'), 'Product Designer');
});

test('parser de RSS do WP Job Manager', () => {
  const xml = `<rss><channel>
    <item>
      <title><![CDATA[Product Designer Sênior]]></title>
      <link>https://vagasremotas.com.br/vaga/product-designer-senior/</link>
      <description><![CDATA[<p>Vaga <b>remota</b> para designer.</p>]]></description>
      <pubDate>Tue, 28 Jul 2026 10:00:00 +0000</pubDate>
    </item>
    <item>
      <title>UX Designer</title>
      <link>https://vagasremotas.com.br/vaga/ux-designer/</link>
      <pubDate>Mon, 27 Jul 2026 10:00:00 +0000</pubDate>
    </item>
  </channel></rss>`;

  const itens = lerRss(xml);
  assert.equal(itens.length, 2);
  assert.equal(itens[0].titulo, 'Product Designer Sênior');
  assert.equal(itens[0].descricao, 'Vaga remota para designer.');
  assert.ok(itens[0].link.startsWith('https://'));
});

test('RSS vazio ou invalido nao estoura', () => {
  assert.deepEqual(lerRss(''), []);
  assert.deepEqual(lerRss(null), []);
  assert.deepEqual(lerRss('<rss><channel></channel></rss>'), []);
});

test('decodifica entidade nomeada do Latin-1', () => {
  assert.equal(limparHtml('concep&ccedil;&atilde;o de solu&ccedil;&otilde;es'), 'concepção de soluções');
  assert.equal(limparHtml('Product Designer S&ecirc;nior'), 'Product Designer Sênior');
  assert.equal(limparHtml('Design System que sustenta tudo &mdash; atuando'), 'Design System que sustenta tudo — atuando');
});

test('Vagas Remotas: rotulo de dolar so casa no texto limpo', async () => {
  const { pagaEmDolar } = await import('../src/fontes/vagasremotas.js');
  // No HTML cru o rotulo vem partido por tag, entao o regex falhava em silencio.
  assert.equal(pagaEmDolar('<h2>Senior Product Designer</h2><span>Vaga em</span> <b>Dólar</b>'), true);
  assert.equal(pagaEmDolar('<h2>Product Designer</h2><span>CLT</span>'), false);
});

test('tag escapada do Greenhouse não vaza como texto', () => {
  // A ordem importa: decodificar vem primeiro. A vaga da Arco chegou na fila
  // com `<div class="content-intro">` cru no meio da descrição.
  const greenhouse = '&lt;div class="content-intro"&gt;&lt;strong&gt;Arcotech&lt;/strong&gt; time de tecnologia&lt;/div&gt;';
  const limpo = limparHtml(greenhouse);
  assert.equal(limpo.includes('<div'), false, 'tag escapada tem que sumir');
  assert.equal(limpo.includes('class='), false);
  assert.match(limpo, /Arcotech.*time de tecnologia/);
});
