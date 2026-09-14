import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugVaga, urlPublica } from '../src/fontes/inhire.js';

test('slug bate com as URLs reais que o Google indexa', () => {
  // Colhidas por site:inhire.app em 2026-07-30.
  const casos = [
    ['Product Designer (UX/UI) - Vaga Temporária', 'product-designer-uxui-vaga-temporaria'],
    ['Product Designer Especialista', 'product-designer-especialista'],
    ['Estágio em Product Designer (Vaga Híbrida)', 'estagio-em-product-designer-vaga-hibrida'],
    ['Product Designer Sênior - UX/UI', 'product-designer-senior-uxui'],
    ['Product Designer Sênior', 'product-designer-senior'],
    ['Product Designer Junior', 'product-designer-junior'],
    // "|" vira "or" no charmap do slugify, que a InHire usa
    ['Product Designer | Senior', 'product-designer-or-senior'],
    ['Product Designer | Remoto', 'product-designer-or-remoto'],
    // vindas da Remotar, ja com o slug canonico no link
    ['Product Designer Sênior (IA Generativa) - Projeto Temporário ', 'product-designer-senior-ia-generativa-projeto-temporario'],
    ['Profissional Product Designer (IA) Sênior - Remoto', 'profissional-product-designer-ia-senior-remoto'],
  ];
  for (const [nome, esperado] of casos) {
    assert.equal(slugVaga(nome), esperado, `slug de "${nome}"`);
  }
});

test('espaco no fim e acento nao vazam', () => {
  assert.equal(slugVaga('Staff Product Designer '), 'staff-product-designer');
  assert.equal(slugVaga('  Designer de Produto  '), 'designer-de-produto');
});

test('nome vazio ou so simbolo cai no fallback, porque o slug nao pode faltar', () => {
  // Sem segmento de slug a rota da InHire nao casa e a pagina renderiza vazia.
  assert.equal(slugVaga(''), 'vaga');
  assert.equal(slugVaga(null), 'vaga');
  assert.equal(slugVaga('///'), 'vaga');
});

test('urlPublica sempre tem o segmento de slug', () => {
  const u = urlPublica('lastlink', '0d1db9fd-411e-4ecd-9f95-b229a56775ff', 'Staff Product Designer ');
  assert.equal(u, 'https://lastlink.inhire.app/vagas/0d1db9fd-411e-4ecd-9f95-b229a56775ff/staff-product-designer');
  // caso degenerado nao pode gerar URL terminando no uuid
  assert.match(urlPublica('x', 'abc', ''), /\/vagas\/abc\/vaga$/);
});
