import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcular, pontosSinais, pontosTitulo, pontosDominio, exigenciaIngles, compatibilidade, faixa } from '../src/score.js';

const agora = new Date('2026-07-29T12:00:00Z');
const base = (extra = {}) => ({
  titulo: 'Product Designer Sênior',
  empresa: 'Empresa X',
  descricao: 'plataforma saas b2b',
  publicadaEm: new Date(agora.getTime() - 2 * 86400000).toISOString(),
  ...extra,
});

test('product designer vale mais que designer genérico', () => {
  assert.equal(pontosTitulo('Product Designer'), 20);
  assert.equal(pontosTitulo('UX Designer'), 16);
  assert.equal(pontosTitulo('UI Designer'), 10);
  assert.equal(pontosTitulo('Designer'), 4);
});

test('dominio: fintech 10, saas 7, outro 3', () => {
  assert.equal(pontosDominio('fintech de credito regulado pela CVM'), 10);
  assert.equal(pontosDominio('plataforma saas b2b'), 7);
  assert.equal(pontosDominio('loja de moveis'), 3);
});

test('fintech pontua exatamente 7 pontos a mais que "outro"', () => {
  const fin = calcular(base({ descricao: 'fintech de credito' }), agora);
  const gen = calcular(base({ descricao: 'loja de moveis' }), agora);
  assert.equal(fin.parcelas.dominio - gen.parcelas.dominio, 7);
});

test('score deterministico fica entre 0 e 60', () => {
  const cheio = calcular(
    base({
      titulo: 'Senior Product Designer',
      descricao: 'fintech credito design system design ops tokens discovery research usabilidade figma b2b dashboard do zero IA',
      publicadaEm: agora.toISOString(),
    }),
    agora
  );
  assert.ok(cheio.determinado > 0 && cheio.determinado <= 60, `fora da faixa: ${cheio.determinado}`);
  assert.equal(cheio.parcelas.titulo, 20);
  assert.equal(cheio.parcelas.frescor, 5);
});

test('ingles nao bloqueia: virou desconto leve', () => {
  assert.equal(exigenciaIngles('we require fluent english'), 'forte');
  assert.equal(exigenciaIngles('english is a plus'), 'desejavel');
  assert.equal(exigenciaIngles('trabalho em portugues'), 'nenhuma');

  const comIngles = calcular(base({ descricao: 'saas b2b, advanced english required' }), agora);
  const semIngles = calcular(base({ descricao: 'saas b2b' }), agora);
  assert.equal(comIngles.descontoIngles, 4);
  assert.ok(comIngles.determinado < semIngles.determinado);
  assert.ok(comIngles.determinado > 0, 'ingles nunca deve zerar a vaga');
});

test('vaga nao validada tem teto de 55%', () => {
  const v = { ...base(), validada: false, score: { determinado: 55 } };
  assert.equal(compatibilidade(v, 40), 55);
});

test('vaga de fonte solta tem teto de 60%', () => {
  const v = { ...base(), fonte: 'Solta', validada: true, score: { determinado: 55 } };
  assert.equal(compatibilidade(v, 40), 60);
});

test('faixas', () => {
  assert.equal(faixa(80), 'Aplicar ja');
  assert.equal(faixa(60), 'Vale olhar');
  assert.equal(faixa(45), 'Radar');
  assert.equal(faixa(20), 'Fora');
});


test('palavras comuns não inventam sinais de IA nem domínio financeiro', () => {
  assert.deepEqual(pontosSinais('Designer com experiencia em email e materiais'), { pontos: 0, achados: [] });
  assert.equal(pontosDominio('Vale refeição, plano de saúde e banco de horas'), 3);
  assert.equal(pontosDominio('Manutenção de banco de dados e seguros de vida como benefício'), 3);
  assert.equal(pontosDominio('Banco de horas. Produto de crédito para um banco digital.'), 10);
  assert.equal(pontosDominio('Produto de seguros de vida para clientes individuais'), 10);
});

test('sinônimos e traduções somam uma competência, mantendo competências distintas', () => {
  assert.equal(pontosSinais('IA, AI e inteligência artificial').pontos, 1.5);
  assert.equal(pontosSinais('research, pesquisa, usability, usabilidade, design ops e designops').pontos, 4.5);
  assert.equal(pontosSinais('0 to 1, do zero e zero a um').pontos, 1.5);
  assert.equal(pontosSinais('AI e LLM').pontos, 3);
  assert.equal(pontosSinais('Design systems, tokens, Figma e dashboards').pontos, 6);
});

test('siglas e termos de inglês respeitam fronteiras de palavra', () => {
  assert.equal(exigenciaIngles('Atuar no time abc123 em uma plataforma b2c2'), 'nenhuma');
  assert.equal(exigenciaIngles('English C1/C2 required'), 'forte');
});
