import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, lstatSync,
  existsSync, rmSync, symlinkSync, linkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { planoFontes, aplicarPlano, main, ARQUIVOS_COMPARTILHADOS } from '../scripts/sincronizar-fontes.mjs';

const PRIVADO = 'NAO_EXPORTAR_DADO_PRIVADO_123';
const gravar = (raiz, caminho, conteudo) => {
  const arquivo = join(raiz, caminho);
  mkdirSync(dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo, null, 2));
};
const lerJson = (raiz, caminho) => JSON.parse(readFileSync(join(raiz, caminho), 'utf8'));
const catalogo = () => ({
  versao: 1, _nota: PRIVADO, extra: PRIVADO,
  fontes: [
    { id: 'builtin', nome: PRIVADO, modo: 'provider', arquivo: 'src/fontes/careerops/providers/builtin.mjs', config: 'config/fontes-gringas.json', token: PRIVADO },
    { id: 'torre', nome: PRIVADO, modo: 'provider', arquivo: 'src/fontes/careerops/providers/torre.mjs', config: 'config/fontes-gringas.json' },
    { id: 'vanhack', nome: PRIVADO, modo: 'descoberta_html', arquivo: 'src/fontes/portais.js', config: 'config/fontes-portais.json' },
    { id: 'indeed', nome: PRIVADO, modo: 'importacao_opcional', arquivo: 'src/fontes/importadas.js', config: 'config/fontes-importadas.json' },
  ],
});

function preparar(t) {
  const raiz = mkdtempSync(join(tmpdir(), 'sincronizar-fontes-'));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  const origem = join(raiz, 'origem'), destino = join(raiz, 'destino');
  mkdirSync(origem); mkdirSync(destino);
  for (const caminho of ARQUIVOS_COMPARTILHADOS) gravar(origem, caminho, `// Código genérico: ${caminho}\n`);
  for (const arquivo of ['builtin.mjs', 'torre.mjs', '_http.mjs']) gravar(origem, `src/fontes/careerops/providers/${arquivo}`, '// Provider genérico\n');
  gravar(origem, 'config/catalogo-fontes.json', catalogo());
  gravar(origem, 'config/fontes-gringas.json', {
    _nota: PRIVADO,
    fontes: [
      { name: PRIVADO, provider: 'builtin', enabled: true, medicao: PRIVADO, builtin: { queries: [PRIVADO], scope: PRIVADO }, token: PRIVADO, careers_url: `https://user:${PRIVADO}@example.test` },
      { name: PRIVADO, provider: 'torre', search: PRIVADO, enabled: true, q: PRIVADO },
    ],
  });
  gravar(origem, 'config/fontes-portais.json', { _nota: PRIVADO, fontes: [{ id: 'vanhack', enabled: true, query: PRIVADO, url: PRIVADO }] });
  gravar(origem, 'config/fontes-importadas.json', { token: PRIVADO, fontes: [{ fonte: 'Indeed', habilitada: true, arquivo: `/home/${PRIVADO}/vagas.json`, datasetId: PRIVADO }] });
  gravar(destino, 'src/coletar.js', "import { criarFontes } from './fontes-registro.js';\n");
  return { raiz, origem, destino };
}

function retrato(raiz) {
  const saida = {};
  function visitar(pasta) {
    for (const nome of readdirSync(pasta).sort()) {
      const p = join(pasta, nome), estado = lstatSync(p), rel = relative(raiz, p);
      saida[rel] = estado.isSymbolicLink() ? 'link' : estado.isDirectory() ? 'pasta' : `${estado.mtimeMs}:${readFileSync(p, 'utf8')}`;
      if (estado.isDirectory()) visitar(p);
    }
  }
  visitar(raiz);
  return saida;
}

test('dry-run pela CLI só lê, sem gravar arquivos ou criar backups', t => {
  const { origem, destino } = preparar(t);
  const antesOrigem = retrato(origem), antesDestino = retrato(destino), mensagens = [];
  const r = main(['--destino', destino], { origem, saida: m => mensagens.push(m) });
  assert.equal(r.alterados, 0);
  assert.ok(r.previstos > 0);
  assert.equal(r.backup, null);
  assert.deepEqual(retrato(origem), antesOrigem);
  assert.deepEqual(retrato(destino), antesDestino);
  assert.match(mensagens[0], /mudariam/);
  assert.equal(existsSync(join(destino, 'data')), false);
});

test('nenhum campo pessoal dos configs da origem é incluído no plano ou destino', t => {
  const { origem, destino } = preparar(t);
  const plano = planoFontes(origem, destino);
  assert.doesNotMatch(JSON.stringify(plano), new RegExp(PRIVADO));
  aplicarPlano(plano, destino);
  assert.doesNotMatch(JSON.stringify(retrato(destino)), new RegExp(PRIVADO));
  const gringas = lerJson(destino, 'config/fontes-gringas.json');
  assert.deepEqual(gringas.fontes.map(f => f.enabled), [false, false]);
  assert.equal(gringas.fontes[0].name, 'Built In');
  assert.deepEqual(gringas.fontes[0].builtin.queries, []);
  assert.equal(gringas.fontes[1].search, '');
  assert.deepEqual(lerJson(destino, 'config/fontes-portais.json').fontes, [{ id: 'vanhack', enabled: false }]);
  assert.equal(lerJson(destino, 'config/catalogo-fontes.json').fontes[0].nome, 'Built In');
});

test('config de importações existente é preservado byte a byte, inclusive dataset e credenciais do destino', t => {
  const { origem, destino } = preparar(t);
  const atual = '{ "fontes": [{ "fonte": "Glassdoor", "datasetId": "dataset-destino", "token": "token-destino", "habilitada": true }], "nota": "pessoal" }\n';
  gravar(destino, 'config/fontes-importadas.json', atual);
  const plano = planoFontes(origem, destino);
  assert.equal(plano.find(f => f.caminho === 'config/fontes-importadas.json').alterado, false);
  aplicarPlano(plano, destino);
  assert.equal(readFileSync(join(destino, 'config/fontes-importadas.json'), 'utf8'), atual);
});

test('importações ausentes recebem apenas exemplos neutros e desligados', t => {
  const { origem, destino } = preparar(t);
  aplicarPlano(planoFontes(origem, destino), destino);
  const cfg = lerJson(destino, 'config/fontes-importadas.json');
  assert.deepEqual(cfg.fontes.map(f => [f.fonte, f.habilitada]), [['Indeed', false], ['Glassdoor', false]]);
  assert.equal(cfg.fontes[0].arquivo, 'importacoes/indeed.json');
  assert.equal(cfg.fontes[1].datasetId, 'SUBSTITUAporDatasetExistente');
});

test('gringas preserva todos os campos do destino e só acrescenta capacidade ausente desligada', t => {
  const { origem, destino } = preparar(t);
  const configuracao = { _nota: 'minha nota', token: 'token-destino', extra: { manter: true }, fontes: [
    { name: 'Meu Built In', provider: 'builtin', enabled: true, medicao: 'particular', builtin: { queries: ['engenheira'], scope: 'custom' }, q: 'minha consulta' },
  ] };
  gravar(destino, 'config/fontes-gringas.json', configuracao);
  aplicarPlano(planoFontes(origem, destino), destino);
  const depois = lerJson(destino, 'config/fontes-gringas.json');
  assert.deepEqual(depois.fontes[0], configuracao.fontes[0]);
  assert.deepEqual(depois.extra, configuracao.extra);
  assert.equal(depois._nota, configuracao._nota);
  assert.equal(depois.token, configuracao.token);
  assert.deepEqual(depois.fontes[1], { name: 'Torre', provider: 'torre', enabled: false, search: '' });
});

test('gringas e portais completos não mudam nem de formatação', t => {
  const { origem, destino } = preparar(t);
  const gringas = '{ "fontes": [{"provider":"builtin","enabled":false,"name":"Meu nome"},{"provider":"torre","enabled":true,"search":"pessoal"}], "extra": 123 }\n';
  const portais = '{"fontes":[{"id":"vanhack","enabled":true,"query":"destino"}],"extra":"manter"}\n';
  gravar(destino, 'config/fontes-gringas.json', gringas);
  gravar(destino, 'config/fontes-portais.json', portais);
  const plano = planoFontes(origem, destino);
  for (const caminho of ['config/fontes-gringas.json', 'config/fontes-portais.json']) assert.equal(plano.find(f => f.caminho === caminho).alterado, false);
  aplicarPlano(plano, destino);
  assert.equal(readFileSync(join(destino, 'config/fontes-gringas.json'), 'utf8'), gringas);
  assert.equal(readFileSync(join(destino, 'config/fontes-portais.json'), 'utf8'), portais);
});

test('provider futuro recebe identidade do código, nunca nome/consulta da configuração de origem', t => {
  const { origem, destino } = preparar(t);
  const cat = catalogo();
  cat.fontes.push({ id: 'fonte-futura', nome: PRIVADO, modo: 'provider', arquivo: 'src/fontes/careerops/providers/fonte-futura.mjs', config: 'config/fontes-gringas.json' });
  gravar(origem, 'config/catalogo-fontes.json', cat);
  gravar(origem, 'src/fontes/careerops/providers/fonte-futura.mjs', '// Capacidade futura\n');
  aplicarPlano(planoFontes(origem, destino), destino);
  assert.deepEqual(lerJson(destino, 'config/fontes-gringas.json').fontes.at(-1), { name: 'fonte-futura', provider: 'fonte-futura', enabled: false });
});

test('backup preserva conteúdo anterior e uma segunda sincronização é idempotente', t => {
  const { origem, destino } = preparar(t);
  gravar(destino, 'src/fontes/ats.js', '// versão anterior\n');
  const r = aplicarPlano(planoFontes(origem, destino), destino);
  assert.ok(r.alterados > 0);
  assert.equal(readFileSync(join(r.backup, 'src/fontes/ats.js'), 'utf8'), '// versão anterior\n');
  assert.equal(readFileSync(join(destino, 'src/fontes/ats.js'), 'utf8'), readFileSync(join(origem, 'src/fontes/ats.js'), 'utf8'));
  const antes = retrato(destino);
  assert.deepEqual(aplicarPlano(planoFontes(origem, destino), destino), { alterados: 0, backup: null });
  assert.deepEqual(retrato(destino), antes);
});

test('backups consecutivos têm diretórios distintos e não sobrescrevem cópia anterior', t => {
  const { origem, destino } = preparar(t);
  gravar(destino, 'src/fontes/ats.js', '// versão zero\n');
  const a = aplicarPlano(planoFontes(origem, destino), destino);
  const intermediario = readFileSync(join(destino, 'src/fontes/ats.js'), 'utf8');
  gravar(origem, 'src/fontes/ats.js', '// versão dois\n');
  const b = aplicarPlano(planoFontes(origem, destino), destino);
  assert.notEqual(a.backup, b.backup);
  assert.equal(readFileSync(join(a.backup, 'src/fontes/ats.js'), 'utf8'), '// versão zero\n');
  assert.equal(readFileSync(join(b.backup, 'src/fontes/ats.js'), 'utf8'), intermediario);
});

test('perfis, dados, .env, package e empresas ATS ficam fora da sincronização', t => {
  const { origem, destino } = preparar(t);
  const privados = ['.env', 'package.json', 'config/perfil.json', 'config/palavras-chave.json', 'config/empresas-ats.json', 'data/quadro.json', 'data/dados-pessoais.json'];
  for (const p of privados) { gravar(origem, p, PRIVADO); gravar(destino, p, `preservar ${p}`); }
  const plano = planoFontes(origem, destino);
  assert.ok(plano.every(f => !privados.includes(f.caminho)));
  aplicarPlano(plano, destino);
  for (const p of privados) assert.equal(readFileSync(join(destino, p), 'utf8'), `preservar ${p}`);
});

test('origem e destino iguais são recusados', t => {
  const { origem } = preparar(t);
  assert.throws(() => planoFontes(origem, origem), /diferentes/);
});

test('destino antigo sem coletor compartilhado é recusado sem alteração', t => {
  const { origem, destino } = preparar(t);
  gravar(destino, 'src/coletar.js', '// versão antiga');
  const antes = retrato(destino);
  assert.throws(() => planoFontes(origem, destino), /Atualize primeiro/);
  assert.deepEqual(retrato(destino), antes);
});

for (const lado of ['origem', 'destino']) {
  for (const quebrado of [false, true]) {
    test(`link simbólico ${quebrado ? 'quebrado' : 'válido'} na ${lado} é recusado`, t => {
      const f = preparar(t);
      const caminho = join(f[lado], 'src/fontes/ats.js');
      mkdirSync(dirname(caminho), { recursive: true });
      rmSync(caminho, { force: true });
      const alvo = join(f.raiz, quebrado ? 'inexistente' : 'externo.txt');
      if (!quebrado) writeFileSync(alvo, 'não tocar');
      symlinkSync(alvo, caminho);
      const antes = retrato(f.destino);
      assert.throws(() => planoFontes(f.origem, f.destino), /links simbólicos/);
      assert.deepEqual(retrato(f.destino), antes);
      if (!quebrado) assert.equal(readFileSync(alvo, 'utf8'), 'não tocar');
    });
  }
}

test('pasta de providers e raiz destino simbólicas também são recusadas', t => {
  const { raiz, origem, destino } = preparar(t);
  const alias = join(raiz, 'alias');
  symlinkSync(destino, alias, 'dir');
  assert.throws(() => planoFontes(origem, alias), /links simbólicos/);
  const pasta = join(origem, 'src/fontes/careerops/providers');
  rmSync(pasta, { recursive: true });
  symlinkSync(destino, pasta, 'dir');
  assert.throws(() => planoFontes(origem, destino), /links simbólicos/);
});

test('troca por symlink depois do plano é detectada antes de qualquer escrita', t => {
  const { raiz, origem, destino } = preparar(t);
  const plano = planoFontes(origem, destino);
  const alvo = join(raiz, 'externo');
  mkdirSync(alvo);
  symlinkSync(alvo, join(destino, 'config'), 'dir');
  const antes = retrato(destino);
  assert.throws(() => aplicarPlano(plano, destino), /links simbólicos/);
  assert.deepEqual(retrato(destino), antes);
  assert.deepEqual(readdirSync(alvo), []);
});

test('backup não segue um diretório data simbólico', t => {
  const { raiz, origem, destino } = preparar(t);
  const plano = planoFontes(origem, destino);
  const externo = join(raiz, 'externo');
  mkdirSync(externo);
  symlinkSync(externo, join(destino, 'data'), 'dir');
  const antes = retrato(destino);
  assert.throws(() => aplicarPlano(plano, destino), /links simbólicos/);
  assert.deepEqual(retrato(destino), antes);
  assert.deepEqual(readdirSync(externo), []);
});

test('hardlink de destino é recusado, preservando arquivo externo', t => {
  const { raiz, origem, destino } = preparar(t);
  const externo = join(raiz, 'externo.txt');
  writeFileSync(externo, 'não sobrescrever');
  mkdirSync(join(destino, 'src/fontes'), { recursive: true });
  linkSync(externo, join(destino, 'src/fontes/ats.js'));
  assert.throws(() => planoFontes(origem, destino), /múltiplos links/);
  assert.equal(readFileSync(externo, 'utf8'), 'não sobrescrever');
});

test('plano adulterado não escreve fora da lista, fora do destino ou em duplicidade', t => {
  const { raiz, origem, destino } = preparar(t);
  for (const adulterar of [
    p => { p[0].caminho = '.env'; p[0].destino = join(destino, '.env'); },
    p => { p[0].destino = join(raiz, 'fora.txt'); },
    p => { p.push({ ...p[0] }); },
  ]) {
    const plano = planoFontes(origem, destino);
    adulterar(plano);
    const antes = retrato(destino);
    assert.throws(() => aplicarPlano(plano, destino), /lista de arquivos/);
    assert.deepEqual(retrato(destino), antes);
  }
});

test('plano defasado é recusado e mantém edição feita depois da leitura', t => {
  const { origem, destino } = preparar(t);
  const plano = planoFontes(origem, destino);
  gravar(destino, 'src/fontes/ats.js', '// edição simultânea');
  const antes = retrato(destino);
  assert.throws(() => aplicarPlano(plano, destino), /destino mudou/);
  assert.deepEqual(retrato(destino), antes);
});

test('config do destino inválido falha sem vazar conteúdo ou escrever', t => {
  const { origem, destino } = preparar(t);
  gravar(destino, 'config/fontes-gringas.json', `{ ${PRIVADO}`);
  const antes = retrato(destino);
  assert.throws(() => planoFontes(origem, destino), e => {
    assert.doesNotMatch(e.message, new RegExp(PRIVADO));
    return /JSON inválido/.test(e.message);
  });
  assert.deepEqual(retrato(destino), antes);
});

test('catálogo com traversal, provider ausente ou IDs duplicados falha fechado', t => {
  const { origem, destino } = preparar(t);
  for (const adulterar of [
    c => { c.fontes[0].arquivo = '../../.env'; },
    c => { c.fontes[0].id = 'inexistente'; c.fontes[0].arquivo = 'src/fontes/careerops/providers/inexistente.mjs'; },
    c => { c.fontes.push({ ...c.fontes[0] }); },
  ]) {
    const cat = catalogo(); adulterar(cat);
    gravar(origem, 'config/catalogo-fontes.json', cat);
    assert.throws(() => planoFontes(origem, destino));
    assert.equal(existsSync(join(destino, 'data')), false);
  }
});

test('argumentos inválidos não ativam escrita acidentalmente', t => {
  const { origem, destino } = preparar(t);
  for (const args of [[], ['--aplicar'], ['--destino'], ['--destino', '--aplicar'], ['--destino', destino, '--apply'], ['--destino', destino, '--aplicar', '--aplicar']]) {
    assert.throws(() => main(args, { origem, saida: () => {} }));
    assert.equal(existsSync(join(destino, 'data')), false);
  }
});

test('--aplicar explícito aplica e relata o backup', t => {
  const { origem, destino } = preparar(t);
  const mensagens = [];
  const r = main(['--destino', destino, '--aplicar'], { origem, saida: m => mensagens.push(m) });
  assert.ok(r.alterados > 0);
  assert.ok(r.backup);
  assert.match(mensagens.at(-1), /arquivos atualizados/);
  assert.equal(existsSync(join(destino, 'src/fontes/ats.js')), true);
});
