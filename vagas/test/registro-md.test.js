import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registrarRespostas } from '../src/registro-md.js';

const VAGAS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULO = pathToFileURL(path.join(VAGAS, 'src/registro-md.js')).href;

function fixture(t) {
  const raiz = fs.mkdtempSync(path.join(VAGAS, 'test/.registro-md-'));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  return raiz;
}

function entrada(id = 'vaga-1', resposta = 'Texto exato') {
  return {
    contexto: { empresa: 'Empresa Exemplo', vaga: 'Product Designer', id, data: '2026-11-05' },
    campos: [
      { pergunta: 'Conte sua experiência', texto: resposta, preenchida: true },
      { pergunta: 'Pergunta pendente', texto: 'Não informado', preenchida: false },
    ],
  };
}

function conteudo(raiz) { return fs.readFileSync(path.join(raiz, 'revisoes/respostas.md'), 'utf8'); }

function processo(raiz, pacote) {
  return new Promise((resolve, reject) => {
    const codigo = `import { registrarRespostas } from ${JSON.stringify(MODULO)}; let bruto=''; for await (const parte of process.stdin) bruto+=parte; const resultado=registrarRespostas(JSON.parse(bruto), { raizProjeto: process.argv[1] }); process.stdout.write(JSON.stringify(resultado));`;
    const filho = spawn(process.execPath, ['--input-type=module', '-e', codigo, raiz], { stdio: ['pipe', 'pipe', 'pipe'] });
    let saida = ''; let erro = '';
    filho.stdout.on('data', (dados) => { saida += dados; });
    filho.stderr.on('data', (dados) => { erro += dados; });
    filho.on('error', reject);
    filho.on('close', (codigoSaida) => codigoSaida === 0 ? resolve(JSON.parse(saida)) : reject(new Error(erro)));
    filho.stdin.end(JSON.stringify(pacote));
  });
}

test('registra somente campos preenchidos, mantém texto aberto literal e não duplica pacote', (t) => {
  const raiz = fixture(t);
  const resposta = 'Primeira linha\nSegunda linha com `código` e ~~~\nTerceira linha';
  const pacote = entrada('vaga-1', resposta);
  assert.equal(registrarRespostas(pacote, { raizProjeto: raiz }).registrado, true);
  const primeira = conteudo(raiz);
  assert.ok(primeira.includes(resposta));
  assert.ok(!primeira.includes('Pergunta pendente'));
  assert.ok(!primeira.includes('Não informado'));
  assert.equal(registrarRespostas(pacote, { raizProjeto: raiz }).registrado, false);
  assert.equal(conteudo(raiz), primeira);
  assert.equal(registrarRespostas(entrada('vaga-1', 'Resposta atualizada'), { raizProjeto: raiz }).registrado, true);
  assert.ok(conteudo(raiz).includes(resposta));
  assert.ok(conteudo(raiz).includes('Resposta atualizada'));
});

test('preserva integralmente conteúdo anterior e acrescenta ao fim', (t) => {
  const raiz = fixture(t);
  fs.mkdirSync(path.join(raiz, 'revisoes'));
  const anterior = '# Respostas de formulário\n\nTexto legado sem newline final';
  fs.writeFileSync(path.join(raiz, 'revisoes/respostas.md'), anterior);
  registrarRespostas(entrada(), { raizProjeto: raiz });
  assert.ok(conteudo(raiz).startsWith(anterior));
  assert.ok(conteudo(raiz).endsWith('~~~\n'));
});

test('não regrava o arquivo quando nada foi preenchido e conserva bytes legados', (t) => {
  const raiz = fixture(t);
  const vazio = entrada();
  vazio.campos = [{ pergunta: 'Pendente', texto: 'Rascunho', preenchida: false }];
  assert.equal(registrarRespostas(vazio, { raizProjeto: raiz }).registrado, false);
  assert.equal(fs.existsSync(path.join(raiz, 'revisoes')), false);
  fs.mkdirSync(path.join(raiz, 'revisoes'));
  const arquivo = path.join(raiz, 'revisoes/respostas.md');
  const bytes = Buffer.from([0x23, 0x20, 0x6c, 0x65, 0x67, 0x61, 0x64, 0x6f, 0xff]);
  fs.writeFileSync(arquivo, bytes);
  registrarRespostas(entrada(), { raizProjeto: raiz });
  assert.ok(fs.readFileSync(arquivo).subarray(0, bytes.length).equals(bytes));
});

test('dois processos simultâneos preservam os dois pacotes; duplicata simultânea fica única', async (t) => {
  const raiz = fixture(t);
  const [a, b] = await Promise.all([processo(raiz, entrada('vaga-A', 'Resposta A')), processo(raiz, entrada('vaga-B', 'Resposta B'))]);
  assert.equal(a.registrado, true);
  assert.equal(b.registrado, true);
  assert.equal((conteudo(raiz).match(/^## /gm) || []).length, 2);
  const [c, d] = await Promise.all([processo(raiz, entrada('vaga-C', 'Resposta C')), processo(raiz, entrada('vaga-C', 'Resposta C'))]);
  assert.equal(Number(c.registrado) + Number(d.registrado), 1);
  assert.equal((conteudo(raiz).match(/^## /gm) || []).length, 3);
});

test('rejeita caminho externo, protótipo e alvos com symlink ou hardlink', (t) => {
  const raiz = fixture(t);
  assert.throws(() => registrarRespostas(entrada(), { raizProjeto: path.dirname(VAGAS) + '-fora' }), /CAMINHO_INVALIDO/);
  const poluido = JSON.parse('{"contexto":{"empresa":"X","vaga":"Y","id":"Z","data":"2026-11-05"},"campos":[{"pergunta":"Q","texto":"A","preenchida":true,"__proto__":{}}]}');
  assert.throws(() => registrarRespostas(poluido, { raizProjeto: raiz }), /PACOTE_INVALIDO/);
  const real = path.join(raiz, 'real');
  fs.mkdirSync(real);
  fs.symlinkSync(real, path.join(raiz, 'revisoes'));
  assert.throws(() => registrarRespostas(entrada(), { raizProjeto: raiz }), /CAMINHO_INSEGURO/);
  fs.unlinkSync(path.join(raiz, 'revisoes'));
  fs.mkdirSync(path.join(raiz, 'revisoes'));
  const origem = path.join(raiz, 'origem.md');
  fs.writeFileSync(origem, 'original');
  fs.linkSync(origem, path.join(raiz, 'revisoes/respostas.md'));
  assert.throws(() => registrarRespostas(entrada(), { raizProjeto: raiz }), /CAMINHO_INSEGURO/);
  assert.equal(fs.readFileSync(origem, 'utf8'), 'original');
});

test('campo sensível só aceita referência e padrões conhecidos de segredo são recusados', (t) => {
  const raiz = fixture(t);
  const pacote = entrada();
  pacote.campos = [{ pergunta: 'CPF', texto: '123.456.789-00', preenchida: true }];
  assert.throws(() => registrarRespostas(pacote, { raizProjeto: raiz }), /DADO_SENSIVEL/);
  pacote.campos = [{ pergunta: 'CPF', referenciaPrivada: 'ref:perfil-pessoal', preenchida: true }];
  registrarRespostas(pacote, { raizProjeto: raiz });
  assert.ok(conteudo(raiz).includes('Referência privada: ref:perfil-pessoal'));
  assert.ok(!conteudo(raiz).includes('123.456.789-00'));
  pacote.campos = [{ pergunta: 'Outro campo', texto: '123.456.789-00', preenchida: true }];
  assert.throws(() => registrarRespostas(pacote, { raizProjeto: raiz }), /DADO_SENSIVEL/);
});
