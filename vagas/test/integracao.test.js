// Testes que batem na rede de verdade. Nao rodam no `npm test`.
//
//   npm run test:rede
//
// Existem porque o teste unitario do portao de vida passava contra string
// montada por mim, e o portao nunca foi exercitado com HTML real: em tres
// rodadas seguidas `zumbisBarrados` ficou 0 e ninguem notou. Teste que so
// confirma a minha propria suposicao nao prova nada.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validar, lerStatus, estaViva } from '../src/liveness.js';
import { buscar } from '../src/util.js';
import { estaBloqueado } from '../src/busca/ddg.js';

const REDE = process.env.VAGAS_REDE === '1';
const opcoes = { skip: REDE ? false : 'defina VAGAS_REDE=1 para bater na rede' };

describe('portao de vida contra HTML real', opcoes, () => {
  // Vaga da Localiza, publicada em 20/04/2026 e com inscricoes encerradas.
  // O Google ainda a indexa — foi ela que provou que a camada 2 precisa do portao.
  const MORTA = 'https://localiza.gupy.io/jobs/11130005';

  test('vaga morta e barrada, e o motivo vem do campo status', async () => {
    const r = await validar(MORTA);
    assert.equal(r.validada, true, 'a pagina tem que responder');
    assert.equal(r.statusFonte, 'frozen', `status inesperado: ${r.statusFonte}`);
    assert.equal(r.encerrada, true, 'vaga de abril com inscricoes encerradas tem que ser barrada');
  });

  test('vaga viva do Gupy passa pelo portao', async () => {
    // Pega uma vaga ativa do portal em tempo real, para o teste nao depender
    // de um id que morre e transforma este teste em falso negativo.
    const json = await buscar('https://employability-portal.gupy.io/api/v1/jobs?jobName=Designer&offset=0&limit=8');
    const viva = (json?.data || []).find((j) => /gupy\.io/.test(j.jobUrl || ''));
    assert.ok(viva, 'o portal devia devolver ao menos uma vaga');

    const r = await validar(viva.jobUrl);
    assert.equal(r.validada, true);
    assert.equal(r.statusFonte, 'published', `status inesperado: ${r.statusFonte}`);
    assert.equal(r.encerrada, false);
  });

  test('a string "Inscricoes encerradas" aparece na pagina VIVA tambem', async () => {
    // Este e o teste que impede a armadilha de voltar. Se algum dia ele falhar
    // porque a string sumiu, otimo — mas nunca troque o campo status por ela.
    const json = await buscar('https://employability-portal.gupy.io/api/v1/jobs?jobName=Designer&offset=0&limit=8');
    const viva = (json?.data || []).find((j) => /gupy\.io/.test(j.jobUrl || ''));
    const html = await buscar(viva.jobUrl, { texto: true });

    assert.match(html, /Inscri[çc][õo]es encerradas/i, 'a string existe na pagina viva');
    assert.equal(estaViva(lerStatus(html)), true, 'e mesmo assim o status diz que esta viva');
  });

  test('link da InHire sem slug NAO serve, e o portao por HTTP nao detecta', async () => {
    // Registro do defeito de 2026-07-30: a InHire e SPA, entao os dois casos
    // devolvem 200 e ~13KB de casca. Por isso o sinal dela e o status da API,
    // nunca o HTTP. Se um dia isto falhar, a InHire passou a servir no servidor.
    const semSlug = 'https://lastlink.inhire.app/vagas/0d1db9fd-411e-4ecd-9f95-b229a56775ff';
    const html = await buscar(semSlug, { texto: true });
    assert.ok(html.length < 30000, `casca de SPA esperada, veio ${html.length}B`);
    assert.equal(lerStatus(html), null, 'a casca nao carrega status — HTTP nao decide nada aqui');
  });
});

describe('camada 2 pelo DuckDuckGo', opcoes, () => {
  test('detecta bloqueio em vez de devolver zero em silencio', async () => {
    const html = await buscar('https://html.duckduckgo.com/html/?q=site%3Agupy.io+designer', { texto: true, tentativas: 1 });
    const bloqueado = estaBloqueado(html);
    // Nao afirmamos QUAL e o estado: afirmamos que ele e reconhecido.
    // Em 2026-07-30 estava bloqueado. Se voltar a responder, o assert continua valendo.
    assert.equal(typeof bloqueado, 'boolean');
    if (bloqueado) {
      assert.equal(html.length < 20000 || /anomaly|captcha/i.test(html), true, 'bloqueio tem que ser reconhecivel');
      console.log('      (DuckDuckGo bloqueado, como esperado desde 2026-07-30)');
    } else {
      console.log('      (DuckDuckGo voltou a responder — reavaliar --com-ddg)');
    }
  });
});
