import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicar, resumo, CONCLUIDOS } from '../src/arquivo.js';

// Espelho do que o Notion devolveu na última sincronização.
const notion = {
  versao: 1,
  sincronizadoEm: '2026-07-30T18:00:00.000Z',
  vagas: {
    'inhire:lastlink': { status: 'Já apliquei', empresa: 'Lastlink' },
    'greenhouse:6127944004': { status: 'Avaliar', empresa: 'Arco' },
    'inhire:velha': { status: 'Cancelada', empresa: 'X' },
    'inhire:duvidosa': { status: 'Revisar', empresa: 'Y' },
  },
};

test('concluída sai do radar', () => {
  const v = aplicar({ idExterno: 'inhire:lastlink' }, notion);
  assert.equal(v.concluida, true);
  assert.equal(v.noNotion, true);
});

test('já publicada mas ainda em avaliação continua no radar', () => {
  // Ela não é novidade, mas ainda é decisão em aberto.
  const v = aplicar({ idExterno: 'greenhouse:6127944004' }, notion);
  assert.equal(v.noNotion, true);
  assert.equal(v.concluida, false);
});

test('vaga que o Notion não conhece é novidade', () => {
  const v = aplicar({ idExterno: 'gupy:novinha' }, notion);
  assert.equal(v.noNotion, false);
  assert.equal(v.concluida, false);
});

test('encontra por id antigo, porque o dedupe troca o vencedor', () => {
  const v = aplicar({ idExterno: 'remotar:999', idsAlternativos: ['inhire:velha'] }, notion);
  assert.equal(v.concluida, true);
  assert.equal(v.statusNotion, 'Cancelada');
});

test('Revisar e fila de triagem, nao status terminal — vaga continua ativa', () => {
  // Renomeado de "Descartada" em 2026-08-05. Se virasse terminal, a vaga
  // sumiria do radar antes de alguem checar se e link morto ou duplicata.
  const v = aplicar({ idExterno: 'inhire:duvidosa' }, notion);
  assert.equal(v.concluida, false);
  assert.equal(v.statusNotion, 'Revisar');
});

test('só status terminal conclui', () => {
  assert.ok(CONCLUIDOS.includes('Já apliquei'));
  assert.ok(CONCLUIDOS.includes('Cancelada'));
  assert.equal(CONCLUIDOS.includes('Avaliar'), false);
  assert.equal(CONCLUIDOS.includes('Revisar'), false);
});

test('resumo diz quando foi sincronizado', () => {
  const r = resumo(notion);
  assert.equal(r.total, 4);
  assert.equal(r.concluidas, 2);
  assert.ok(r.sincronizadoEm, 'sem isso não dá para saber se o espelho está velho');
});

test('espelho casa pelo LINK quando o id do Notion não bate', () => {
  // Caso real de 2026-07-30: ao publicar a primeira leva eu inventei ids em
  // estilo slug em vez de copiar o idExterno do coletor. Cinco vagas já
  // publicadas apareceram como novas e iam virar página duplicada.
  const dados = { versao: 1, vagas: {
    'vagasremotas:codepath-senior-product-designer': {
      status: 'Avaliar', empresa: 'CodePath', titulo: 'Senior Product Designer',
      url: 'https://vagasremotas.com.br/vagas-home-office-remoto/senior-product-designer/',
    },
  } };
  const v = aplicar({
    idExterno: 'vagasremotas:https://vagasremotas.com.br/vagas-home-office-remoto/senior-product-designer/',
    link: 'https://vagasremotas.com.br/vagas-home-office-remoto/senior-product-designer/',
  }, dados);
  assert.equal(v.noNotion, true);
  assert.equal(v.concluida, false);
});

test('link diferente continua sendo vaga nova', () => {
  const dados = { versao: 1, vagas: { 'x': { status: 'Avaliar', url: 'https://a.com/1' } } };
  assert.equal(aplicar({ idExterno: 'y', link: 'https://a.com/2' }, dados).noNotion, false);
});

test('acha por empresa+titulo quando o link nao tem nada em comum', () => {
  // Caso real de 2026-08-10: FCamara publica direto no Gupy e espelha a
  // mesma vaga no LinkedIn — gupy.io de um lado, linkedin.com do outro, sem
  // nenhum id ou link batendo. Sem esta chave, a vaga entrava duas vezes.
  const dados = { versao: 1, vagas: {
    'gupy:11961672': { status: 'Avaliar', empresa: 'FCamara', titulo: 'Designer UX - Sênior', url: 'https://fcamara.gupy.io/job/xyz' },
  } };
  const v = aplicar({
    idExterno: 'linkedin:4450274661',
    link: 'https://www.linkedin.com/jobs/view/4450274661',
    empresa: 'FCamara',
    titulo: 'Designer UX - Sênior',
  }, dados);
  assert.equal(v.noNotion, true);
  assert.equal(v.concluida, false);
});

test('empresa+titulo nao vale para agregador — Jobgether nao e quem contrata', () => {
  const dados = { versao: 1, vagas: {
    'vagasremotas:a': { status: 'Avaliar', empresa: 'Jobgether', titulo: 'Product Designer', url: 'https://a.com/1' },
  } };
  const v = aplicar({
    idExterno: 'linkedin:2',
    link: 'https://a.com/2',
    empresa: 'Jobgether',
    titulo: 'Product Designer',
  }, dados);
  assert.equal(v.noNotion, false, 'duas vagas reais podem dividir "Jobgether | Product Designer"');
});

test('Aplicado por IA conta como concluida, senao a vaga volta amanha', () => {
  // O defeito que isto pega: o status novo entrou no Notion em 2026-08-25 e o
  // CONCLUIDOS compara pelo NOME da opcao. Sem esta entrada, vaga que o piloto
  // preencheu e voce enviou reaparece no radar no dia seguinte e ganha um
  // segundo curriculo — mesmo defeito do rename de agosto.
  assert.ok(CONCLUIDOS.includes('Aplicado por IA'), 'Aplicado por IA tem que ser terminal');
  const v = aplicar({ idExterno: 'x' }, { vagas: { x: { status: 'Aplicado por IA' } } });
  assert.equal(v.concluida, true);
  assert.equal(v.noNotion, true);
  // E Avaliar continua NAO sendo terminal.
  const a = aplicar({ idExterno: 'y' }, { vagas: { y: { status: 'Avaliar' } } });
  assert.equal(a.concluida, false);
});
