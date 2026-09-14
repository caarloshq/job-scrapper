import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realceDeBaldes, gerar } from '../src/instrucao.js';

// Fixture deliberadamente diferente do currículo seu — a prova de que
// o mapa de ênfase parou de falar da carreira de quem construiu o sistema.
const baseFixture = {
  name: 'Fulana de Tal',
  numeros_travados: ['99% de uptime', '3x mais rápido'],
  regras_extra: ['Cargo atual = Engenheira de Dados Sênior.'],
  experience: [
    {
      role: 'Engenheira de Dados Sênior',
      company: 'Empresa X',
      bullets: [
        'Construiu pipeline de dados do zero',
        'Reduziu custo de infraestrutura em 40%',
      ],
      bullets_temas: [
        ['zero-a-um'],
        ['metricas'],
      ],
    },
  ],
};

test('realceDeBaldes só traz bullet marcado com o tema do balde', () => {
  const baldes = [
    { id: 'zero-a-um', gatilhos: ['do zero'], acertos: ['do zero'] },
    { id: 'metricas', gatilhos: ['resultado'], acertos: ['resultado'] },
    { id: 'design-system', gatilhos: ['design system'], acertos: ['design system'] },
  ];
  const r = realceDeBaldes(baldes, baseFixture);

  const zeroAUm = r.find((b) => b.id === 'zero-a-um');
  assert.equal(zeroAUm.bullets.length, 1);
  assert.equal(zeroAUm.bullets[0].texto, 'Construiu pipeline de dados do zero');

  const designSystem = r.find((b) => b.id === 'design-system');
  assert.equal(designSystem.bullets.length, 0, 'sem bullet marcado, sem realce — nunca inventa');
});

test('bullets sem bullets_temas correspondente (schema desalinhado) nao quebra nem casa por acidente', () => {
  const desalinhado = {
    ...baseFixture,
    experience: [
      {
        ...baseFixture.experience[0],
        bullets: [
          'Construiu pipeline de dados do zero',
          'Reduziu custo de infraestrutura em 40%',
          'Bullet extra sem tema declarado', // 3 bullets, so 2 entradas em bullets_temas
        ],
        bullets_temas: [['zero-a-um'], ['metricas']],
      },
    ],
  };
  const baldes = [{ id: 'zero-a-um', gatilhos: [], acertos: [] }, { id: 'ia', gatilhos: [], acertos: [] }];
  const r = realceDeBaldes(baldes, desalinhado);

  const zeroAUm = r.find((b) => b.id === 'zero-a-um');
  assert.equal(zeroAUm.bullets.length, 1, 'so o bullet marcado entra, o extra sem tema fica de fora');
  const ia = r.find((b) => b.id === 'ia');
  assert.equal(ia.bullets.length, 0, 'bullet extra sem tema nao casa em nenhum balde por acidente');
});

test('sem base_content, todo balde vem vazio, sem quebrar', () => {
  const r = realceDeBaldes([{ id: 'ia', gatilhos: [], acertos: [] }], null);
  assert.equal(r[0].bullets.length, 0);
});

test('gerar() usa números travados e regras da PESSOA, nunca seu', () => {
  const vaga = {
    idExterno: 'teste:1', titulo: 'Engenheira de Dados', empresa: 'Acme',
    descricao: 'Construir pipeline de dados do zero, com resultado mensurável.',
    link: 'https://x', fonte: 'Teste', compatibilidade: 80,
  };
  const md = gerar(vaga, { baseContent: baseFixture });

  assert.ok(md.includes('99% de uptime'), 'número travado da fixture tem que aparecer');
  assert.ok(md.includes('Cargo atual = Engenheira de Dados Sênior.'), 'regra extra da fixture tem que aparecer');
  assert.ok(!md.includes('R$ 9,99 bi'), 'número de outra pessoa NUNCA pode vazar: só o da fixture aparece');
  assert.ok(!md.includes('Empresa Alheia'), 'empresa de outra pessoa NUNCA pode vazar: só a da fixture aparece');
  assert.ok(md.includes('Fulana de Tal'), 'nome de quem roda tem que aparecer no caminho do PDF sugerido');
});

test('balde acionado sem bullet correspondente some do plano de ênfase, não aparece vazio', () => {
  const vaga = {
    idExterno: 'teste:2', titulo: 'Designer', empresa: 'Acme',
    descricao: 'Precisa de forte cultura de design system e token.',
    link: 'https://x', fonte: 'Teste',
  };
  const md = gerar(vaga, { baseContent: baseFixture });
  assert.ok(!md.includes('### design-system'), 'balde sem bullet da pessoa não deve virar seção');
});


test('instrução exige seleção editorial, fontes e restrições sem converter nota em probabilidade', () => {
  const md = gerar({ idExterno: 'teste:3', empresa: 'Acme', titulo: 'Designer', descricao: 'Design system', compatibilidade: 80 }, { baseContent: baseFixture });
  assert.ok(md.includes('uma ou duas provas verificadas'));
  assert.ok(md.includes('decisoes.json'));
  assert.ok(md.includes('nunca_citar'));
  assert.ok(md.includes('regras_extra'));
  assert.ok(md.includes('80/100'));
  assert.ok(!md.includes('80%'));
  assert.ok(!md.includes('Ordem sugerida'));
  assert.ok(md.includes('autorização vigente'));
});


test('não propaga trecho listado em nunca_citar do base_content', () => {
  const base = { nunca_citar: ['27[,.]7\\s*%'], experience: [{ company: 'Empresa Exemplo', bullets: ['Conversão de 27,7% para 37,7%'], bullets_temas: [['metricas']] }] };
  assert.equal(realceDeBaldes([{ id: 'metricas' }], base)[0].bullets.length, 0);
});
