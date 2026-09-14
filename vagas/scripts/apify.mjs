// Camada 4 — dispara a Task do Apify, espera, baixa o dataset e importa.
//
//   npm run apify              # dispara uma Task nova e espera terminar
//   npm run apify -- --ultimo  # reimporta o ultimo dataset, sem gastar credito
//
// A rodada normal (`npm run rodada`) usa `--ultimo` por dentro: ela nao pode
// ficar parada esperando um scraper de varios minutos. Disparar Task nova e
// um ato deliberado, e por isso tem comando proprio.
//
// O token vem de `vagas/.env`, que e gitignored. Sem ele, este script para com
// mensagem clara — e a rodada normal continua funcionando com as outras seis.
import * as apify from '../src/fontes/apify.js';
import * as cache from '../src/cache.js';
import { juntar, reconciliarCache } from '../src/dedupe.js';
import { avaliar } from '../src/filtro.js';
import * as semantico from '../src/semantico.js';
// O .env e carregado pelo config.js, que todo mundo importa.
import { linkedin } from '../src/config.js';

const token = process.env.APIFY_TOKEN;
const task = process.env.APIFY_TASK;
const usarUltimo = process.argv.includes('--ultimo');
const modo = apify.modo({ token, task, linkedin });

if (modo === 'desligado') {
  console.error('\nAPIFY_TOKEN ausente (ou config/linkedin.json sem actor e busca).\n');
  console.error('Copie vagas/.env.example para vagas/.env e cole:');
  console.error('  APIFY_TOKEN=<seu token da Apify>\n');
  console.error('O .env esta no .gitignore. Nunca ponha o token no codigo.\n');
  process.exit(1);
}

const alvo = modo === 'task' ? `Task ${task}` : `Actor ${linkedin.actor} com a busca de config/linkedin.json`;
console.log(usarUltimo
  ? `\nReimportando o ultimo dataset (${alvo}, sem gastar credito)...\n`
  : `\nDisparando ${alvo} e aguardando...\n`);

let r;
try {
  r = await apify.coletar({
    token, task, linkedin, usarUltimo,
    aoAndar: (s) => process.stdout.write(`  status: ${s}\n`),
  });
} catch (e) {
  console.error(`\nFalhou: ${e.message}\n`);
  process.exit(1);
}

const { vagas, contador } = r;
console.log(`\n  brutas do dataset ..... ${contador.brutas}`);
console.log(`  normalizadas .......... ${contador.normalizadas}`);
if (contador.semLink) console.log(`  descartadas sem link .. ${contador.semLink}`);
if (contador.semData) console.log(`  sem data reconhecida .. ${contador.semData}  (postedTime em formato novo?)`);

const aprovadas = vagas.filter((v) => avaliar(v).passa);
console.log(`  passam no filtro ...... ${aprovadas.length}`);

// Junta com o cache existente. O dedupe decide o vencedor; o LinkedIn perde
// para a ATS de origem e ganha dos agregadores.
const c = cache.carregar();
const atuais = Object.values(c.vagas);
const { vagas: unidas, colisoes } = juntar([...atuais, ...aprovadas]);

let novas = 0;
for (const v of unidas) {
  if (!c.vagas[v.idExterno]) novas++;
  c.vagas[v.idExterno] = v;
}

// Reconcilia o cache inteiro: pega vaga que ficou solta numa chamada
// anterior (ex.: esta rodando antes de `npm run rodada` ter trazido a
// duplicata de fonte mais forte) e so agora encontra a par dela.
const { vagas: reconciliadas, removidos } = reconciliarCache(c.vagas);
const julgamentosAtuais = semantico.carregar();
for (const v of Object.values(reconciliadas)) semantico.aplicar(v, julgamentosAtuais);
const migradas = semantico.migrarChaves(Object.values(reconciliadas));
c.vagas = reconciliadas;
if (removidos.length) console.log(`  cache reconciliado .... ${removidos.length} duplicata(s) fundida(s) (${migradas} julgamento(s) migrado(s))`);

cache.salvar(c);

console.log(`  colisoes com o cache .. ${colisoes}`);
console.log(`  NOVAS no cache ........ ${novas}`);
console.log(`  total no cache ........ ${Object.keys(c.vagas).length}\n`);
console.log('Proximo passo: npm run pendentes\n');
