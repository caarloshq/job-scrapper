// Orquestrador da rodada. Node puro, zero LLM: se o Claude falhar depois,
// o dado do dia ja esta coletado.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as gupy from './fontes/gupy.js';
import * as remotar from './fontes/remotar.js';
import * as inhire from './fontes/inhire.js';
import * as vagasremotas from './fontes/vagasremotas.js';
import * as colunatech from './fontes/colunatech.js';
import * as vagasux from './fontes/vagasux.js';
import * as arc from './fontes/arc.js';
import * as uxremotetalent from './fontes/uxremotetalent.js';
import * as ats from './fontes/ats.js';
import * as apify from './fontes/apify.js';
import * as ddg from './busca/ddg.js';
import { validar } from './liveness.js';
import { juntar, reconciliarCache } from './dedupe.js';
import { avaliar } from './filtro.js';
import { calcular, compatibilidade, faixa } from './score.js';
import { janela, ROTULO, idadeEmDias } from './frescor.js';
import { resolver as resolverSalario, formatar as formatarSalario } from './salario.js';
import * as cache from './cache.js';
import * as semantico from './semantico.js';
import * as arquivo from './arquivo.js';
import * as quadro from './quadro.js';
import { readFileSync } from 'node:fs';
import { perfil, linkedin, DIR_DADOS, RAIZ } from './config.js';
import { hoje, dormir } from './util.js';
import { fontesAtivas } from './mercado.js';

// ATS internacional entra como fonte normal, so precisa da lista de empresas.
// Os agregadores internacionais (Himalayas, Remotive) ficaram de fora: medido
// em 2026-07-30, nenhum dos dois honra `search` nem `category`, e o feed
// publico da Remotive tem 35 vagas no total. Ver src/fontes/ats.js.
const empresasAts = JSON.parse(readFileSync(join(RAIZ, 'config', 'empresas-ats.json'), 'utf8')).empresas;
const atsFonte = { NOME: ats.NOME, coletar: () => ats.coletar(empresasAts) };

// Camada 4: LinkedIn via Apify. So precisa de APIFY_TOKEN no `.env` (ver
// .env.example): sem APIFY_TASK, dispara o Actor de config/linkedin.json com a
// busca de la; com APIFY_TASK, a Task da conta manda. A ausencia do token NAO
// derruba a rodada: as outras fontes seguem. Dispara run novo a cada rodada
// (decisao de 2026-08-10: sempre dataset fresco, custa credito e ate 8min a
// mais por rodada). Para reimportar sem gastar credito, `npm run apify -- --ultimo`.
const apifyOpcoes = { token: process.env.APIFY_TOKEN, task: process.env.APIFY_TASK, linkedin };
const apifyFonte = {
  NOME: apify.NOME,
  coletar: () => apify.coletar({ ...apifyOpcoes, usarUltimo: false }),
};

// Todas as fontes que existem. Quais entram e decisao do perfil (mercado e
// fontes_desligadas), em src/mercado.js — nunca comentando linha aqui.
const TODAS = [gupy, remotar, inhire, vagasremotas, colunatech, vagasux, arc, uxremotetalent, atsFonte];
if (apify.modo(apifyOpcoes) !== 'desligado') {
  TODAS.push(apifyFonte);
} else {
  console.log('\n[camada 4] LinkedIn fora desta rodada: falta APIFY_TOKEN no vagas/.env (veja .env.example).');
}
const FONTES = fontesAtivas(TODAS, perfil);
if (perfil._configurado !== true) {
  console.log('\nAVISO: o perfil ainda nao foi configurado. A rodada roda com os valores de exemplo.');
  console.log('       Abra o Claude Code ou o Codex nesta pasta e siga o ONBOARDING.md, ou rode: npm run onboarding\n');
}
const forcar = process.argv.includes('--forcar');
// O DuckDuckGo NAO esta morto: ele rate-limita. Entrega nas 2-3 primeiras
// consultas e depois bloqueia. Com 3 consultas por rodada, rende — na medicao de
// 2026-07-30 trouxe 4 links, 3 deles que a camada 1 nao tinha. O caminho
// confiavel para volume e o WebSearch do Claude via scripts/enriquecer.mjs.
const semDdg = process.argv.includes('--sem-ddg');

async function main() {
  const inicio = Date.now();
  const dia = hoje();
  const arqRodada = join(DIR_DADOS, `rodada-${dia}.json`);

  if (existsSync(arqRodada) && !forcar) {
    console.log(`Ja rodou hoje (${dia}). O resultado esta em data/rodada-${dia}.json`);
    console.log('Use --forcar para rodar de novo.');
    return;
  }

  console.log(`\nCaca-vagas — rodada de ${dia}\n${'='.repeat(52)}`);

  // ---------- Camada 1: API ----------
  console.log('\n[camada 1] API');
  const contadores = [];
  const brutas = [];

  const resultados = await Promise.allSettled(FONTES.map((f) => f.coletar()));
  resultados.forEach((r, i) => {
    const nome = FONTES[i].NOME;
    if (r.status === 'fulfilled') {
      brutas.push(...r.value.vagas);
      contadores.push(r.value.contador);
    } else {
      contadores.push({ fonte: nome, consultadas: 0, brutas: 0, falhas: 1, erro: String(r.reason?.message || r.reason) });
      console.log(`  ${nome.padEnd(16)} FALHOU: ${r.reason?.message || r.reason}`);
    }
  });

  const { vagas: unicas, colisoes } = juntar(brutas);

  // ---------- Camada 2: busca site: ----------
  let achadosBusca = [];
  let contadorBusca = null;
  if (!semDdg) {
    console.log('\n[camada 2] busca site: via DuckDuckGo');
    try {
      const r = await ddg.coletar();
      contadorBusca = r.contador;
      const conhecidos = new Set(unicas.map((v) => v.idExterno));
      achadosBusca = r.achados.filter((a) => !conhecidos.has(a.idExterno));
      console.log(`  ${r.contador.consultadas} consultas, ${r.contador.brutas} links com id, ${achadosBusca.length} que a camada 1 nao tinha`);
      if (r.bloqueado) console.log('  rate-limit do DDG no meio. Para mais volume: node scripts/enriquecer.mjs com URLs do WebSearch.');
    } catch (e) {
      console.log(`  FALHOU: ${e.message}. A camada 1 nao depende disto.`);
    }
  } else {
    console.log('\n[camada 2] desligada por --sem-ddg');
  }

  // ---------- Camada 3: portao de vida ----------
  console.log('\n[camada 3] portao de vida');
  const novasDaBusca = [];
  let zumbisBarrados = 0;

  for (const a of achadosBusca.slice(0, 25)) {
    const v = await validar(a.link);
    const vaga = {
      idExterno: a.idExterno,
      fonte: a.fonte,
      camada: 'Busca site:',
      dork: a.dork,
      titulo: v.titulo || null,
      empresa: a.empresa,
      descricao: null,
      link: a.link,
      cidade: null, estado: null, pais: null,
      modelo: null, remoto: null,
      publicadaEm: v.publicadaEm || null,
      atualizadaEm: null, prazo: null,
      salarioBruto: null,
      statusFonte: v.statusFonte || null,
      encerrada: v.encerrada === true,
      validada: v.validada === true,
      descricaoPendente: true,
    };
    if (vaga.encerrada) zumbisBarrados++;
    novasDaBusca.push(vaga);
    await dormir(500);
  }
  console.log(`  ${novasDaBusca.length} validadas, ${zumbisBarrados} com inscricao encerrada`);

  // revalida as paradas da camada 1
  const paradas = unicas.filter((v) => janela(v) === 'parada' && v.link);
  for (const v of paradas.slice(0, 15)) {
    const r = await validar(v.link);
    if (r.validada) {
      v.statusFonte = r.statusFonte || v.statusFonte;
      if (r.encerrada) { v.encerrada = true; zumbisBarrados++; }
    }
    await dormir(500);
  }
  if (paradas.length) console.log(`  ${Math.min(paradas.length, 15)} vagas paradas revalidadas`);

  // ---------- Filtro e score ----------
  const julgamentos = semantico.carregar();
  const notion = arquivo.carregar();
  const todas = [...unicas, ...novasDaBusca];
  const aprovadas = [];
  const descartadas = [];

  for (const v of todas) {
    const f = avaliar(v);
    if (!f.passa) { descartadas.push({ titulo: v.titulo, fonte: v.fonte, motivo: f.motivo }); continue; }

    v.score = calcular(v);
    v.senioridade = v.score.nivel;
    v.janela = janela(v);
    v.janelaRotulo = ROTULO[v.janela];
    v.idadeDias = idadeEmDias(v);
    v.salario = resolverSalario(v);
    v.salarioTexto = formatarSalario(v.salario);

    // Cola o julgamento semantico guardado, se existir. E o que faz o numero
    // final ser o numero final, e nao metade dele.
    semantico.aplicar(v, julgamentos);
    // O que o Notion ja sabe desta vaga. Concluida sai do radar; ja publicada
    // deixa de ser novidade. O Notion e o estado, isto e so o espelho local.
    arquivo.aplicar(v, notion);
    v.compatibilidade = compatibilidade(v, v.semantico);
    v.faixa = faixa(v.compatibilidade);

    // Parada so entra com score alto. Sem semantico ainda, usamos o deterministico
    // projetado: se nem com os 40 pontos semanticos chegaria ao minimo, cai fora.
    if (v.janela === 'parada' && v.score.determinado + perfil.pesos.semantico_max < perfil.frescor.parada_exige_score_minimo) {
      descartadas.push({ titulo: v.titulo, fonte: v.fonte, motivo: 'parada sem score para justificar' });
      continue;
    }
    aprovadas.push(v);
  }

  // Ordena pelo indice FINAL. Ordenar pelo deterministico escondia vaga boa:
  // a Nomad era a 5a com 51,5 e virou a 4a melhor com 85 depois de lida.
  // Cura as chaves que mudaram de id porque o dedupe elegeu outro vencedor.
  const chavesMigradas = semantico.migrarChaves(aprovadas);
  if (chavesMigradas) console.log(`\n  ${chavesMigradas} julgamento(s) remapeado(s): o dedupe trocou o id vencedor.`);

  const ativas = aprovadas.filter((v) => !v.concluida);
  ativas.sort((a, b) => b.compatibilidade - a.compatibilidade);

  // ---------- Cache e saida ----------
  const c = cache.carregar();
  let novas = 0;
  for (const v of aprovadas) {
    if (!c.vagas[v.idExterno]) { novas++; v.encontradaEm = new Date().toISOString(); }
    c.vagas[v.idExterno] = { ...(c.vagas[v.idExterno] || {}), ...v };
  }

  // Expurgo: entrada antiga que nao passa mais no filtro atual sai do cache.
  // Sem isto, mudar uma regra deixa lixo vivo para sempre. Foi o que aconteceu
  // com uma vaga presencial em Blumenau, que sobreviveu a regra de "so remoto".
  let expurgadas = 0;
  for (const [id, v] of Object.entries(c.vagas)) {
    const f = avaliar(v);
    if (!f.passa) { delete c.vagas[id]; expurgadas++; }
  }

  // Quinta camada: reconcilia o cache inteiro, nao so o que esta rodada
  // pescou. Pega a vaga que entrou solta numa chamada anterior (ex.: `npm run
  // apify` isolado) e so agora encontra a duplicata de fonte mais forte.
  const { vagas: reconciliadas, removidos } = reconciliarCache(c.vagas);
  const listaReconciliada = Object.values(reconciliadas);
  const julgamentosAtuais = semantico.carregar();
  for (const v of listaReconciliada) semantico.aplicar(v, julgamentosAtuais);
  const migradas = semantico.migrarChaves(listaReconciliada);
  c.vagas = reconciliadas;
  if (removidos.length) console.log(`\n  ${removidos.length} entrada(s) do cache reconciliada(s) com uma duplicata de outra chamada (${migradas} julgamento(s) migrado(s)).`);

  cache.salvar(c);

  // Toda vaga aprovada entra no quadro em "Avaliar". Quem ja esta la so tem o
  // retrato atualizado; status e historico ficam como a pessoa deixou.
  const noQuadro = quadro.registrar(aprovadas.filter((v) => !v.concluida));

  const porFonte = {};
  for (const v of aprovadas) porFonte[v.fonte] = (porFonte[v.fonte] || 0) + 1;

  const rodada = {
    dia,
    maquina: process.env.HOSTNAME || 'local',
    duracaoSegundos: Math.round((Date.now() - inicio) / 1000),
    contadores,
    contadorBusca,
    colisoesEntreFontes: colisoes,
    zumbisBarrados,
    totais: {
      brutas: brutas.length,
      unicasAposDedupe: unicas.length,
      novasDaCamada2: novasDaBusca.length,
      aprovadas: aprovadas.length,
      descartadas: descartadas.length,
      novasNoCache: novas,
      expurgadasDoCache: expurgadas,
      totalNoCache: Object.keys(c.vagas).length,
      lidas: ativas.filter((v) => v.lida).length,
      aguardandoLeitura: ativas.filter((v) => !v.lida).length,
      concluidas: aprovadas.filter((v) => v.concluida).length,
      jaNoNotion: aprovadas.filter((v) => v.noNotion && !v.concluida).length,
      novasNoQuadro: noQuadro.novas,
    },
    porFonte,
    porJanela: contarPor(aprovadas, 'janelaRotulo'),
    motivosDeDescarte: contarPor(descartadas, 'motivo'),
    aguardandoSemantico: aprovadas.slice(0, perfil.limites.max_semantico_por_rodada).map((v) => v.idExterno),
  };
  cache.salvarRodada(`rodada-${dia}.json`, rodada);

  rodada.resumoNotion = arquivo.resumo(notion);
  imprimir(rodada, ativas);
}

function contarPor(lista, campo) {
  const m = {};
  for (const x of lista) {
    const k = x[campo] || 'sem motivo';
    m[k] = (m[k] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
}

function imprimir(r, aprovadas) {
  console.log(`\n${'='.repeat(52)}\nPor fonte\n`);
  console.log('  fonte              consultas  brutas  falhas');
  for (const c of r.contadores) {
    const nota = c.erro ? `  ERRO: ${String(c.erro).slice(0, 60)}` : '';
    console.log(`  ${String(c.fonte).padEnd(18)} ${String(c.consultadas).padStart(6)} ${String(c.brutas).padStart(8)} ${String(c.falhas ?? 0).padStart(6)}${nota}`);
  }
  if (r.contadorBusca) {
    console.log(`  ${'Busca site:'.padEnd(18)} ${String(r.contadorBusca.consultadas).padStart(6)} ${String(r.contadorBusca.brutas).padStart(8)}`);
  }

  const t = r.totais;
  console.log(`\nTotais`);
  console.log(`  brutas ................ ${t.brutas}`);
  console.log(`  unicas apos dedupe .... ${t.unicasAposDedupe}  (${r.colisoesEntreFontes} colisoes entre fontes)`);
  console.log(`  achadas so na camada 2  ${t.novasDaCamada2}`);
  console.log(`  zumbis barrados ....... ${r.zumbisBarrados}`);
  console.log(`  aprovadas ............. ${t.aprovadas}`);
  console.log(`  descartadas ........... ${t.descartadas}`);
  console.log(`  novas no cache ........ ${t.novasNoCache}`);
  console.log(`  expurgadas do cache ... ${t.expurgadasDoCache}  (nao passam mais no filtro atual)`);
  console.log(`  total no cache ........ ${t.totalNoCache}`);
  console.log(`  ja lidas (indice completo) ... ${t.lidas}`);
  console.log(`  aguardando leitura ........... ${t.aguardandoLeitura}  (indice pela metade ate alguem ler)`);
  console.log(`  ja no quadro ................. ${t.jaNoNotion}`);
  console.log(`  concluidas (fora do radar) ... ${t.concluidas}`);
  console.log(`  NOVAS no quadro .............. ${t.novasNoQuadro}`);
  console.log('\n  Quadro: npm run quadro');

  console.log(`\nPor janela de frescor`);
  for (const [k, v] of Object.entries(r.porJanela)) console.log(`  ${k.padEnd(14)} ${v}`);

  console.log(`\nTop 10 pelo indice final  (~ = ainda nao lida, indice pela metade)\n`);
  for (const v of aprovadas.slice(0, 10)) {
    const marca = v.lida ? ' ' : '~';
    console.log(`  ${marca}${String(v.compatibilidade).padStart(3)}%  ${v.janelaRotulo.padEnd(10)} ${String(v.titulo).slice(0, 42).padEnd(42)} ${String(v.empresa || '?').slice(0, 22).padEnd(22)} ${v.salarioTexto}`);
  }

  console.log(`\nMotivos de descarte (top 8)`);
  for (const [k, v] of Object.entries(r.motivosDeDescarte).slice(0, 8)) console.log(`  ${String(v).padStart(4)}  ${k}`);

  console.log(`\nFeito em ${r.duracaoSegundos}s. Detalhe em data/rodada-${r.dia}.json\n`);
}

main().catch((e) => {
  console.error('\nRodada estourou:', e);
  process.exit(1);
});
