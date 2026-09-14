// A fila de leitura do dia. Responde "o que apareceu de novo que eu ainda nao li".
//
// Vaga ja julgada tem entrada em data/semantico.json indexada por ID externo,
// entao nunca volta pra fila. Vaga reeditada depois da leitura volta marcada,
// porque a nota antiga fala de um texto que mudou.
//
//   npm run pendentes              # fila resumida, por potencial
//   npm run pendentes -- --ler 12  # despeja as descricoes para eu ler
import * as cache from '../src/cache.js';
import { perfil } from '../src/config.js';
import { hidratar } from '../src/hidratar.js';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const paraLer = Number(arg('--ler', 0));

const teto = perfil.pesos.semantico_max;
// Reaplica o filtro ATUAL. O cache guarda o veredito da rodada em que a vaga
// entrou, entao apertar uma regra em config nao tirava nada da fila ate a
// proxima coleta com rede. Em 2026-07-30 sete vagas ja barradas — Web Designer,
// presencial em Maceio — continuaram aparecendo para leitura. O coletor expurga
// de verdade; aqui e so a vista, e a vista tem que obedecer a regra de hoje.
//
// Pelo mesmo motivo, `lida` e `concluida` vem do julgamento e do Notion, nao do
// que ficou congelado no cache: registrar uma leitura tem que esvaziar a fila
// na hora, sem esperar coleta com rede.
const noCache = Object.values(cache.carregar().vagas);
const { ativas: todas, barradas } = hidratar(noCache);
// Vaga concluida no Notion nao volta para a fila. Depois de aplicar ou
// descartar, ela nao pode continuar enchendo o saco — so precisa continuar
// existindo, para nao ser recoletada como novidade amanha.
const pendentes = todas.filter((v) => !v.concluida && (!v.lida || v.julgamentoDesatualizado));

// Ordena por TETO: quanto a vaga poderia chegar se a leitura for ótima.
// Ler vaga cujo teto nao muda a decisao e desperdicio.
const fila = pendentes
  .map((v) => ({ v, teto: Math.min(100, Math.round((v.score?.determinado ?? 0) + teto)) }))
  .sort((a, b) => b.teto - a.teto);

if (paraLer > 0) {
  for (const { v, teto: t } of fila.slice(0, paraLer)) {
    const marca = v.julgamentoDesatualizado ? ' [REEDITADA, julgamento velho]' : '';
    console.log(`### ${v.idExterno} | det=${v.score?.determinado} teto=${t}% | ${v.titulo} | ${v.empresa} | ${v.janelaRotulo} | ing=${v.score?.ingles} | sen=${v.senioridade}${marca}`);
    console.log((v.descricao || 'SEM DESCRICAO').slice(0, 520));
    console.log();
  }
  process.exit(0);
}

const semDescricao = fila.filter(({ v }) => !v.descricao || v.descricao.length < 200).length;
const reeditadas = fila.filter(({ v }) => v.julgamentoDesatualizado).length;

console.log(`\nFila de leitura — ${fila.length} pendente(s) de ${todas.length}\n${'='.repeat(60)}`);
if (barradas) console.log(`  ${barradas} no cache já não passa(m) no filtro atual: sai(em) na próxima coleta.`);
if (reeditadas) console.log(`  ${reeditadas} reeditada(s) depois da leitura: o julgamento antigo fala de outro texto.`);
console.log(`  ${semDescricao} sem descrição para ler (a leitura não vai render).\n`);

const faixas = [
  ['>= 85%  vale ler agora', (t) => t >= 85],
  ['75-84%  pode virar "aplicar já"', (t) => t >= 75 && t < 85],
  ['65-74%  no máximo "vale olhar"', (t) => t >= 65 && t < 75],
  ['< 65%   ler não muda a decisão', (t) => t < 65],
];
for (const [rotulo, teste] of faixas) {
  const n = fila.filter(({ teto: t }) => teste(t)).length;
  if (n) console.log(`  ${String(n).padStart(3)}  teto ${rotulo}`);
}

console.log(`\nTop 12 da fila:\n`);
for (const { v, teto: t } of fila.slice(0, 12)) {
  const m = v.julgamentoDesatualizado ? '!' : ' ';
  console.log(`  ${m}teto ${String(t).padStart(3)}%  det ${String(v.score?.determinado ?? 0).padStart(4)}  ${String(v.titulo || '?').slice(0, 38).padEnd(38)} ${String(v.empresa || '?').slice(0, 24)}`);
}
console.log(`\n  npm run pendentes -- --ler 12   despeja as descrições para leitura\n`);
