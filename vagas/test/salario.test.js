import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daFonte, doTexto, formatar, resolver, paraNumero} from '../src/salario.js';

test('salario estruturado da Remotar', () => {
  const s = daFonte({ from: 12000, to: 16000, currency: 'BRL', type: 'monthly' });
  assert.deepEqual({ de: s.de, ate: s.ate, moeda: s.moeda }, { de: 12000, ate: 16000, moeda: 'BRL' });
});

test('type uninformed da Remotar nao e salario', () => {
  // Caso real: a Remotar devolve {from:null,to:null,type:"uninformed"} o tempo todo.
  assert.equal(daFonte({ from: null, to: null, currency: null, type: 'uninformed' }), null);
});

test('salario estruturado do Himalayas', () => {
  const s = daFonte({ minSalary: 90000, maxSalary: 130000, salaryCurrency: 'USD' });
  assert.equal(s.de, 90000);
  assert.equal(s.moeda, 'USD');
});

test('extrai faixa do texto quando a fonte nao tem campo (caso do Gupy)', () => {
  const s = doTexto('Oferecemos faixa de R$ 12.000 a R$ 16.000 mensais, mais beneficios.');
  assert.equal(s.de, 12000);
  assert.equal(s.ate, 16000);
  assert.equal(s.moeda, 'BRL');
  assert.equal(s.origem, 'texto');
});

test('entende k', () => {
  const s = doTexto('salario entre R$ 12k a R$ 18k');
  assert.equal(s.de, 12000);
  assert.equal(s.ate, 18000);
});

test('valor unico so conta perto de um rotulo de salario', () => {
  assert.ok(doTexto('Salário: R$ 15.000'));
  // volume movimentado pela empresa nao e salario
  assert.equal(doTexto('A empresa movimenta R$ 5.000.000 por mes'), null);
});

test('sem mencao de salario devolve null, e o formato e travessao', () => {
  assert.equal(doTexto('Vaga para Product Designer senior, remoto.'), null);
  assert.equal(formatar(null), '—');
});

test('numero implausivel nao vira salario', () => {
  assert.equal(doTexto('salario de R$ 12 a R$ 30'), null);
});

test('resolver prefere a fonte estruturada e cai para o texto', () => {
  const comCampo = resolver({ salarioBruto: { from: 10000, to: 20000, currency: 'BRL', type: 'monthly' }, descricao: 'salario R$ 1.000' });
  assert.equal(comCampo.de, 10000);

  const soTexto = resolver({ salarioBruto: null, descricao: 'faixa salarial de R$ 14.000 a R$ 18.000' });
  assert.equal(soTexto.de, 14000);
  assert.equal(resolver({ salarioBruto: null, descricao: 'sem numero nenhum' }), null);
});

test('formatacao', () => {
  assert.equal(formatar({ de: 12000, ate: 16000, moeda: 'BRL' }), 'R$ 12k–16k');
  assert.equal(formatar({ de: 90000, ate: 130000, moeda: 'USD' }), 'USD 90k–130k');
});

test('valor com periodicidade conta, mesmo sem rotulo de salario', () => {
  // Caso real da Cashforce: "(fintech de risco sacado, 100% remoto, PJ, R$ 3.000/mês)"
  const s = doTexto('Product Designer Junior na Cashforce (fintech de risco sacado, 100% remoto, PJ, R$ 3.000/mês).');
  assert.equal(s.de, 3000);
  assert.equal(s.moeda, 'BRL');
});

test('R$ nao pode ser partido em $ e virar USD', () => {
  // Bug real de 2026-07-30: o backtracking guloso do rotulo partia "R$" e
  // casava so o "$". A bolsa de "R$ 2.000/mes" do CEIA saiu como "USD 2k".
  const s = doTexto('**Remuneração:** Bolsa de P&D de R$ 2.000/mês (sem incidência de impostos)');
  assert.equal(s.moeda, 'BRL', 'era R$, nao USD');
  assert.equal(s.de, 2000);
  assert.equal(formatar(s), 'R$ 2k');
});

test('USD de verdade continua sendo USD', () => {
  assert.equal(doTexto('Compensation: USD 90.000 a USD 130.000').moeda, 'USD');
  assert.equal(doTexto('salario de US$ 8.000/mes').moeda, 'USD');
});

test('piso de salario: descarta baixo, mantem desconhecido', async () => {
  const { avaliar } = await import('../src/filtro.js');
  const base = (d) => ({
    titulo: 'Product Designer', empresa: 'X', descricao: d,
    modelo: 'remoto', remoto: true,
    publicadaEm: new Date(Date.now() - 2 * 86400000).toISOString(),
  });

  // Caso real do CEIA: bolsa de P&D de R$ 2.000/mes entrava com det=50.
  const baixo = avaliar(base('Product Designer para a plataforma. Remuneração: Bolsa de P&D de R$ 2.000/mês.'));
  assert.equal(baixo.passa, false);
  assert.match(baixo.motivo, /salario abaixo do piso/);

  // Salario bom passa
  assert.equal(avaliar(base('Product Designer. Faixa de R$ 14.000 a R$ 18.000 mensais.')).passa, true);

  // Internacional anual passa (USD 120k/ano ~ R$ 54k/mes)
  assert.equal(avaliar(base('Product Designer. Compensation: USD 120.000 per year.')).passa, true);

  // Valor sem periodo NAO descarta: falso positivo custa vaga boa
  assert.equal(avaliar(base('Product Designer. Salário R$ 3.000 a combinar conforme experiência.')).passa, true);

  // Sem menção nenhuma passa
  assert.equal(avaliar(base('Product Designer para o time de crédito, design system e discovery.')).passa, true);
});

test('paraNumero entende as duas convenções de milhar e centavo', () => {
  // Sem este ramo, apagar todos os separadores fazia "8,100.00" virar 810.000.
  // O Apify serve o salário exatamente assim.
  assert.equal(paraNumero('8,100.00'), 8100);
  assert.equal(paraNumero('1.500,00'), 1500);
  assert.equal(paraNumero('40,000.00'), 40000);
  // e o que já funcionava continua
  assert.equal(paraNumero('12.000'), 12000);
  assert.equal(paraNumero('12,000'), 12000);
  assert.equal(paraNumero('12.5'), 12.5);
  assert.equal(paraNumero('18k'), 18000);
});


test('a faixa por hora e por ano dizem o periodo, a mensal fica sem sufixo', () => {
  // "USD 30–50" de uma faixa por hora le como salario do mes no board. O numero
  // esta certo e a leitura, errada — e salario errado e pior que ausente.
  assert.equal(formatar({ de: 30, ate: 50, moeda: 'USD', periodo: 'hora' }), 'USD 30–50/hora');
  assert.equal(formatar({ de: 90000, ate: 120000, moeda: 'USD', periodo: 'ano' }), 'USD 90k–120k/ano');
  assert.equal(formatar({ de: 8000, ate: 12000, moeda: 'BRL', periodo: 'mes' }), 'R$ 8k–12k');
  assert.equal(formatar({ de: 8000, moeda: 'BRL', periodo: null }), 'R$ 8k');
  assert.equal(formatar(null), '—');
});

test('daFonte reconhece hora, mes e ano, e o mensalBRL converte os tres', () => {
  assert.equal(daFonte({ from: 30, to: 50, currency: 'USD', type: 'hour' }).periodo, 'hora');
  assert.equal(daFonte({ from: 1, to: 2, type: 'monthly' }).periodo, 'mes');
  assert.equal(daFonte({ from: 1, to: 2, type: 'annual' }).periodo, 'ano');
  assert.equal(daFonte({ from: 1, to: 2, type: 'sei la' }).periodo, null);
});
