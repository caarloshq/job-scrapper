import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lerNextData, lerArcJobs, urlPublica, montarSalario, aceitaBrasil, estaAberta, limparMarkdown, paraVaga, ROTAS,
  paraIso,
} from '../src/fontes/arc.js';

// Recorte real do __NEXT_DATA__ de arc.dev/remote-jobs/product-design,
// colhido em 2026-08-25. Traz os DOIS acervos de proposito.
const NEXT = {
  props: {
    pageProps: {
      arcJobs: [
        {
          randomKey: 'pe4y4lbxex',
          title: 'Senior UX / Product Designer (NA/LATAM - PT)',
          urlString: 'senior-ux-product-designer-na-latam-pt',
          requiredCountries: ['BR', 'MX', 'AR', 'US'],
          experienceLevel: 'senior',
          minHourlyRate: 30,
          maxHourlyRate: 50,
          minAnnualSalary: null,
          maxAnnualSalary: null,
          postedAt: 1787338811,
          company: { randomKey: null },
        },
      ],
      externalJobs: [
        {
          randomKey: 'pf1wga3n1s',
          title: 'Senior Product Designer (B2C Payments/FinTech)',
          urlString: 'few-far-senior-product-designer-b2c-payments-fintech',
          requiredCountries: ['US'],
          postedAt: 1787652629,
          company: { name: 'Few&Far' },
        },
      ],
      totalExternalJobCount: 994,
    },
  },
};
const HTML = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(NEXT)}</script></body></html>`;

test('le o JSON que o Next serve embutido na pagina', () => {
  assert.equal(lerNextData(HTML).props.pageProps.totalExternalJobCount, 994);
  assert.equal(lerNextData('<html>nada aqui</html>'), null);
  assert.equal(lerNextData(null), null);
});

test('SO as vagas proprias do Arc entram, nunca as agregadas', () => {
  // As agregadas nao tem link: a rota /details/ devolve 404 para elas. Publicar
  // uma seria por no board uma linha onde nao da para se candidatar.
  const j = lerArcJobs(HTML);
  assert.equal(j.length, 1);
  assert.equal(j[0].randomKey, 'pe4y4lbxex');
  assert.ok(!j.some((x) => x.randomKey === 'pf1wga3n1s'), 'vaga agregada nao pode entrar');
});

test('a URL da vaga leva a chave no fim, senao a pagina nao existe', () => {
  assert.equal(
    urlPublica('senior-ux-product-designer-na-latam-pt', 'pe4y4lbxex'),
    'https://arc.dev/remote-jobs/details/senior-ux-product-designer-na-latam-pt-pe4y4lbxex',
  );
});

test('faixa por hora viaja com o periodo, senao vira descarte silencioso', () => {
  // Sem `type: hour`, "30 a 50 por hora" e lido como um salario de 30 e a vaga
  // cai abaixo do piso de R$ 8.000 sem ninguem perceber.
  assert.deepEqual(montarSalario({ minHourlyRate: 30, maxHourlyRate: 50 }), {
    from: 30, to: 50, currency: 'USD', type: 'hour',
  });
  // O anual e menos ambiguo, entao ele ganha quando os dois existem.
  assert.deepEqual(montarSalario({ minAnnualSalary: 90000, maxAnnualSalary: 120000, minHourlyRate: 30 }), {
    from: 90000, to: 120000, currency: 'USD', type: 'year',
  });
  assert.equal(montarSalario({}), null);
  assert.equal(montarSalario(null), null);
});

test('pais aceito: lista vazia passa, lista sem BR barra', () => {
  assert.equal(aceitaBrasil(['BR', 'US']), true);
  assert.equal(aceitaBrasil(['US', 'CA']), false);
  // Sem restricao declarada a vaga passa: ausencia de dado nao e criterio.
  assert.equal(aceitaBrasil([]), true);
  assert.equal(aceitaBrasil(null), true);
});

test('o portao de vida vem de graca, do proprio campo da fonte', () => {
  assert.equal(estaAberta({ closed: true }), false);
  assert.equal(estaAberta({ aasmState: 'published' }), true);
  assert.equal(estaAberta({ aasmState: 'closed' }), false);
  assert.equal(estaAberta({ state: 'archived' }), false);
  // Desconhecido nao e o mesmo que morto.
  assert.equal(estaAberta({}), true);
});

test('markdown da descricao vira texto, sem sobrar marcacao', () => {
  const md = '### Role Overview\nWe want a **Senior Designer** with [Figma](https://figma.com) skill.';
  const t = limparMarkdown(md);
  assert.ok(!/[#*`]/.test(t), 'nao pode sobrar marcacao: ' + t);
  assert.ok(t.includes('Senior Designer'));
  assert.ok(t.includes('Figma'), 'o texto do link fica, a URL sai');
  assert.ok(!t.includes('figma.com'));
  assert.equal(limparMarkdown(''), null);
});

test('a vaga sai remota, com id da fonte e data convertida do unix', () => {
  const v = paraVaga(lerArcJobs(HTML)[0], null);
  assert.equal(v.idExterno, 'arc:pe4y4lbxex');
  assert.equal(v.fonte, 'Arc');
  assert.equal(v.modelo, 'remoto');
  assert.equal(v.remoto, true);
  assert.equal(v.pais, 'Brasil', 'aceita BR, entao o pais util e Brasil');
  // Valor LITERAL, nao a mesma conta dos dois lados. A versao anterior deste
  // assert comparava a conversao com ela mesma e passava mesmo com o bug.
  assert.equal(v.publicadaEm, '2026-08-21T19:00:11.000Z');
  assert.equal(v.encerrada, false);
  assert.deepEqual(v.salarioBruto, { from: 30, to: 50, currency: 'USD', type: 'hour' });
});

test('data em unix vira ISO, venha ela de postedAt ou de createdAt', () => {
  // O BUG QUE ISTO PEGA: a pagina de detalhe do Arc NAO repete `postedAt`. La o
  // campo e `createdAt`, e continua sendo numero. A primeira versao devolvia o
  // numero cru, o frescor lia como vaga antiquissima e as 5 vagas do Arc eram
  // descartadas como "zumbi: mais de 45 dias". A fonte sumia inteira, calada.
  assert.equal(paraIso(1787338811), '2026-08-21T19:00:11.000Z');
  const soCreatedAt = paraVaga(
    { randomKey: 'k', title: 'T', urlString: 'u', createdAt: 1787338811, requiredCountries: ['BR'] },
    null,
  );
  assert.equal(soCreatedAt.publicadaEm, '2026-08-21T19:00:11.000Z', 'createdAt tambem tem que virar ISO');
  assert.equal(typeof soCreatedAt.publicadaEm, 'string', 'nunca pode sair numero cru');
  // Texto ja em ISO passa direto, e ausencia vira null, nunca hoje.
  assert.equal(paraIso('2026-08-21T19:00:11.000Z'), '2026-08-21T19:00:11.000Z');
  assert.equal(paraIso(null), null);
  assert.equal(paraIso(0), null);
});

test('as rotas de categoria sao as que existem de verdade', () => {
  // `design` e `designer` devolvem 308 para a lista geral: nao sao categoria.
  assert.ok(ROTAS.includes('product-design'));
  assert.ok(ROTAS.includes('ux-design'));
  assert.ok(!ROTAS.includes('design'), 'design nao e rota valida');
  assert.ok(!ROTAS.includes('designer'), 'designer nao e rota valida');
});
