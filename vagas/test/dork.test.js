// A camada 2 tem dois defeitos que so aparecem quando a lista de dominios cresce,
// e os dois custaram consulta jogada fora em 2026-08-28.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cabeNoBuscador, montarConsultas } from '../src/busca/ddg.js';
import { dorks } from '../src/config.js';
import { extrair } from '../src/busca/extrair-id.js';

test('consulta acima de 32 palavras e barrada, porque o Google corta em silencio', () => {
  const longa = 'site:gupy.io ' + Array(40).fill('palavra').join(' ');
  assert.equal(cabeNoBuscador(longa), false);
});

test('consulta acima de 2024 caracteres e barrada', () => {
  const gorda = 'site:gupy.io "' + 'a'.repeat(2100) + '"';
  assert.equal(cabeNoBuscador(gorda), false);
});

test('o dork normal, com OR, passa', () => {
  assert.equal(cabeNoBuscador(`site:gupy.io ${dorks.termos[0]}`), true);
});

test('as consultas da rodada caem em SITES DIFERENTES, nao todas no primeiro', () => {
  const consultas = montarConsultas();
  const sites = consultas.map((c) => c.match(/^site:(\S+)/)?.[1]);
  assert.equal(new Set(sites).size, sites.length, `repetiu site: ${sites.join(', ')}`);
});

test('a rodada respeita o teto de consultas', () => {
  assert.ok(montarConsultas().length <= dorks.max_consultas_por_rodada);
});

test('todo dominio configurado cabe numa consulta com o primeiro termo', () => {
  const fora = dorks.sites.filter((s) => !cabeNoBuscador(`site:${s} ${dorks.termos[0]}`));
  assert.deepEqual(fora, [], `dominios que estouram o teto: ${fora.join(', ')}`);
});

// A revisao de 2026-08-28 achou cinco dominios na lista ativa sem handler em
// extrair-id.js: o dork achava a vaga e o enriquecer descartava 100% como [sem id],
// gastando uma das tres consultas da rodada. Este teste impede a reincidencia.
//
// A amostra e uma URL REAL por dominio, com a forma que aquele ATS usa de verdade.
// Amostra generica nao serve: extrair() exige uuid no Ashby, /jobs/<numero> no
// Greenhouse e /vacancy/<slug> no Recrutei, e URL inventada reprova dominio que funciona.
const AMOSTRA = {
  'gupy.io': 'https://fcamara.gupy.io/jobs/11961672',
  'inhire.app': 'https://sympla.inhire.app/vagas/a0dc9139-611f-4600-9b09-d4c5a64a85ad/product-designer',
  'jobs.ashbyhq.com': 'https://jobs.ashbyhq.com/supabase/97fe8e68-28c5-42db-a763-60113f0b31fd',
  'job-boards.greenhouse.io': 'https://job-boards.greenhouse.io/stone/jobs/7827778003',
  'jobs.lever.co': 'https://jobs.lever.co/jito/97151aba-e3eb-483d-b56c-34711b873760',
  'jobs.recrutei.com.br': 'https://jobs.recrutei.com.br/empresa/vacancy/1234-product-designer',
};

test('todo dominio ATIVO tem amostra no teste, senao ninguem esta olhando por ele', () => {
  const orfaos = dorks.sites.filter((s) => !AMOSTRA[s]);
  assert.deepEqual(orfaos, [], `dominio ativo sem amostra: ${orfaos.join(', ')}. Escreva a amostra real antes de ativar.`);
});

test('todo dominio ATIVO tem extrator, senao a camada 2 joga fora o que achar', () => {
  const semExtrator = dorks.sites.filter((s) => AMOSTRA[s] && extrair(AMOSTRA[s]) === null);
  assert.deepEqual(
    semExtrator, [],
    `dominio ativo sem handler em extrair-id.js: ${semExtrator.join(', ')}. `
    + 'Mova para _sites_sem_extrator ou escreva o extrator.',
  );
});

test('os dominios parqueados estao parqueados por motivo: extrair() nao le nenhum', () => {
  const parqueados = [
    ...dorks._sites_sem_extrator.com_api_no_ats_js,
    ...dorks._sites_sem_extrator.sem_coletor_nenhum,
  ];
  assert.ok(parqueados.length > 0, 'a lista de parqueados sumiu');
  for (const site of parqueados) {
    assert.equal(dorks.sites.includes(site), false, `${site} esta ativo E parqueado ao mesmo tempo`);
  }
});
