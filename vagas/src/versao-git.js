// Verificação consultiva: compara HEAD com o branch remoto configurado, sem
// fetch, pull, stash, reset ou gravação de estado. "current" compara commits,
// não atesta o conteúdo de arquivos modificados nem atualização futura.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const executarPadrao = promisify(execFile);
const HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const CONTINUAR = 'Você pode continuar. A verificação não atualiza nem bloqueia o projeto.';
const REPETIR = 'Tente novamente com node scripts/verificar-versao.mjs quando o remoto estiver acessível.';
const CONFIG_SEGURA = [
  '-c', 'core.fsmonitor=false',
  '-c', 'core.askPass=',
  // Evita que a consulta abra login ou execute helpers de credenciais.
  '-c', 'credential.helper=',
  '-c', 'credential.interactive=false',
  '-c', 'protocol.allow=never',
  '-c', 'protocol.https.allow=always',
  '-c', 'protocol.ssh.allow=always',
  '-c', 'protocol.git.allow=always',
];

function resultado(status, motivo, mensagem, orientacao = CONTINUAR, dados = {}) {
  return { status, motivo, mensagem, orientacao, ...dados };
}

function desconhecida(motivo, dados = {}) {
  return resultado('unknown', motivo,
    'Não foi possível confirmar a versão do repositório. Ela não será tratada como atualizada.',
    `${REPETIR} ${CONTINUAR}`, dados);
}

function falhaDeRede(erro) {
  return erro?.code === 'ETIMEDOUT' || erro?.code === 'ABORT_ERR' || erro?.killed ||
    /could not resolve (host|hostname|proxy)|failed to connect|network is unreachable|connection (timed out|refused|reset)|operation timed out|connection timeout/i
      .test(String(erro?.stderr || ''));
}

/**
 * @param {object} opcoes
 * @param {string} [opcoes.cwd] Qualquer diretório dentro do repositório, inclusive monorepos.
 * @param {number} [opcoes.timeoutMs] Orçamento TOTAL, limitado a 30 segundos.
 * @param {Function} [opcoes.executar] (arquivo, argumentos, opcoes) => Promise<{stdout, stderr}>;
 *   compatível com execFile promisificado. Injetável para testes sem rede.
 * @returns {Promise<{status: string, motivo: string, mensagem: string, orientacao: string}>}
 */
export async function verificarVersaoGit({ cwd = process.cwd(), timeoutMs = 5000, executar = executarPadrao } = {}) {
  const limite = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 30000) : 5000;
  const prazo = Date.now() + limite;
  const ambiente = { ...process.env };
  // O cwd deve selecionar o repositório, mesmo quando quem chamou herdou
  // variáveis de outro comando Git (por exemplo, dentro de um hook).
  for (const chave of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE', 'GIT_SHALLOW_FILE']) {
    delete ambiente[chave];
  }
  let etapa = 'repositorio';
  let dados = {};

  async function git(args) {
    const restante = Math.max(1, Math.ceil(prazo - Date.now()));
    const ctrl = new AbortController();
    let timer;
    const expirado = () => Object.assign(new Error('Prazo de verificação esgotado.'), { code: 'ETIMEDOUT' });
    if (Date.now() >= prazo) throw expirado();
    try {
      const resposta = await Promise.race([
        Promise.resolve().then(() => executar('git', [...CONFIG_SEGURA, ...args], {
          cwd, encoding: 'utf8', shell: false, windowsHide: true,
          timeout: restante, killSignal: 'SIGKILL', maxBuffer: 256 * 1024, signal: ctrl.signal,
          env: {
            ...ambiente, LC_ALL: 'C', LANG: 'C', GIT_OPTIONAL_LOCKS: '0',
            GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never',
            GIT_ASKPASS: '', SSH_ASKPASS: '', SSH_ASKPASS_REQUIRE: 'never',
            GIT_SSH_VARIANT: 'ssh',
            GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=5 -o ServerAliveInterval=5 -o ServerAliveCountMax=1',
          },
        })),
        new Promise((_, reject) => {
          timer = setTimeout(() => { reject(expirado()); ctrl.abort(); }, restante);
        }),
      ]);
      return String(resposta?.stdout || '').trim();
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    if (await git(['rev-parse', '--is-inside-work-tree']) !== 'true') {
      return resultado('no-git', 'sem-repositorio', 'Esta pasta não é uma cópia de trabalho Git; a versão não pôde ser confirmada.');
    }

    etapa = 'branch';
    let branch;
    try {
      branch = await git(['symbolic-ref', '--quiet', '--short', 'HEAD']);
    } catch (erro) {
      if (erro?.code === 1) {
        return resultado('detached', 'head-destacado',
          'O Git está em HEAD destacado, sem um branch ativo. Não foi possível confirmar a versão mais recente.');
      }
      throw erro;
    }
    if (!branch || /[\r\n\0]/.test(branch)) return desconhecida('branch-invalido');
    dados = { branch };
    const commitLocal = await git(['rev-parse', '--verify', 'HEAD']);
    if (!HASH.test(commitLocal)) return desconhecida('commit-local-invalido', dados);
    dados.commitLocal = commitLocal;

    etapa = 'upstream';
    let remoto, refRemota;
    try {
      remoto = await git(['config', '--get', `branch.${branch}.remote`]);
      refRemota = await git(['config', '--get-all', `branch.${branch}.merge`]);
    } catch (erro) {
      if (erro?.code === 1) return desconhecida('sem-upstream', dados);
      throw erro;
    }
    // Upstream local (".") não comprova a versão no servidor. Mais de uma
    // merge ref também não define uma única versão para comparar.
    if (!remoto || remoto === '.' || remoto.startsWith('-') || /[\r\n\0]/.test(remoto) ||
        !/^refs\/heads\/[^\s\0]+$/.test(refRemota)) return desconhecida('upstream-invalido', dados);
    // Confirma que é um remoto configurado. A URL nunca entra no resultado.
    if (!await git(['remote', 'get-url', '--', remoto])) return desconhecida('remoto-ausente', dados);

    etapa = 'remoto';
    const saida = await git([
      'ls-remote', '--quiet', '--exit-code', '--refs', '--heads',
      '--upload-pack=git-upload-pack', '--', remoto, refRemota,
    ]);
    const correspondentes = saida.split('\n').map(linha => linha.split(/\s+/))
      .filter(partes => partes.length === 2 && partes[1] === refRemota && HASH.test(partes[0]));
    if (correspondentes.length !== 1) return desconhecida('referencia-remota-ausente', dados);
    const commitRemoto = correspondentes[0][0];
    dados.commitRemoto = commitRemoto;

    etapa = 'estado-local';
    const alteracoesLocais = Boolean(await git(['status', '--porcelain', '--untracked-files=normal']));
    dados.alteracoesLocais = alteracoesLocais;
    // Outra execução pode ter trocado o checkout durante a chamada de rede.
    if (await git(['rev-parse', '--verify', 'HEAD']) !== commitLocal ||
        await git(['symbolic-ref', '--quiet', '--short', 'HEAD']) !== branch) {
      return desconhecida('checkout-alterado-durante-consulta', dados);
    }

    const avisoLocal = alteracoesLocais ? ' Há alterações locais no repositório; seu conteúdo não foi comparado com o remoto.' : '';
    if (commitLocal.toLowerCase() === commitRemoto.toLowerCase()) {
      return resultado('current', 'mesmo-commit',
        `O commit local coincide com o branch remoto acompanhado nesta consulta.${avisoLocal}`,
        CONTINUAR, dados);
    }
    return resultado('different', 'commits-diferentes',
      `O commit local difere do branch remoto acompanhado.${avisoLocal} Sem baixar o histórico, não é possível dizer se está atrás, à frente ou divergente.`,
      `Revise suas alterações e o histórico antes de decidir como atualizar. ${CONTINUAR}`, dados);
  } catch (erro) {
    // Não devolver stderr, erro.message, comando ou URL: podem conter tokens.
    if (etapa === 'repositorio' && erro?.code === 'ENOENT') {
      return resultado('no-git', 'git-ou-pasta-ausente', 'O Git ou a pasta de trabalho não está disponível; a versão não pôde ser confirmada.');
    }
    if (etapa === 'repositorio' && /not a git repository/i.test(String(erro?.stderr || ''))) {
      return resultado('no-git', 'sem-repositorio', 'Esta pasta não é uma cópia de trabalho Git; a versão não pôde ser confirmada.');
    }
    if (etapa === 'remoto' && falhaDeRede(erro)) {
      return resultado('offline', 'remoto-inacessivel',
        'O remoto não respondeu à consulta. A versão permanece sem confirmação.',
        `${REPETIR} ${CONTINUAR}`, dados);
    }
    return desconhecida(etapa === 'remoto' && erro?.code === 2 ? 'referencia-remota-ausente' : `falha-${etapa}`, dados);
  }
}

export function formatarVersaoGit(verificacao) {
  return `[Git: ${verificacao.status}] ${verificacao.mensagem}\n${verificacao.orientacao}`;
}
