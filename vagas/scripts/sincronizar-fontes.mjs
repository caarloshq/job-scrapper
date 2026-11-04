// Sincroniza código genérico por lista fechada. Configurações pessoais da
// origem nunca são copiadas; novas capacidades começam desligadas no destino.
import {
  readFileSync, writeFileSync, mkdirSync, realpathSync, lstatSync, readdirSync,
  mkdtempSync, openSync, closeSync, renameSync, unlinkSync, constants,
} from 'node:fs';
import { resolve, join, relative, dirname, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

export const ARQUIVOS_COMPARTILHADOS = Object.freeze([
  'src/fontes-registro.js', 'src/fontes/ats.js', 'src/fontes/gringas.js',
  'src/fontes/uxjobs.js', 'src/fontes/portais.js', 'src/fontes/importadas.js', 'src/versao-git.js',
  'config/catalogo-fontes.json', 'config/fontes-portais.json',
  'config/fontes-importadas.json', 'config/fontes-gringas.json',
  'scripts/fontes.mjs', 'scripts/verificar-fontes.mjs', 'scripts/verificar-versao.mjs',
  'scripts/sincronizar-fontes.mjs', 'test/fontes-novas.test.js', 'test/importadas.test.js',
  'test/gringas.test.js', 'test/uxjobs.test.js', 'test/uxjobs-security.test.js', 'test/providers-unknown.test.js',
  'test/versao-git.test.js', 'test/sincronizar-fontes.test.js', 'docs-fontes.md', 'docs-importadas.md',
  'src/fontes/careerops/LICENSE', 'src/fontes/careerops/CREDITO.md', 'src/fontes/careerops/user-agent.mjs',
]);
const PROVIDERS = 'src/fontes/careerops/providers';
const CAMINHO_PROVIDER = /^src\/fontes\/careerops\/providers\/[a-z0-9_-]+\.(mjs|js)$/;
const NOMES = Object.freeze({
  gupy: 'Gupy', remotar: 'Remotar', inhire: 'InHire', vagasremotas: 'Vagas Remotas',
  colunatech: 'Coluna Tech', vagasux: 'Vagas UX', arc: 'Arc', uxremotetalent: 'UX Remote Talent',
  uxjobs: 'UX Jobs', linkedin: 'LinkedIn', greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby',
  workable: 'Workable', smartrecruiters: 'SmartRecruiters', builtin: 'Built In', remotli: 'Remotli',
  weworkremotely: 'We Work Remotely', jobicy: 'Jobicy', torre: 'Torre', remoteok: 'RemoteOK',
  cryptocurrencyjobs: 'Crypto Jobs', remotive: 'Remotive', workingnomads: 'Working Nomads',
  nodesk: 'NoDesk', jobspresso: 'Jobspresso', himalayas: 'Himalayas', getonbrd: 'Get on Board',
  landingjobs: 'Landing.jobs', hackernews: 'Hacker News Who is hiring', wttj: 'Welcome to the Jungle',
  'a16z-speedrun-talent': 'a16z Speedrun', '4dayweek': '4 Day Week', themuse: 'The Muse',
  'generalist-world': 'Generalist World', vanhack: 'VanHack', trampos: 'Trampos',
  dribbble: 'Dribbble Jobs', wellfound: 'Wellfound', authenticjobs: 'Authentic Jobs',
  indeed: 'Indeed', glassdoor: 'Glassdoor',
});
const MODOS = new Set(['coletor', 'api_por_empresa', 'provider', 'descoberta_html', 'assistida', 'importacao_opcional']);
const CONFIGS = new Set(['config/empresas-ats.json', 'config/fontes-gringas.json',
  'config/fontes-portais.json', 'config/fontes-importadas.json']);
const hash = conteudo => createHash('sha256').update(conteudo).digest('hex');
const serializar = obj => `${JSON.stringify(obj, null, 2)}\n`;
const info = caminho => lstatSync(caminho, { throwIfNoEntry: false });
const permitido = caminho => ARQUIVOS_COMPARTILHADOS.includes(caminho) || CAMINHO_PROVIDER.test(caminho);

function raizSegura(caminho) {
  const absoluto = resolve(caminho);
  if (info(absoluto)?.isSymbolicLink()) throw new Error('Sincronização não segue links simbólicos.');
  const raiz = realpathSync(absoluto);
  if (!info(raiz)?.isDirectory()) throw new Error('A raiz precisa ser uma pasta existente.');
  return raiz;
}

function seguro(raiz, caminho) {
  const rel = relative(raiz, caminho);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Caminho fora do projeto.');
  let atual = raiz;
  const partes = rel.split(sep);
  for (let i = 0; i < partes.length; i++) {
    atual = join(atual, partes[i]);
    const estado = info(atual);
    // lstat também encontra links quebrados, ao contrário de existsSync.
    if (estado?.isSymbolicLink()) throw new Error('Sincronização não segue links simbólicos.');
    if (estado && i < partes.length - 1 && !estado.isDirectory()) throw new Error('Pasta de sincronização inválida.');
  }
  return info(caminho);
}

function lerArquivo(raiz, caminho, opcional = false) {
  const estado = seguro(raiz, caminho);
  if (!estado && opcional) return null;
  if (!estado?.isFile() || estado.nlink > 1) throw new Error('Arquivo ausente, não regular ou com múltiplos links na sincronização.');
  return readFileSync(caminho, 'utf8');
}

function json(conteudo) {
  try { return JSON.parse(conteudo); }
  catch { throw new Error('JSON inválido na configuração de fontes.'); }
}

function catalogoNeutro(conteudo) {
  const entrada = json(conteudo);
  if (!Array.isArray(entrada?.fontes)) throw new Error('Catálogo de fontes inválido.');
  const ids = new Set();
  const fontes = entrada.fontes.map(f => {
    if (!f || typeof f.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(f.id) || ids.has(f.id) ||
        !MODOS.has(f.modo) || typeof f.arquivo !== 'string' ||
        !(/^src\/fontes\/[a-z0-9_-]+\.js$/.test(f.arquivo) || CAMINHO_PROVIDER.test(f.arquivo)) ||
        (f.config !== undefined && !CONFIGS.has(f.config))) throw new Error('Capacidade inválida no catálogo de fontes.');
    if (f.modo === 'provider' && f.arquivo !== `${PROVIDERS}/${f.id}.mjs`) throw new Error('Provider não corresponde ao arquivo do catálogo.');
    ids.add(f.id);
    // Nomes, notas e campos extras da origem também podem ser personalizados.
    const neutra = { id: f.id, nome: NOMES[f.id] || f.id, modo: f.modo, arquivo: f.arquivo };
    if (f.config) neutra.config = f.config;
    if (['design', 'configuravel'].includes(f.nicho)) neutra.nicho = f.nicho;
    return neutra;
  });
  return { versao: 1, _nota: 'Capacidades disponíveis. Preferências, consultas e credenciais permanecem em cada checkout.', fontes };
}

function providerNeutro(id) {
  const fonte = { name: NOMES[id] || id, provider: id, enabled: false };
  // Marcadores vazios permitem que o coletor use os termos do perfil DESTINO.
  if (id === 'builtin') fonte.builtin = { queries: [], scope: 'remote' };
  if (id === 'wttj') fonte.wttj = { queries: [] };
  if (id === 'torre') fonte.search = '';
  if (id === 'a16z-speedrun-talent') fonte.q = '';
  if (id === 'remotli') fonte.careers_url = 'https://remotli.ch';
  return fonte;
}

function completarConfig(anterior, capacidades, chave, criar) {
  const cfg = anterior === null ? { _nota: 'Novas fontes começam desligadas. Configure neste checkout antes de ativar.', fontes: [] } : json(anterior);
  if (!cfg || !Array.isArray(cfg.fontes) || cfg.fontes.some(f => !f || typeof f[chave] !== 'string')) {
    throw new Error('Configuração de fontes do destino inválida.');
  }
  const existentes = new Set(cfg.fontes.map(f => f[chave]));
  const novas = capacidades.filter(id => !existentes.has(id)).map(criar);
  if (!novas.length && anterior !== null) return anterior; // preserva até a formatação
  return serializar({ ...cfg, fontes: [...cfg.fontes, ...novas] });
}

function importadasNeutras() {
  const campos = Object.fromEntries(['title', 'url', 'company', 'location', 'description', 'publishedAt', 'id'].map(k => [k, k]));
  return serializar({
    _nota: 'Importação opcional de dados autorizados. Configure no destino; nenhum Actor é iniciado.',
    fontes: [
      { fonte: 'Indeed', habilitada: false, tipo: 'local-json', arquivo: 'importacoes/indeed.json', maxItens: 1000, campos },
      { fonte: 'Glassdoor', habilitada: false, tipo: 'apify-dataset', datasetId: 'SUBSTITUAporDatasetExistente', limitePorPagina: 100, maxPaginas: 10, maxItens: 1000, timeoutMs: 20000, campos },
    ],
  });
}

export function planoFontes(origem, destino) {
  origem = raizSegura(origem);
  destino = raizSegura(destino);
  if (origem === destino) throw new Error('Origem e destino precisam ser diferentes.');
  if (!lerArquivo(destino, join(destino, 'src/coletar.js')).includes("from './fontes-registro.js'")) {
    throw new Error('Atualize primeiro o checkout de destino: coletor ainda não usa o registro compartilhado.');
  }
  const catalogo = catalogoNeutro(lerArquivo(origem, join(origem, 'config/catalogo-fontes.json')));
  const pastaProviders = join(origem, PROVIDERS);
  if (!seguro(origem, pastaProviders)?.isDirectory()) throw new Error('Pacote de providers ausente.');
  const arquivos = [...ARQUIVOS_COMPARTILHADOS];
  for (const nome of readdirSync(pastaProviders).sort()) {
    if (!/^[a-z0-9_-]+\.(mjs|js)$/.test(nome)) throw new Error('Nome inesperado no pacote de providers.');
    arquivos.push(`${PROVIDERS}/${nome}`);
  }
  for (const f of catalogo.fontes.filter(f => f.modo === 'provider')) {
    if (!arquivos.includes(f.arquivo)) throw new Error('Provider do catálogo ausente no pacote de código.');
  }
  return arquivos.map(caminho => {
    const src = join(origem, caminho), dst = join(destino, caminho);
    seguro(origem, src);
    const anterior = lerArquivo(destino, dst, true);
    let conteudo;
    if (caminho === 'config/catalogo-fontes.json') conteudo = serializar(catalogo);
    else if (caminho === 'config/fontes-gringas.json') {
      conteudo = completarConfig(anterior, catalogo.fontes.filter(f => f.modo === 'provider').map(f => f.id), 'provider', providerNeutro);
    } else if (caminho === 'config/fontes-portais.json') {
      conteudo = completarConfig(anterior, catalogo.fontes.filter(f => f.config === caminho).map(f => f.id), 'id', id => ({ id, enabled: false }));
    } else if (caminho === 'config/fontes-importadas.json') conteudo = anterior ?? importadasNeutras();
    else conteudo = lerArquivo(origem, src);
    return { caminho, destino: dst, conteudo, hashAnterior: anterior === null ? null : hash(anterior), alterado: anterior !== conteudo };
  });
}

function conferirPlano(plano, destino) {
  if (!Array.isArray(plano)) throw new Error('Plano de sincronização inválido.');
  const vistos = new Set();
  for (const f of plano) {
    if (!f || typeof f.caminho !== 'string' || !permitido(f.caminho) || vistos.has(f.caminho) ||
        f.destino !== join(destino, f.caminho) || typeof f.conteudo !== 'string' || typeof f.alterado !== 'boolean') {
      throw new Error('Plano fora da lista de arquivos permitidos.');
    }
    vistos.add(f.caminho);
    const atual = lerArquivo(destino, f.destino, true);
    if ((atual === null ? null : hash(atual)) !== f.hashAnterior) throw new Error('O destino mudou desde o plano. Gere um novo plano antes de aplicar.');
    if (f.alterado !== (atual !== f.conteudo)) throw new Error('Plano de sincronização inconsistente.');
  }
}

export function aplicarPlano(plano, destino) {
  destino = raizSegura(destino);
  conferirPlano(plano, destino); // valida tudo antes de criar backup ou escrever
  const alterados = plano.filter(f => f.alterado);
  if (!alterados.length) return { alterados: 0, backup: null };
  const baseBackup = join(destino, 'data', 'backups-fontes');
  seguro(destino, baseBackup);
  mkdirSync(baseBackup, { recursive: true, mode: 0o700 });
  const backup = mkdtempSync(join(baseBackup, `${new Date().toISOString().replace(/[:.]/g, '-')}-`));
  for (const f of alterados) {
    const anterior = lerArquivo(destino, f.destino, true);
    if (anterior !== null) {
      const b = join(backup, f.caminho);
      seguro(destino, b);
      mkdirSync(dirname(b), { recursive: true, mode: 0o700 });
      writeFileSync(b, anterior, { flag: 'wx', mode: 0o600 });
    }
  }
  for (const f of alterados) {
    const estado = seguro(destino, f.destino);
    mkdirSync(dirname(f.destino), { recursive: true });
    const temporario = join(dirname(f.destino), `.fontes-${randomUUID()}.tmp`);
    let fd;
    try {
      seguro(destino, temporario);
      fd = openSync(temporario, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), estado ? estado.mode & 0o777 : 0o644);
      writeFileSync(fd, f.conteudo);
      closeSync(fd); fd = undefined;
      seguro(destino, f.destino);
      renameSync(temporario, f.destino); // substitui o arquivo, não segue um link final
    } finally {
      if (fd !== undefined) closeSync(fd);
      if (info(temporario)) unlinkSync(temporario);
    }
  }
  return { alterados: alterados.length, backup };
}

export function main(args = process.argv.slice(2), { origem = resolve(dirname(fileURLToPath(import.meta.url)), '..'), saida = console.log } = {}) {
  let destino, aplicar = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--destino' && destino === undefined && args[i + 1] && !args[i + 1].startsWith('--')) destino = resolve(args[++i]);
    else if (args[i] === '--aplicar' && !aplicar) aplicar = true;
    else throw new Error('Use --destino /caminho/outro/vagas e, somente para gravar, --aplicar.');
  }
  if (!destino) throw new Error('Informe --destino /caminho/outro/vagas. Sem --aplicar, mostra apenas o plano.');
  const plano = planoFontes(origem, destino);
  saida(`${plano.filter(f => f.alterado).length} arquivos genéricos mudariam. Configurações existentes ficam preservadas; novas fontes começam desligadas.`);
  if (aplicar) {
    const r = aplicarPlano(plano, destino);
    saida(`${r.alterados} arquivos atualizados${r.backup ? `; cópias anteriores em ${r.backup}` : ''}. Rode os testes e verificar:fontes antes de publicar.`);
    return r;
  }
  return { alterados: 0, previstos: plano.filter(f => f.alterado).length, backup: null };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
