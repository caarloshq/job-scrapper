import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { atualizarAutomaticamente } from '../src/atualizacao.js';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/testes-atualizacao');
fs.mkdirSync(base, { recursive: true });
const comando = (raiz, ...args) => execFileSync('git', ['-C', raiz, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fixture(t, alterarRelease = raiz => fs.writeFileSync(path.join(raiz, 'vagas/src/app.js'), 'release\n'), origem = 'https://github.com/caarloshq/jobrelay.git') {
  const raiz = fs.mkdtempSync(path.join(base, 'fixture-'));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  comando(raiz, 'init', '-b', 'main');
  comando(raiz, 'config', 'user.name', 'Teste');
  comando(raiz, 'config', 'user.email', 'teste@example.invalid');
  fs.mkdirSync(path.join(raiz, 'vagas/src'), { recursive: true });
  fs.mkdirSync(path.join(raiz, 'vagas/config'), { recursive: true });
  fs.mkdirSync(path.join(raiz, 'vagas/data'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'vagas/src/app.js'), 'base\n');
  fs.writeFileSync(path.join(raiz, 'vagas/config/perfil.json'), '{}\n');
  fs.writeFileSync(path.join(raiz, '.gitignore'), 'vagas/data/\n');
  comando(raiz, 'add', '.gitignore', 'vagas/src/app.js', 'vagas/config/perfil.json');
  comando(raiz, 'commit', '-m', 'base');
  const inicial = comando(raiz, 'rev-parse', 'HEAD');
  alterarRelease(raiz);
  comando(raiz, 'add', '-A');
  comando(raiz, 'commit', '-m', 'release');
  comando(raiz, 'tag', 'v1.2.0');
  const destino = comando(raiz, 'rev-parse', 'HEAD');
  const tagSha = comando(raiz, 'rev-parse', 'v1.2.0');
  comando(raiz, 'reset', '--hard', inicial);
  comando(raiz, 'remote', 'add', 'origin', origem);
  const opcoes = {
    raiz,
    consultarRelease: async () => ({ tag: 'v1.2.0', tagSha }),
    obterTag: async ({ ref }) => { comando(raiz, 'update-ref', ref, tagSha); },
  };
  return { raiz, inicial, destino, opcoes };
}

test('instala uma release estável por avanço linear e registra resultado', async t => {
  const f = fixture(t);
  const resultado = await atualizarAutomaticamente(f.opcoes);
  assert.equal(resultado.status, 'atualizado');
  assert.equal(comando(f.raiz, 'rev-parse', 'HEAD'), f.destino);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.raiz, 'vagas/data/atualizacao.json'))).status, 'atualizado');
  assert.equal(fs.existsSync(path.join(f.raiz, 'vagas/data/operacao/.atualizacao.lock')), false);
});

test('origem antiga exata instala release da API canônica nova', async t => {
  const antiga = 'https://github.com/caarloshq/job-scrapper.git';
  const f = fixture(t, undefined, antiga);
  const chamadas = [];
  const fetchImpl = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    const corpo = url.endsWith('/releases/latest')
      ? { tag_name: 'v1.2.0', draft: false, prerelease: false }
      : { ref: 'refs/tags/v1.2.0', object: { type: 'commit', sha: comando(f.raiz, 'rev-parse', 'v1.2.0') } };
    return { ok: true, url, headers: new Headers(), body: new Blob([JSON.stringify(corpo)]).stream() };
  };
  const resultado = await atualizarAutomaticamente({ ...f.opcoes, consultarRelease: null, fetchImpl });
  assert.equal(resultado.status, 'atualizado');
  const api = 'https://api.github.com/repos/caarloshq/jobrelay';
  assert.deepEqual(chamadas.map(c => c.url), [
    `${api}/releases/latest`,
    `${api}/git/ref/tags/v1.2.0`,
  ]);
  assert.ok(chamadas.every(c => c.opcoes.redirect === 'error' && c.opcoes.headers['User-Agent'] === 'jobrelay-update'));
  assert.equal(comando(f.raiz, 'remote', 'get-url', 'origin'), antiga);
  assert.equal(comando(f.raiz, 'rev-parse', 'HEAD'), f.destino);
});

test('falha na aplicação preserva a trava e bloqueia próxima tentativa', async t => {
  const f = fixture(t);
  const trava = path.join(f.raiz, 'vagas/data/operacao/.atualizacao.lock');
  const resultado = await atualizarAutomaticamente({
    ...f.opcoes,
    aplicarMerge: async () => { throw new Error('falha sintética na aplicação'); },
  });
  assert.equal(resultado.motivo, 'ATUALIZACAO_APLICACAO_INCERTA');
  assert.equal(resultado.trava, 'revisao_necessaria');
  assert.equal(fs.statSync(trava).isDirectory(), true);
  assert.equal(comando(f.raiz, 'rev-parse', 'HEAD'), f.inicial);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.raiz, 'vagas/data/atualizacao.json'))).motivo, 'ATUALIZACAO_APLICACAO_INCERTA');
  assert.deepEqual(await atualizarAutomaticamente(f.opcoes), { status: 'bloqueado', motivo: 'ATUALIZACAO_OCUPADA' });
});

test('aplicação sem HEAD no destino também preserva a trava', async t => {
  const f = fixture(t);
  const resultado = await atualizarAutomaticamente({ ...f.opcoes, aplicarMerge: async () => {} });
  assert.equal(resultado.motivo, 'ATUALIZACAO_APLICACAO_INCERTA');
  assert.equal(fs.existsSync(path.join(f.raiz, 'vagas/data/operacao/.atualizacao.lock')), true);
  assert.equal(comando(f.raiz, 'rev-parse', 'HEAD'), f.inicial);
});

test('permite configuração local quando a release não a altera', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.raiz, 'vagas/config/perfil.json'), '{"pessoal":true}\n');
  const resultado = await atualizarAutomaticamente(f.opcoes);
  assert.equal(resultado.status, 'atualizado');
  assert.equal(fs.readFileSync(path.join(f.raiz, 'vagas/config/perfil.json'), 'utf8'), '{"pessoal":true}\n');
});

test('bloqueia release que altera dados protegidos', async t => {
  const f = fixture(t, raiz => fs.writeFileSync(path.join(raiz, 'vagas/config/perfil.json'), '{"release":true}\n'));
  const resultado = await atualizarAutomaticamente(f.opcoes);
  assert.equal(resultado.motivo, 'RELEASE_ALTERA_DADOS_PROTEGIDOS');
  assert.equal(comando(f.raiz, 'rev-parse', 'HEAD'), f.inicial);
});

test('bloqueia código local modificado', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.raiz, 'vagas/src/app.js'), 'local\n');
  const resultado = await atualizarAutomaticamente(f.opcoes);
  assert.equal(resultado.motivo, 'CODIGO_LOCAL_MODIFICADO');
  assert.equal(comando(f.raiz, 'rev-parse', 'HEAD'), f.inicial);
});

test('respeita operação ativa sem tomar posse', async t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.raiz, 'vagas/data/operacao'));
  fs.writeFileSync(path.join(f.raiz, 'vagas/data/operacao/estado.json'), '{"status":"ativa"}');
  const resultado = await atualizarAutomaticamente(f.opcoes);
  assert.equal(resultado.motivo, 'OPERACAO_OCUPADA');
  assert.equal(comando(f.raiz, 'rev-parse', 'HEAD'), f.inicial);
});

test('não ignora lock de escrita pendente nem controle sem estado', async t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.raiz, 'vagas/data/operacao'));
  fs.symlinkSync('ausente', path.join(f.raiz, 'vagas/data/operacao/.escrita.lock'));
  assert.equal((await atualizarAutomaticamente(f.opcoes)).motivo, 'OPERACAO_OCUPADA');
  fs.unlinkSync(path.join(f.raiz, 'vagas/data/operacao/.escrita.lock'));
  fs.writeFileSync(path.join(f.raiz, 'vagas/data/controle-operacao.json'), '{}');
  assert.equal((await atualizarAutomaticamente(f.opcoes)).motivo, 'ESTADO_OPERACAO_INVALIDO');
  assert.equal(comando(f.raiz, 'rev-parse', 'HEAD'), f.inicial);
});

test('não segue link simbólico em destino', async t => {
  const f = fixture(t);
  const alvo = path.join(f.raiz, 'vagas/src/app.js');
  fs.unlinkSync(alvo);
  fs.symlinkSync(path.join(f.raiz, 'vagas/config/perfil.json'), alvo);
  const resultado = await atualizarAutomaticamente(f.opcoes);
  assert.equal(resultado.motivo, 'CAMINHO_SIMBOLICO');
  assert.equal(comando(f.raiz, 'rev-parse', 'HEAD'), f.inicial);
});

test('bloqueia tag alterada entre consulta e busca', async t => {
  const f = fixture(t);
  const resultado = await atualizarAutomaticamente({ ...f.opcoes, consultarRelease: async () => ({ tag: 'v1.2.0', tagSha: f.inicial }) });
  assert.equal(resultado.motivo, 'TAG_MUDOU');
  assert.equal(comando(f.raiz, 'rev-parse', 'HEAD'), f.inicial);
});

test('recusa origens fora das duas URLs HTTPS exatas antes de consultar release', async t => {
  const conta = ['caar', 'loshq'].join('');
  for (const origem of [
    'https://github.com/outro/projeto.git',
    `https://github.com/${conta}/jobrelay`,
    `https://github.com/${conta}/jobrelay.git/extra`,
    `https://github.com/${conta}/jobrelay.git.evil`,
    `https://github.com/${conta}/jobrelay.git@evil.example`,
    `https://github.com.evil.example/${conta}/jobrelay.git`,
    `http://github.com/${conta}/jobrelay.git`,
    `https://github.com/${conta}/job-scrapper.git/extra`,
    `https://github.com/${conta}/job-scrapper.git.evil`,
  ]) {
    const f = fixture(t);
    comando(f.raiz, 'remote', 'set-url', 'origin', origem);
    const resultado = await atualizarAutomaticamente({ ...f.opcoes, consultarRelease: async () => { throw new Error('release consultada'); } });
    assert.equal(resultado.motivo, 'ORIGEM_INVALIDA', origem);
    assert.equal(comando(f.raiz, 'rev-parse', 'HEAD'), f.inicial, origem);
  }
});

test('RC não entra pelo caminho automático', async t => {
  const f = fixture(t);
  const resposta = JSON.stringify({ tag_name: 'v1.3.0-rc.1', draft: false, prerelease: true });
  const fetchImpl = async url => ({ ok: true, url, headers: new Headers(), body: new Blob([resposta]).stream() });
  const resultado = await atualizarAutomaticamente({ raiz: f.raiz, fetchImpl });
  assert.equal(resultado.motivo, 'RELEASE_NAO_ESTAVEL');
  assert.equal(comando(f.raiz, 'rev-parse', 'HEAD'), f.inicial);
});

test('bloqueia instalação ZIP sem histórico Git', async t => {
  const raiz = fs.mkdtempSync(path.join(base, 'zip-'));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  fs.mkdirSync(path.join(raiz, 'vagas/data'), { recursive: true });
  const resultado = await atualizarAutomaticamente({ raiz, consultarRelease: async () => { throw new Error('não deveria consultar'); } });
  assert.equal(resultado.motivo, 'RAIZ_GIT_INVALIDA');
});

test('bloqueia hardlink em destino', async t => {
  const f = fixture(t);
  fs.linkSync(path.join(f.raiz, 'vagas/src/app.js'), path.join(f.raiz, 'vagas/data/copia'));
  const resultado = await atualizarAutomaticamente(f.opcoes);
  assert.equal(resultado.motivo, 'DESTINO_INSEGURO');
  assert.equal(comando(f.raiz, 'rev-parse', 'HEAD'), f.inicial);
});


test('recusa alias de caixa de diretório de dados antes de atualizar', async t => {
  const f = fixture(t, raiz => {
    fs.mkdirSync(path.join(raiz, 'REVISOES'), { recursive: true });
    fs.writeFileSync(path.join(raiz, 'REVISOES/pessoal.md'), '{}\n');
  });
  const resultado = await atualizarAutomaticamente(f.opcoes);
  assert.equal(resultado.motivo, 'RELEASE_ALTERA_DADOS_PROTEGIDOS');
  assert.equal(comando(f.raiz, 'rev-parse', 'HEAD'), f.inicial);
});
