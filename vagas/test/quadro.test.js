import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// O quadro grava em DIR_DADOS. Para nao tocar no quadro de verdade, a pasta e
// trocada por uma temporaria ANTES de importar qualquer modulo (config.js le a
// variavel uma vez, na importacao). Cada teste comeca com a pasta vazia.
const dir = mkdtempSync(join(tmpdir(), 'quadro-'));
process.env.VAGAS_DIR_DADOS = dir;
const quadro = await import('../src/quadro.js');
const arquivo = await import('../src/arquivo.js');
beforeEach(() => { for (const f of readdirSync(dir)) rmSync(join(dir, f), { recursive: true, force: true }); });
after(() => { rmSync(dir, { recursive: true, force: true }); });

const vaga = (id, extra = {}) => ({ idExterno: id, titulo: `Vaga ${id}`, empresa: 'Acme', link: `https://x/${id}`, compatibilidade: 80, ...extra });

test('registrar poe a vaga nova em Avaliar com historico, e e idempotente', () => {
  const r1 = quadro.registrar([vaga('a'), vaga('b')]);
  assert.deepEqual([r1.novas, r1.atualizadas], [2, 0]);
  const r2 = quadro.registrar([vaga('a'), vaga('b')]);
  assert.deepEqual([r2.novas, r2.atualizadas], [0, 2]);
  const d = quadro.carregar();
  assert.equal(d.vagas.a.status, 'Avaliar');
  assert.equal(d.vagas.a.historico.length, 1);
  assert.equal(d.vagas.a.historico[0].por, 'rodada');
});

test('mover guarda o historico e recusa status inventado ou vaga que nao existe', () => {
  quadro.registrar([vaga('a')]);
  quadro.mover('a', 'Aplicar');
  quadro.mover('a', 'Já apliquei', { por: 'pessoa' });
  const v = quadro.carregar().vagas.a;
  assert.equal(v.status, 'Já apliquei');
  assert.deepEqual(v.historico.map((h) => h.para), ['Avaliar', 'Aplicar', 'Já apliquei']);
  assert.throws(() => quadro.mover('a', 'Marte'), /status desconhecido/);
  assert.throws(() => quadro.mover('zzz', 'Aplicar'), /nao esta no quadro/);
});

test('registrar de novo nao mexe no status nem no historico, so no retrato', () => {
  quadro.registrar([vaga('a')]);
  quadro.mover('a', 'Entrevista');
  quadro.registrar([vaga('a', { titulo: 'Vaga a (reeditada)', compatibilidade: 91 })]);
  const v = quadro.carregar().vagas.a;
  assert.equal(v.status, 'Entrevista');
  assert.equal(v.historico.length, 2);
  assert.equal(v.titulo, 'Vaga a (reeditada)');
  assert.equal(v.compatibilidade, 91);
});

test('vaga que some do cache continua no quadro: nada e apagado', () => {
  quadro.registrar([vaga('a'), vaga('b')]);
  quadro.registrar([vaga('b')]);
  assert.ok(quadro.carregar().vagas.a, 'a vaga a tem que continuar');
});

test('a primeira gravacao do dia deixa uma copia em backups/, e a segunda nao sobrescreve', () => {
  const dia = new Date('2026-09-14T09:00:00Z');
  quadro.registrar([vaga('a')], { agora: dia });
  quadro.mover('a', 'Aplicar', { agora: new Date('2026-09-14T10:00:00Z') });
  const backups = readdirSync(join(dir, 'backups'));
  assert.deepEqual(backups, ['quadro-2026-09-14.json']);
  const copia = JSON.parse(readFileSync(join(dir, 'backups', backups[0]), 'utf8'));
  assert.equal(copia.vagas.a.status, 'Avaliar', 'a copia e de ANTES da primeira mudanca do dia');
});

test('o leitor da rodada (arquivo.js) enxerga o status do quadro: concluida sai do radar', () => {
  quadro.registrar([vaga('a'), vaga('b')]);
  quadro.mover('a', 'Cancelada');
  const dados = arquivo.carregar();
  const a = arquivo.aplicar(vaga('a'), dados); const b = arquivo.aplicar(vaga('b'), dados);
  assert.equal(a.concluida, true);
  assert.equal(b.concluida, false);
  assert.equal(b.noNotion, true, 'ja esta no quadro, entao nao e novidade');
  assert.ok(existsSync(join(dir, 'quadro.json')));
});

test('espelhar (quem usa Notion) troca o status mas preserva historico e retrato', () => {
  quadro.registrar([vaga('a')]);
  quadro.mover('a', 'Aplicar');
  arquivo.espelhar([{ idExterno: 'a', status: 'Entrevista' }, { idExterno: 'nova', status: 'Avaliar', titulo: 'Nova', url: 'https://x/nova' }]);
  const d = quadro.carregar();
  assert.equal(d.vagas.a.status, 'Entrevista');
  assert.equal(d.vagas.a.historico.length, 2, 'o historico anterior continua');
  assert.equal(d.vagas.a.titulo, 'Vaga a', 'o retrato nao e apagado por linha sem titulo');
  assert.equal(d.vagas.nova.status, 'Avaliar');
});

test('card movido no meio de uma rodada lenta nao volta para tras', () => {
  quadro.registrar([vaga('a')]);
  const copiaVelha = JSON.parse(JSON.stringify(quadro.carregar()));
  quadro.mover('a', 'Entrevista');
  // A rodada termina e registra de novo: ela le o disco na hora, nao a copia velha.
  quadro.registrar([vaga('a', { compatibilidade: 90 })]);
  assert.equal(quadro.carregar().vagas.a.status, 'Entrevista');
  assert.equal(quadro.carregar().vagas.a.compatibilidade, 90);
  assert.equal(copiaVelha.vagas.a.status, 'Avaliar');
});
