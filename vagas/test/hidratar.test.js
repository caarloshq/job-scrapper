import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hidratar } from '../src/hidratar.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const vaga = (extra = {}) => ({
  titulo: 'Product Designer Sênior', empresa: 'Empresa X',
  descricao: 'design system, discovery, figma, produto financeiro',
  modelo: 'remoto', remoto: true,
  publicadaEm: new Date(Date.now() - 2 * 86400000).toISOString(),
  ...extra,
});

test('hidratar separa ativas de barradas e calcula o índice final', () => {
  const { ativas, barradas } = hidratar([
    vaga({ idExterno: 'a' }),
    vaga({ idExterno: 'b', titulo: 'Designer de Sobrancelhas' }),
    vaga({ idExterno: 'c', modelo: 'presencial', remoto: false }),
  ]);
  assert.equal(ativas.length, 1);
  assert.equal(barradas, 2);
  assert.equal(ativas[0].idExterno, 'a');
  assert.equal(typeof ativas[0].compatibilidade, 'number');
  assert.ok(ativas[0].score, 'score deve estar preenchido');
});

test('vaga sem julgamento semântico não passa do teto determinístico', () => {
  // Isto é informação, não erro: quer dizer que ninguém leu a vaga ainda.
  const { ativas } = hidratar([vaga({ idExterno: 'sem-julgamento-nenhum' })]);
  assert.equal(ativas[0].semantico, null);
  assert.ok(ativas[0].compatibilidade <= 60, `esperava <= 60, veio ${ativas[0].compatibilidade}`);
});


test('a fila não conclui uma requisição distinta só por empresa e título', t => {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/testes-hidratar');
  fs.mkdirSync(raiz, { recursive: true });
  const dados = fs.mkdtempSync(path.join(raiz, 'identidade-'));
  t.after(() => fs.rmSync(dados, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dados, 'quadro.json'), JSON.stringify({ vagas: {
    antiga: { empresa: 'Empresa X', titulo: 'Product Designer Sênior', url: 'https://example.invalid/antiga', status: 'Já apliquei' },
  } }));
  const entrada = vaga({ idExterno: 'nova', link: 'https://example.invalid/nova' });
  const codigo = `import { hidratar } from ${JSON.stringify(new URL('../src/hidratar.js', import.meta.url).href)}; console.log(JSON.stringify(hidratar([${JSON.stringify(entrada)}])));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { encoding: 'utf8', env: { ...process.env, VAGAS_DIR_DADOS: dados, VAGAS_SEM_ENV: '1' } });
  assert.equal(r.status, 0, r.stderr);
  const resultado = JSON.parse(r.stdout);
  assert.equal(resultado.ativas.length, 1);
  assert.equal(resultado.ativas[0].concluida, false);
  assert.equal(resultado.ativas[0].conflitoIdentidade, true);
});
