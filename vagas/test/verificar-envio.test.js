import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avaliarPrecondicoes } from '../src/verificar-envio.js';
import { normalizarSnapshot } from '../src/fonte-estado.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const base = {
  vaga: { idExterno: 'fonte:1', lida: true },
  card: { status: 'Aplicar' },
  autorizado: true,
  transmissao: true,
};

test('pré-condições locais não liberam clique sem arbitragem de navegador', () => {
  const resultado = avaliarPrecondicoes(base);
  assert.equal(resultado.precondicoesAtendidas, true);
  assert.equal(resultado.liberadoClique, false);
});

test('opt-in desligado, anúncio alterado ou identidade ambígua bloqueiam candidatura', () => {
  for (const entrada of [
    { ...base, autorizado: false },
    { ...base, vaga: { ...base.vaga, julgamentoDesatualizado: true } },
    { ...base, vaga: { ...base.vaga, conflitoIdentidade: true } },
    { ...base, transmissao: false },
  ]) {
    const resultado = avaliarPrecondicoes(entrada);
    assert.equal(resultado.precondicoesAtendidas, false);
    assert.equal(resultado.liberadoClique, false);
    assert.ok(resultado.motivos.length);
  }
});

test('Notion exige Status e Gaps consultados há no máximo cinco minutos; futuro também bloqueia', () => {
  const agora = new Date('2026-11-05T12:05:00.000Z');
  const contexto = { ...base, vaga: { ...base.vaga, statusNotion: 'Aplicar' },
    card: { status: 'Aplicar', gaps: '' }, fonte: 'notion', agora };
  assert.equal(avaliarPrecondicoes({ ...contexto, sincronizadoEm: '2026-11-05T12:00:00.000Z' }).precondicoesAtendidas, true);
  for (const entrada of [
    { ...contexto, sincronizadoEm: '2026-11-05T11:59:59.999Z' },
    { ...contexto, sincronizadoEm: '2026-11-05T12:05:00.001Z' },
    { ...contexto, sincronizadoEm: '2026-11-05T12:00:00.000Z', card: { status: 'Aplicar' } },
    { ...contexto, sincronizadoEm: '2026-11-05T12:00:00.000Z', card: { status: 'Avaliar', gaps: '' } },
  ]) {
    const resultado = avaliarPrecondicoes(entrada);
    assert.equal(resultado.precondicoesAtendidas, false);
    assert.equal(resultado.liberadoClique, false);
  }
});

test('snapshot Notion rejeita status desconhecido antes de alterar o espelho', () => {
  const dados = { origem: { tipo: 'notion', databaseId: 'db-ficticia' }, consultadoEm: '2026-11-05T12:00:00.000Z',
    paginas: [{ cursorEntrada: null, proximoCursor: null, temMais: false,
      vagas: [{ paginaId: 'pagina-ficticia', idExterno: 'acme:1', status: 'Inventado', gaps: '' }] }] };
  assert.throws(() => normalizarSnapshot(dados, 'db-ficticia'), /status desconhecido/);
});

test('verificarEnvio lê o espelho Notion sem abrir o quadro local', () => {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const dir = mkdtempSync(join(raiz, 'data', 'teste-verificar-'));
  try {
    writeFileSync(join(dir, 'fonte-estado.json'), JSON.stringify({ fonte: 'notion', databaseId: 'db-ficticia' }));
    writeFileSync(join(dir, 'notion.json'), JSON.stringify({ versao: 1, fonte: 'notion', databaseId: 'db-ficticia',
      sincronizadoEm: '2026-11-05T12:00:00.000Z', paginacao: { completa: true, paginas: 1 },
      vagas: { 'acme:1': { paginaId: 'pagina-ficticia', status: 'Aplicar', gaps: '' } } }));
    writeFileSync(join(dir, 'vagas.json'), JSON.stringify({ versao: 1, vagas: {} }));
    const codigo = "import { verificarEnvio } from './src/verificar-envio.js'; process.stdout.write(JSON.stringify(verificarEnvio('acme:1', { agora: new Date('2026-11-05T12:06:00.000Z') })));";
    const saida = execFileSync(process.execPath, ['--input-type=module', '-e', codigo],
      { cwd: raiz, env: { ...process.env, VAGAS_DIR_DADOS: dir }, encoding: 'utf8' });
    const resultado = JSON.parse(saida);
    assert.equal(resultado.liberadoClique, false);
    assert.ok(resultado.motivos.some((m) => m.includes('consulta recente')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test('somente mapear bloqueia candidatura mesmo com opt-in e status antigos válidos', () => {
  const r = avaliarPrecondicoes({ ...base, modoCandidatura: 'mapear' });
  assert.equal(r.precondicoesAtendidas, false);
  assert.ok(r.motivos.some(m => m.includes('mapeamento')));
  assert.equal(r.liberadoClique, false);
});
