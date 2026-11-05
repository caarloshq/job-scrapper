import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Fixture inteiramente dentro de vagas/data, sem rede nem conta Notion.
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(raiz, 'data', 'teste-fonte-'));
process.env.VAGAS_DIR_DADOS = dir;
const fonte = await import('../src/fonte-estado.js');
const arquivo = await import('../src/arquivo.js');
const quadro = await import('../src/quadro.js');
after(() => rmSync(dir, { recursive: true, force: true }));

const snapshot = (databaseId = 'db-ficticia') => ({
  origem: { tipo: 'notion', databaseId }, consultadoEm: '2026-11-05T12:00:00.000Z',
  paginas: [
    { cursorEntrada: null, proximoCursor: 'cursor-ficticio', temMais: true,
      vagas: [{ paginaId: 'pagina-1', idExterno: 'acme:1', status: 'Já apliquei', empresa: 'Acme Fictícia' }] },
    { cursorEntrada: 'cursor-ficticio', proximoCursor: null, temMais: false,
      vagas: [{ paginaId: 'pagina-2', idExterno: 'acme:2', status: 'Avaliar', empresa: 'Acme Fictícia' }] },
  ],
});

test('local é padrão; quadro existente continua intacto ao alternar para Notion', () => {
  assert.equal(fonte.configuracao().fonte, 'local');
  quadro.registrar([{ idExterno: 'local:1', titulo: 'Vaga local', empresa: 'Acme Fictícia' }]);
  quadro.mover('local:1', 'Aplicar');
  const antes = readFileSync(join(dir, 'quadro.json'), 'utf8');
  fonte.selecionar('notion', 'db-ficticia');
  assert.throws(() => arquivo.carregar(), /ESTADO_NOTION_AUSENTE/);
  assert.throws(() => quadro.mover('local:1', 'Entrevista'), /SOMENTE_LEITURA/);
  assert.throws(() => quadro.registrar([{ idExterno: 'local:2' }]), /SOMENTE_LEITURA/);
  assert.throws(() => arquivo.espelhar([{ idExterno: 'local:1', status: 'Entrevista' }]), /SOMENTE_LEITURA/);
  assert.equal(readFileSync(join(dir, 'quadro.json'), 'utf8'), antes);
});

test('snapshot completo alimenta só o espelho Notion e status de verdade no radar', () => {
  const resultado = fonte.importar(snapshot());
  assert.equal(resultado.paginacao.paginas, 2);
  assert.ok(existsSync(join(dir, 'notion.json')));
  assert.equal(arquivo.carregar().vagas['acme:1'].status, 'Já apliquei');
  assert.equal(arquivo.aplicar({ idExterno: 'acme:1' }, arquivo.carregar()).concluida, true);
  assert.equal(arquivo.aplicar({ idExterno: 'acme:2' }, arquivo.carregar()).concluida, false);
  assert.equal(JSON.parse(readFileSync(join(dir, 'quadro.json'), 'utf8')).vagas['local:1'].status, 'Aplicar');
});

test('database errada, paginação parcial, status ausente e IDs duplicados bloqueiam importação sem alterar espelho', () => {
  const antes = readFileSync(join(dir, 'notion.json'), 'utf8');
  assert.throws(() => fonte.importar(snapshot('outra-db')), /databaseId/);
  const parcial = snapshot(); parcial.paginas.pop();
  assert.throws(() => fonte.importar(parcial), /paginação/);
  const semStatus = snapshot(); delete semStatus.paginas[0].vagas[0].status;
  assert.throws(() => fonte.importar(semStatus), /status/);
  const duplicado = snapshot(); duplicado.paginas[1].vagas[0].idExterno = 'acme:1';
  assert.throws(() => fonte.importar(duplicado), /duplicado/);
  const antigo = snapshot(); antigo.consultadoEm = '2026-11-04T12:00:00.000Z';
  assert.throws(() => fonte.importar(antigo), /ESTADO_NOTION_ANTIGO/);
  assert.equal(readFileSync(join(dir, 'notion.json'), 'utf8'), antes);
});

test('fonte configurada diferente recusa espelho antigo; voltar ao local recupera o quadro', () => {
  fonte.selecionar('notion', 'nova-db');
  assert.throws(() => arquivo.carregar(), /ESTADO_NOTION_AUSENTE/);
  fonte.selecionar('local');
  assert.equal(arquivo.carregar().vagas['local:1'].status, 'Aplicar');
});

test('espelho adulterado sem marca de completude não é lido', () => {
  fonte.selecionar('notion', 'db-ficticia');
  const caminho = join(dir, 'notion.json');
  const adulterado = JSON.parse(readFileSync(caminho, 'utf8'));
  adulterado.paginacao.completa = false;
  writeFileSync(caminho, JSON.stringify(adulterado));
  assert.throws(() => arquivo.carregar(), /ESTADO_NOTION_AUSENTE/);
});
