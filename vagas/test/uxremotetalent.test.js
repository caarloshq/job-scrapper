import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerItens, lerData, aceitaBrasil, ehContrato, paraVaga, lerDetalhe } from '../src/fontes/uxremotetalent.js';

// HTML real, copiado da home em 2026-08-25. Tres itens de proposito:
// um "USA Only", um "Latin America Only", e um SEM restricao declarada, que e
// exatamente o caso que quebrava a leitura por posicao.
const HTML = `
<div role="listitem" class="collection-item-2 w-dyn-item"><a href="/ux-job/graphic-designer-6" class="job-container w-inline-block"><div class="job-description-wrapper"><h2 class="regular-job-title">Graphic Designer</h2><div class="job-info-container"><div class="card-job-detail"><div class="regular-job-info">USA Only</div></div><div class="card-job-detail"><div class="regular-job-info">Full-time</div></div><div class="card-job-detail card-company-name"><div class="regular-job-info">Afina</div></div></div></div><div class="job-description-right"><div class="regular-job-info date">August 25, 2026</div></div></a></div>
<div role="listitem" class="collection-item-2 w-dyn-item"><a href="/ux-job/senior-product-designer-16" class="job-container w-inline-block"><div class="job-description-wrapper"><h2 class="regular-job-title">Senior Product Designer</h2><div class="job-info-container"><div class="card-job-detail"><div class="regular-job-info">Latin America Only</div></div><div class="card-job-detail"><div class="regular-job-info">Full-time</div></div><div class="card-job-detail card-company-name"><div class="regular-job-info">DevSavant</div></div></div></div><div class="job-description-right"><div class="regular-job-info date">August 21, 2026</div></div></a></div>
<div role="listitem" class="collection-item-2 w-dyn-item"><a href="/ux-job/ui-ux-designer-for-ai-training-projects" class="job-container w-inline-block"><div class="job-description-wrapper"><h2 class="regular-job-title">UI/UX Designer for AI Training Projects</h2><div class="job-info-container"><div class="card-job-detail"><div class="regular-job-info">Part-time</div></div><div class="card-job-detail card-company-name"><div class="regular-job-info">OpenTrain AI</div></div></div></div><div class="job-description-right"><div class="regular-job-info date">August 24, 2026</div></div></a></div>
`;

test('le os tres itens com cargo, empresa e link', () => {
  const i = lerItens(HTML);
  assert.equal(i.length, 3);
  assert.equal(i[0].titulo, 'Graphic Designer');
  assert.equal(i[0].empresa, 'Afina');
  assert.equal(i[0].link, 'https://www.uxremotetalent.com/ux-job/graphic-designer-6');
  assert.equal(i[1].empresa, 'DevSavant');
});

test('vaga SEM restricao de pais nao rouba o contrato para o campo de restricao', () => {
  // O bug que isto pega: lendo por posicao, "Part-time" virava restricao de
  // pais na vaga da OpenTrain AI. Nao descartava a vaga, mas gravava dado que
  // nao existe no anuncio, que e a regra 1 do projeto quebrada em silencio.
  const semRestricao = lerItens(HTML).find((x) => /AI Training/.test(x.titulo));
  assert.equal(semRestricao.restricao, null, 'restricao tem que ficar vazia');
  assert.equal(semRestricao.contrato, 'Part-time', 'o contrato e que e Part-time');
});

test('restricao e contrato nao se confundem em nenhum item', () => {
  for (const i of lerItens(HTML)) {
    assert.equal(ehContrato(i.restricao), false, `"${i.restricao}" nao pode ser restricao de pais`);
  }
});

test('a restricao de pais decide quem entra, e a lista e fechada', () => {
  assert.equal(aceitaBrasil('Anywhere in the World'), true);
  assert.equal(aceitaBrasil('Latin America Only'), true);
  assert.equal(aceitaBrasil('USA Only'), false);
  assert.equal(aceitaBrasil('Europe Only'), false);
  // ARMADILHA: "America" aparece no texto e mesmo assim o Brasil esta fora.
  assert.equal(aceitaBrasil('North America Only'), false);
  assert.equal(aceitaBrasil('Canada Only'), false);
});

test('rotulo novo cai no desconhecido e PASSA, nunca no descarte', () => {
  // Descartar por falta de dado ja jogou fora 57 vagas boas neste projeto.
  assert.equal(aceitaBrasil('Mars Only'), null);
  assert.equal(aceitaBrasil(''), null);
  assert.equal(aceitaBrasil(null), null);
  const v = paraVaga({ slug: 'x', titulo: 'T', empresa: 'E', link: 'l', restricao: 'Mars Only', data: null });
  assert.equal(v.aceitaBrasil, null, 'desconhecido nao e false');
});

test('a vaga sai marcada como remota, com o id da fonte', () => {
  const v = paraVaga(lerItens(HTML)[1]);
  assert.equal(v.idExterno, 'uxremotetalent:senior-product-designer-16');
  assert.equal(v.fonte, 'UX Remote Talent');
  assert.equal(v.modelo, 'remoto');
  assert.equal(v.remoto, true);
  assert.equal(v.aceitaBrasil, true);
  assert.equal(v.descricaoPendente, true, 'a descricao so vem no passo 2');
});

test('data em ingles vira ISO, e texto nao reconhecido vira null e NUNCA hoje', () => {
  assert.equal(lerData('August 25, 2026'), '2026-08-25T00:00:00.000Z');
  assert.equal(lerData('January 2, 2026'), '2026-01-02T00:00:00.000Z');
  // Data inventada faz vaga velha parecer nova, que e o erro que a camada 4 ja pagou.
  assert.equal(lerData('semana passada'), null);
  assert.equal(lerData(''), null);
  assert.equal(lerData(null), null);
});

test('lerDetalhe so aceita texto de verdade', () => {
  assert.equal(lerDetalhe('<div>sem bloco</div>'), null);
  assert.equal(lerDetalhe(null), null);
  const bom = '<div class="rich-text-block w-richtext"><p>' + 'a'.repeat(80) + '</p></div>';
  assert.ok(String(lerDetalhe(bom)).length > 40);
});
