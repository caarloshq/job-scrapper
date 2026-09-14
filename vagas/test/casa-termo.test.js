import { test } from 'node:test';
import assert from 'node:assert/strict';
import { casaTermo, casaAlgum } from '../src/util.js';
import { avaliar } from '../src/filtro.js';

test('termo curto respeita limite de palavra', () => {
  // O erro real de 2026-07-30: "cad" (software CAD) casou dentro de
  // "Risco Sacado" e descartou a melhor vaga do board de UX.
  assert.equal(casaTermo('Cashforce — Fintech de Risco Sacado (Supply Chain Finance)', 'cad'), false);
  assert.equal(casaTermo('Projetista CAD Sênior', 'cad'), true);
  assert.equal(casaTermo('Desenhista cad/cam', 'cad'), true);
});

test('outros falsos positivos que o limite de palavra evita', () => {
  assert.equal(casaTermo('Designer de produto gratuito para R3D', '3d'), false);
  assert.equal(casaTermo('Motion 3D Designer', '3d'), true);
  assert.equal(casaTermo('Designer Gráfico', 'grafico'), true);
  assert.equal(casaTermo('Product Designer', 'grafico'), false);
});

test('termo com espaco casa como frase', () => {
  assert.equal(casaTermo('Mantemos um banco de talentos ativo', 'banco de talentos'), true);
  assert.equal(casaTermo('Trabalhamos com um banco de dados de clientes', 'banco de talentos'), false);
});

test('casaAlgum', () => {
  assert.equal(casaAlgum('Motion Designer', ['grafico', 'motion']), true);
  assert.equal(casaAlgum('Product Designer', ['grafico', 'motion']), false);
  assert.equal(casaAlgum('qualquer', []), false);
});

test('a vaga da Cashforce passa no filtro completo', () => {
  const r = avaliar({
    titulo: 'Product Designer',
    empresa: 'Cashforce — Fintech de Risco Sacado (Supply Chain Finance)',
    descricao: 'Fintech de risco sacado buscando product designer para a plataforma.',
    modelo: 'remoto',
    remoto: true,
    publicadaEm: new Date(Date.now() - 3 * 86400000).toISOString(),
  });
  assert.equal(r.passa, true, `nao deveria descartar: ${r.motivo}`);
});

test('plural casa, sufixo arbitrario nao', () => {
  // Fronteira nas duas pontas quebrava plural: "sobrancelha" x "Sobrancelhas".
  assert.equal(casaTermo('Designer de Sobrancelhas', 'sobrancelha'), true);
  assert.equal(casaTermo('Designer de Joias', 'joias'), true);
  // e continua nao casando sufixo que muda o sentido
  assert.equal(casaTermo('Cadastro de fornecedores', 'cad'), false);
  assert.equal(casaTermo('Designer com modalidade remota', 'moda'), false);
  assert.equal(casaTermo('Designer de Moda', 'moda'), true);
});

test('junior detectado no corpo quando o titulo e neutro', async () => {
  const { detectar } = await import('../src/senioridade.js');
  // A Vagas UX so expoe o cargo numa pill; o nivel fica no texto.
  assert.equal(detectar('Product Designer', 'Product Designer Junior pra trabalhar direto com o Diretor de Produto. Nao exigimos graduacao nem experiencia previa.'), 'junior');
  assert.equal(detectar('Product Designer', 'Buscamos product designer para liderar iniciativas do time de credito.'), 'sem_rotulo');
  // titulo explicito continua vencendo
  assert.equal(detectar('Product Designer Sênior', 'vaga para iniciantes'), 'senior');
});
