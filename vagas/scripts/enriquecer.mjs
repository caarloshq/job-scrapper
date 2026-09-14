// Camada 2, o caminho que funciona de verdade.
//
// O DuckDuckGo RATE-LIMITA: rende nas 2-3 primeiras consultas e depois devolve
// pagina de anomalia. Para volume, quem roda a busca `site:` e o Claude, com
// WebSearch, e passa as URLs para ca. Este script faz o resto SEM LLM: extrai o
// id da URL, dedupa contra o cache, aplica o portao de vida e grava.
//
// O portao aqui nao e enfeite: em 2026-07-30, de 7 URLs que o Google devolveu
// para site:gupy.io "product designer" senior, SEIS estavam mortas (frozen,
// closed). O indice do Google para Gupy e majoritariamente lixo.
//
//   node scripts/enriquecer.mjs <url> <url> ...
//   node scripts/enriquecer.mjs --arquivo urls.txt
//
// Uma URL por linha no arquivo. Linha vazia e comecando com # sao ignoradas.
import { readFileSync } from 'node:fs';
import { extrair } from '../src/busca/extrair-id.js';
import { validar } from '../src/liveness.js';
import * as cache from '../src/cache.js';
import { avaliar } from '../src/filtro.js';
import { calcular, compatibilidade } from '../src/score.js';
import { janela, ROTULO } from '../src/frescor.js';
import { resolver as resolverSalario, formatar as formatarSalario } from '../src/salario.js';
import { dormir } from '../src/util.js';

const args = process.argv.slice(2);
const iArq = args.indexOf('--arquivo');
let urls = [];

if (iArq >= 0) {
  const p = args[iArq + 1];
  if (!p) {
    console.error('Falta o caminho depois de --arquivo.');
    process.exit(1);
  }
  urls = readFileSync(p, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
} else {
  urls = args.filter((a) => a.startsWith('http'));
}

if (!urls.length) {
  console.error('Nenhuma URL. Uso: node scripts/enriquecer.mjs <url>... | --arquivo urls.txt');
  process.exit(1);
}

const c = cache.carregar();
const jaTinha = new Set(Object.keys(c.vagas));

const relatorio = { recebidas: urls.length, semId: 0, jaNoCache: 0, mortas: 0, naoVerificadas: 0, reprovadas: 0, novas: 0 };
const novas = [];

console.log(`\nCamada 2 — ${urls.length} URL(s) do WebSearch\n${'='.repeat(56)}\n`);

for (const url of urls) {
  const id = extrair(url);
  if (!id) {
    relatorio.semId++;
    console.log(`  [sem id ] ${url.slice(0, 78)}`);
    continue;
  }
  if (jaTinha.has(id.idExterno)) {
    relatorio.jaNoCache++;
    console.log(`  [ja tem ] ${id.idExterno}`);
    continue;
  }

  const v = await validar(url);
  const vaga = {
    idExterno: id.idExterno,
    fonte: id.fonte,
    camada: 'Busca site:',
    titulo: v.titulo || null,
    empresa: id.empresa,
    descricao: null,
    descricaoPendente: true,
    link: url,
    cidade: null, estado: null, pais: null,
    modelo: null, remoto: null,
    publicadaEm: v.publicadaEm || null,
    atualizadaEm: null, prazo: null,
    salarioBruto: null,
    statusFonte: v.statusFonte || null,
    encerrada: v.encerrada === true,
    validada: v.validada === true,
    encontradaEm: new Date().toISOString(),
  };

  if (vaga.encerrada) {
    relatorio.mortas++;
    console.log(`  [morta  ] ${id.idExterno}  status=${v.statusFonte}  ${String(v.titulo || '').slice(0, 40)}`);
    await dormir(500);
    continue;
  }

  // A pagina nao respondeu: NAO deixe o filtro rotular isso como "sem titulo",
  // que esconde a causa. Sem validacao nao ha o que pontuar, e "nao sei" e uma
  // resposta diferente de "esta morta".
  if (!v.validada) {
    relatorio.naoVerificadas++;
    console.log(`  [?      ] ${id.idExterno}  nao deu para verificar: ${v.motivo}`);
    await dormir(500);
    continue;
  }

  const f = avaliar(vaga);
  if (!f.passa) {
    relatorio.reprovadas++;
    console.log(`  [fora   ] ${id.idExterno}  ${f.motivo}`);
    await dormir(500);
    continue;
  }

  vaga.score = calcular(vaga);
  vaga.senioridade = vaga.score.nivel;
  vaga.janela = janela(vaga);
  vaga.janelaRotulo = ROTULO[vaga.janela];
  vaga.salario = resolverSalario(vaga);
  vaga.salarioTexto = formatarSalario(vaga.salario);
  vaga.compatibilidade = compatibilidade(vaga);

  c.vagas[vaga.idExterno] = vaga;
  novas.push(vaga);
  relatorio.novas++;
  console.log(`  [NOVA   ] ${String(vaga.compatibilidade).padStart(3)}%  ${String(vaga.titulo || '?').slice(0, 44).padEnd(44)} ${vaga.empresa || '?'}`);
  await dormir(500);
}

if (relatorio.novas) cache.salvar(c);

console.log(`\n${'='.repeat(56)}`);
for (const [k, n] of Object.entries(relatorio)) console.log(`  ${k.padEnd(12)} ${n}`);
if (relatorio.novas) {
  console.log(`\n${relatorio.novas} vaga(s) que a camada 1 nao tinha. Descricao pendente:`);
  console.log('abrir o link, ler, e pontuar o semantico antes de sincronizar no Notion.\n');
} else {
  console.log('\nNenhuma vaga nova. A camada 1 ja tinha tudo, ou as URLs estao mortas.\n');
}
