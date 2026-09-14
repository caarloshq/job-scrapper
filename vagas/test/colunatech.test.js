import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partirTitulo } from '../src/fontes/colunatech.js';

test('separa cargo e empresa do padrao do site', () => {
  // Titulos reais colhidos em 2026-07-30.
  assert.deepEqual(partirTitulo('Vaga home office: Analista Contábil Pleno na Asaas'), {
    cargo: 'Analista Contábil Pleno',
    empresa: 'Asaas',
  });
  assert.deepEqual(partirTitulo('Vaga Home Office: Analista de Atendimento Pleno na Nstech'), {
    cargo: 'Analista de Atendimento Pleno',
    empresa: 'Nstech',
  });
});

test('corta o sufixo de salario depois do travessao', () => {
  const r = partirTitulo('Vaga home office: Estágio Desenvolvedor Full Stack na V360 &#8211; bolsa de R$ 2.300');
  assert.equal(r.empresa, 'V360');
  assert.match(r.cargo, /Estágio Desenvolvedor Full Stack/);
});

test('titulo sem o padrao "na <empresa>" nao inventa empresa', () => {
  const r = partirTitulo('Grupo QuintoAndar Abre Vaga Home Office para Analista de Planejamento');
  assert.equal(r.empresa, null);
  assert.ok(r.cargo.length > 0);
});

test('entidades HTML sao limpas', () => {
  const r = partirTitulo('Vaga home office: Product Designer S&#234;nior na Acme');
  assert.equal(r.empresa, 'Acme');
});

test('requisitos da Remotar vêm como array de objetos, não como string', async () => {
  const { requisitos } = await import('../src/fontes/remotar.js');
  // Caso real: join() no array produzia "[object Object]" e APAGAVA os oito
  // requisitos da vaga, que são o que a leitura semântica usa para decidir.
  const bruto = [
    { id: 1, description: 'Experiência em UX/Product Design de produtos digitais B2B.' },
    { id: 2, description: 'Domínio de Figma e Design Systems.' },
  ];
  const t = requisitos(bruto);
  assert.match(t, /UX\/Product Design/);
  assert.match(t, /Design Systems/);
  assert.doesNotMatch(t, /\[object Object\]/);

  assert.equal(requisitos('já é texto'), 'já é texto');
  assert.equal(requisitos(null), null);
  assert.equal(requisitos([]), null);
});
