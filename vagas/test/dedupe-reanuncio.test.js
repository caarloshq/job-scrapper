// Casos reais de 2026-09-07: voce viu o piloto abrindo vaga que ele ja tinha
// enviado semanas antes. Cada teste aqui e uma vaga que passou pelo dedupe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { juntar, chaveAnuncio, chaveRequisicao, tituloComparavel } from '../src/dedupe.js';
import { normalizarLink } from '../src/util.js';
import { aplicar } from '../src/arquivo.js';

test('titulo comparavel ignora a cidade do anuncio', () => {
  // Blacksmith Agency publicou a MESMA vaga para Fortaleza, Belo Horizonte e Belem.
  const a = tituloComparavel('Senior Product Designer, Design Systems (Remote, Fortaleza)');
  const b = tituloComparavel('Senior Product Designer, Design Systems (Remote, Belem)');
  assert.equal(a, b);
});

test('titulo comparavel ignora o sufixo de modalidade', () => {
  // alt.bank: "Product Designer" na Remotar, "Product Designer - Remoto" no LinkedIn.
  assert.equal(tituloComparavel('Product Designer - Remoto'), tituloComparavel('Product Designer'));
});

test('numero de requisicao sai do titulo nos dois formatos', () => {
  assert.equal(chaveRequisicao({ empresa: 'Nortal', titulo: '(1552) Senior UX/UI - Product Designer' }), 'nortal##1552');
  assert.equal(chaveRequisicao({ empresa: 'BairesDev', titulo: 'Senior Product Designer - Remote Work | REF#301709' }), 'bairesdev##301709');
});

test('agregador nao vira chave de requisicao nem de anuncio', () => {
  // Duas vagas "Jobgether" sao de empresas finais diferentes: colapsar perde vaga.
  assert.equal(chaveAnuncio({ empresa: 'Jobgether', titulo: 'Senior Product Designer' }), null);
  assert.equal(chaveRequisicao({ empresa: 'Jobgether', titulo: '(1552) Senior Product Designer' }), null);
});

test('gh_src nao esconde que o link e o mesmo', () => {
  // A vaga da Arco chegou pela Remotar com parametro de rastreio e nao casou
  // com a mesma vaga ja enviada no Greenhouse.
  const a = normalizarLink('https://job-boards.greenhouse.io/arcoeducacao/jobs/6127944004');
  const b = normalizarLink('https://job-boards.greenhouse.io/arcoeducacao/jobs/6127944004?gh_src=5be8bfef3us&utm_source=remotar');
  assert.equal(a, b);
});

test('juntar colapsa o reanuncio por cidade', () => {
  const { vagas } = juntar([
    { idExterno: 'linkedin:1', fonte: 'LinkedIn (Apify)', empresa: 'Blacksmith Agency', titulo: 'Senior Product Designer, Design Systems (Remote, Fortaleza)', link: 'https://www.linkedin.com/jobs/view/1' },
    { idExterno: 'linkedin:2', fonte: 'LinkedIn (Apify)', empresa: 'Blacksmith Agency', titulo: 'Senior Product Designer, Design Systems (Remote, Belem)', link: 'https://www.linkedin.com/jobs/view/2' },
  ]);
  assert.equal(vagas.length, 1);
  assert.ok(vagas[0].idsAlternativos.includes('linkedin:2') || vagas[0].idExterno === 'linkedin:2');
});

test('vaga ja enviada nao volta ao radar por id novo da mesma requisicao', () => {
  // dados injetados: espelhar() GRAVA data/quadro.json de verdade, e usar isso
  // num teste apaga o espelho da rodada. Aprendido em 2026-09-07.
  const dados = { versao: 1, vagas: { 'linkedin:4459847741': { status: 'Aplicado por IA', empresa: 'Nortal', titulo: '(1552) Senior UX/UI - Product Designer', url: 'https://www.linkedin.com/jobs/view/4459847741' } } };
  const v = aplicar({ idExterno: 'uxremotetalent:senior-ux-ui-product-designer', empresa: 'Nortal', titulo: 'Senior UX/UI Product Designer', link: 'https://www.uxremotetalent.com/ux-job/senior-ux-ui-product-designer' }, dados);
  assert.equal(v.concluida, true, 'a vaga da Nortal ja tinha sido enviada e voltou como nova');
});

test('vaga ja enviada nao volta por link de agregador com o mesmo id da ATS', () => {
  const dados = { versao: 1, vagas: { 'gupy:11926888': { status: 'Aplicado por IA', empresa: 'Itix', titulo: 'Designer UX/UI (SR)', url: 'https://sejaitix.gupy.io/job/eyJqb2JJZCI6MTE5MjY4ODgsInNvdXJjZSI6Imd1cHlfcG9ydGFsIn0=?jobBoardSource=gupy_portal' } } };
  const v = aplicar({ idExterno: 'remotar:157935', empresa: 'Itix', titulo: 'Designer UX/UI', link: 'https://sejaitix.gupy.io/job/eyJqb2JJZCI6MTE5MjY4ODgsInNvdXJjZSI6InJlbW90YXIifQ==?jobBoardSource=remotar' }, dados);
  assert.equal(v.concluida, true, 'a mesma vaga da Gupy chegou pela Remotar e passou como nova');
});

test('duas requisicoes diferentes da mesma empresa NAO colapsam', () => {
  // Nortal: (1520) e (1552) sao o mesmo cargo e vagas diferentes. Colapsar
  // esconderia uma vaga aberta atras de outra ja resolvida.
  const dados = { versao: 1, vagas: { 'linkedin:4447598089': { status: 'Cancelada', empresa: 'Nortal', titulo: '(1520) Senior UX/UI - Product Designer', url: 'https://www.linkedin.com/jobs/view/4447598089' } } };
  const v = aplicar({ idExterno: 'linkedin:4459847741', empresa: 'Nortal', titulo: '(1552) Senior UX/UI - Product Designer', link: 'https://www.linkedin.com/jobs/view/4459847741' }, dados);
  assert.equal(v.concluida, false, 'a requisicao 1552 sumiu atras da 1520');
});

test('so um lado com numero: o titulo ainda decide', () => {
  const dados = { versao: 1, vagas: { 'linkedin:4459847741': { status: 'Aplicado por IA', empresa: 'Nortal', titulo: '(1552) Senior UX/UI - Product Designer', url: 'https://www.linkedin.com/jobs/view/4459847741' } } };
  const v = aplicar({ idExterno: 'uxremotetalent:x', empresa: 'Nortal', titulo: 'Senior UX/UI Product Designer', link: 'https://www.uxremotetalent.com/ux-job/x' }, dados);
  assert.equal(v.concluida, true);
});
