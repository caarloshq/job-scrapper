import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verificarVersaoGit, formatarVersaoGit } from '../src/versao-git.js';

const LOCAL = 'a'.repeat(40);
const OUTRO = 'b'.repeat(40);
const erroGit = (code, stderr = '') => Object.assign(new Error(stderr), { code, stderr });

// Todas as chamadas Git são simuladas: estes testes nunca acessam a rede.
function simular(opcoes = {}) {
  const chamadas = [];
  const branch = opcoes.branch || 'feature/coleta';
  const refRemota = opcoes.refRemota || 'refs/heads/desenvolvimento';
  const remoto = opcoes.remoto || 'upstream';
  let leiturasHead = 0;
  let leiturasBranch = 0;
  const executar = async (arquivo, argumentos, configuracao) => {
    const args = [...argumentos];
    while (args[0] === '-c') args.splice(0, 2);
    chamadas.push({ arquivo, argumentos, args, configuracao });
    if (opcoes.interceptar) {
      const valor = await opcoes.interceptar(args, chamadas.length);
      if (valor !== undefined) return { stdout: valor, stderr: '' };
    }
    let stdout;
    switch (args[0]) {
      case 'rev-parse':
        if (args[1] === '--is-inside-work-tree') stdout = 'true';
        else stdout = ++leiturasHead > 1 && opcoes.novoHead ? opcoes.novoHead : (opcoes.local || LOCAL);
        break;
      case 'symbolic-ref':
        stdout = ++leiturasBranch > 1 && opcoes.novoBranch ? opcoes.novoBranch : branch;
        break;
      case 'config':
        if (args[1] === '--get') {
          assert.equal(args[2], `branch.${branch}.remote`);
          stdout = remoto;
        } else {
          assert.equal(args[2], `branch.${branch}.merge`);
          stdout = refRemota;
        }
        break;
      case 'remote': stdout = 'https://usuario:SEGREDO@example.test/repo.git'; break;
      case 'ls-remote': stdout = `${opcoes.remotoHash || LOCAL}\t${refRemota}\n`; break;
      case 'status': stdout = opcoes.sujo ? ' M src/arquivo.js\n?? novo.txt\n' : ''; break;
      default: assert.fail(`Comando inesperado: ${args[0]}`);
    }
    return { stdout, stderr: '' };
  };
  return { executar, chamadas };
}

function chamada(mock, nome) {
  return mock.chamadas.find(c => c.args[0] === nome);
}

test('confirma o commit via ls-remote e usa o upstream real, não origin/main', async () => {
  const mock = simular();
  const r = await verificarVersaoGit({ cwd: '/repo/monorepo/projeto/vagas', executar: mock.executar });
  assert.equal(r.status, 'current');
  assert.equal(r.branch, 'feature/coleta');
  assert.equal(r.commitRemoto, LOCAL);
  assert.equal(r.alteracoesLocais, false);
  assert.deepEqual(chamada(mock, 'ls-remote').args, [
    'ls-remote', '--quiet', '--exit-code', '--refs', '--heads',
    '--upload-pack=git-upload-pack', '--', 'upstream', 'refs/heads/desenvolvimento',
  ]);
  assert.ok(mock.chamadas.every(c => c.configuracao.cwd === '/repo/monorepo/projeto/vagas'));
  assert.doesNotMatch(JSON.stringify(r), /SEGREDO|example\.test|https:\/\//);
});

test('commits diferentes não são classificados como atraso ou atualização automática', async () => {
  const mock = simular({ remotoHash: OUTRO });
  const r = await verificarVersaoGit({ executar: mock.executar });
  assert.equal(r.status, 'different');
  assert.match(r.mensagem, /não é possível dizer/);
  assert.match(r.orientacao, /não atualiza nem bloqueia/);
  assert.ok(mock.chamadas.every(c => !['fetch', 'pull', 'reset', 'stash', 'checkout', 'switch', 'merge'].includes(c.args[0])));
});

test('alterações locais são avisadas mesmo quando o commit coincide', async () => {
  const mock = simular({ sujo: true });
  const r = await verificarVersaoGit({ executar: mock.executar });
  assert.equal(r.status, 'current');
  assert.equal(r.alteracoesLocais, true);
  assert.match(r.mensagem, /conteúdo não foi comparado/);
});

test('aceita hashes Git SHA-256', async () => {
  const hash = 'c'.repeat(64);
  const mock = simular({ local: hash, remotoHash: hash });
  assert.equal((await verificarVersaoGit({ executar: mock.executar })).status, 'current');
});

test('Git ausente é no-git e não lança erro', async () => {
  const r = await verificarVersaoGit({ executar: async () => { throw erroGit('ENOENT'); } });
  assert.equal(r.status, 'no-git');
});

test('pasta fora de um repositório é no-git', async () => {
  const r = await verificarVersaoGit({ executar: async () => { throw erroGit(128, 'fatal: not a git repository'); } });
  assert.equal(r.status, 'no-git');
});

test('repositório bare não é uma cópia de trabalho', async () => {
  const r = await verificarVersaoGit({ executar: async () => ({ stdout: 'false' }) });
  assert.equal(r.status, 'no-git');
});

test('erros de acesso ao repositório não são confundidos com Git ausente', async () => {
  const r = await verificarVersaoGit({ executar: async () => { throw erroGit(128, 'dubious ownership'); } });
  assert.equal(r.status, 'unknown');
});

test('HEAD destacado é informado sem consultar rede', async () => {
  const mock = simular({ interceptar: args => {
    if (args[0] === 'symbolic-ref') throw erroGit(1);
  } });
  assert.equal((await verificarVersaoGit({ executar: mock.executar })).status, 'detached');
  assert.equal(chamada(mock, 'ls-remote'), undefined);
});

test('sem upstream não inventa origin nem branch principal', async () => {
  const mock = simular({ interceptar: args => {
    if (args[0] === 'config') throw erroGit(1);
  } });
  const r = await verificarVersaoGit({ executar: mock.executar });
  assert.equal(r.status, 'unknown');
  assert.equal(r.motivo, 'sem-upstream');
  assert.equal(chamada(mock, 'ls-remote'), undefined);
});

test('upstream local e múltiplas merge refs não comprovam versão remota', async () => {
  for (const opcoes of [{ remoto: '.' }, { refRemota: 'refs/heads/a\nrefs/heads/b' }]) {
    const mock = simular(opcoes);
    assert.equal((await verificarVersaoGit({ executar: mock.executar })).status, 'unknown');
    assert.equal(chamada(mock, 'ls-remote'), undefined);
  }
});

test('remoto inexistente na configuração não é usado como URL', async () => {
  const mock = simular({ interceptar: args => {
    if (args[0] === 'remote') throw erroGit(2, 'No such remote');
  } });
  assert.equal((await verificarVersaoGit({ executar: mock.executar })).status, 'unknown');
  assert.equal(chamada(mock, 'ls-remote'), undefined);
});

test('branch removido do servidor fica desconhecido', async () => {
  const mock = simular({ interceptar: args => {
    if (args[0] === 'ls-remote') throw erroGit(2);
  } });
  const r = await verificarVersaoGit({ executar: mock.executar });
  assert.equal(r.status, 'unknown');
  assert.equal(r.motivo, 'referencia-remota-ausente');
});

test('saída vazia, malformada, duplicada ou de outro branch nunca comprova atualização', async () => {
  for (const stdout of ['', `INVALIDO\trefs/heads/desenvolvimento`, `${LOCAL}\trefs/heads/outro`,
    `${LOCAL}\trefs/heads/desenvolvimento\n${OUTRO}\trefs/heads/desenvolvimento`]) {
    const mock = simular({ interceptar: args => args[0] === 'ls-remote' ? stdout : undefined });
    assert.equal((await verificarVersaoGit({ executar: mock.executar })).status, 'unknown');
  }
});

test('falha de conexão ou DNS é offline e não revela URL com credenciais', async () => {
  for (const detalhe of ['Could not resolve host', 'Failed to connect', 'Network is unreachable', 'Connection timed out']) {
    const mock = simular({ interceptar: args => {
      if (args[0] === 'ls-remote') throw erroGit(128, `${detalhe}: https://user:TOKEN_SECRETO@example.test`);
    } });
    const r = await verificarVersaoGit({ executar: mock.executar });
    assert.equal(r.status, 'offline');
    assert.doesNotMatch(JSON.stringify(r), /TOKEN_SECRETO|example\.test|https:\/\//);
  }
});

test('falha de autenticação é desconhecida, não uma prova de falta de internet', async () => {
  const mock = simular({ interceptar: args => {
    if (args[0] === 'ls-remote') throw erroGit(128, 'Authentication failed for https://user:senha@example.test');
  } });
  const r = await verificarVersaoGit({ executar: mock.executar });
  assert.equal(r.status, 'unknown');
  assert.doesNotMatch(JSON.stringify(r), /senha|example\.test/);
});

test('prazo total limita até um executor travado e sinaliza cancelamento', async () => {
  const mock = simular({ interceptar: args => {
    if (args[0] === 'ls-remote') return new Promise(() => {});
  } });
  const inicio = Date.now();
  const r = await verificarVersaoGit({ executar: mock.executar, timeoutMs: 40 });
  assert.equal(r.status, 'offline');
  assert.ok(Date.now() - inicio < 1000);
  assert.equal(chamada(mock, 'ls-remote').configuracao.signal.aborted, true);
});

test('travamento local também respeita prazo e não afirma estar atualizado', async () => {
  const r = await verificarVersaoGit({ executar: () => new Promise(() => {}), timeoutMs: 20 });
  assert.equal(r.status, 'unknown');
});

test('consulta usa argumentos separados, sem shell, prompts ou alteração de índice', async () => {
  const branch = 'feature/$(comando);teste';
  const mock = simular({ branch });
  await verificarVersaoGit({ executar: mock.executar });
  for (const c of mock.chamadas) {
    assert.equal(c.arquivo, 'git');
    assert.equal(c.configuracao.shell, false);
    assert.equal(c.configuracao.env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(c.configuracao.env.GIT_OPTIONAL_LOCKS, '0');
    assert.equal(c.configuracao.env.GIT_ASKPASS, '');
    assert.match(c.configuracao.env.GIT_SSH_COMMAND, /BatchMode=yes/);
    assert.match(c.configuracao.env.GIT_SSH_COMMAND, /StrictHostKeyChecking=yes/);
    assert.ok(c.configuracao.timeout > 0 && c.configuracao.timeout <= 5000);
    assert.ok(c.argumentos.includes('credential.helper='));
    assert.ok(c.argumentos.includes('protocol.allow=never'));
    assert.ok(c.argumentos.includes('core.fsmonitor=false'));
  }
  assert.ok(mock.chamadas.some(c => c.args.includes(`branch.${branch}.remote`)));
});

test('timeout inválido usa padrão e valor excessivo é limitado', async () => {
  for (const timeoutMs of [NaN, -1, 0, Infinity, 1000000]) {
    const mock = simular();
    await verificarVersaoGit({ executar: mock.executar, timeoutMs });
    assert.ok(mock.chamadas.every(c => c.configuracao.timeout <= 30000));
  }
});

test('checkout trocado durante a consulta fica desconhecido', async () => {
  for (const opcoes of [{ novoHead: OUTRO }, { novoBranch: 'outro' }]) {
    const mock = simular(opcoes);
    const r = await verificarVersaoGit({ executar: mock.executar });
    assert.equal(r.status, 'unknown');
    assert.equal(r.motivo, 'checkout-alterado-durante-consulta');
  }
});

test('falha na leitura de alterações locais não produz confirmação parcial', async () => {
  const mock = simular({ interceptar: args => {
    if (args[0] === 'status') throw erroGit(128);
  } });
  assert.equal((await verificarVersaoGit({ executar: mock.executar })).status, 'unknown');
});

test('hash local inválido não consulta o remoto', async () => {
  const mock = simular({ local: 'HEAD' });
  const r = await verificarVersaoGit({ executar: mock.executar });
  assert.equal(r.status, 'unknown');
  assert.equal(chamada(mock, 'ls-remote'), undefined);
});

test('formatador inclui status, explicação e orientação em português', async () => {
  const mock = simular();
  const r = await verificarVersaoGit({ executar: mock.executar });
  assert.equal(formatarVersaoGit(r), `[Git: current] ${r.mensagem}\n${r.orientacao}`);
});

test('cwd não é redirecionado por variáveis herdadas de outro repositório', async () => {
  const chaves = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'];
  const anteriores = Object.fromEntries(chaves.map(chave => [chave, process.env[chave]]));
  try {
    for (const chave of chaves) process.env[chave] = '/outro-repositorio';
    const mock = simular();
    await verificarVersaoGit({ executar: mock.executar });
    for (const c of mock.chamadas) {
      for (const chave of chaves) assert.equal(c.configuracao.env[chave], undefined);
    }
  } finally {
    for (const chave of chaves) {
      if (anteriores[chave] === undefined) delete process.env[chave];
      else process.env[chave] = anteriores[chave];
    }
  }
});
