// Descoberta de EMPRESA nova a partir do dork da camada 2.
//
// POR QUE EXISTE: config/empresas-ats.json e uma lista escrita a mao, e e dela
// que sai a coleta internacional inteira. Empresa que nao esta la nunca e
// consultada, por mais que ela tenha vaga aberta. O dork `site:jobs.ashbyhq.com`
// devolve justamente as que faltam: a URL carrega o slug da empresa.
//
// Este script NAO grava em config/. Ele escreve uma sugestao em
// data/empresas-descobertas.json e voce aprova. Motivo: slug errado e
// quadro vazio sao indistinguiveis pela API (esta escrito no proprio
// empresas-ats.json), entao lista que cresce sozinha enche de empresa morta.
//
// Antes de sugerir, ele BATE NA API do provedor e conta o quadro. Sem isso a
// sugestao seria so um palpite tirado de URL.
//
//   node scripts/descobrir-empresas.mjs <url> <url> ...
//   node scripts/descobrir-empresas.mjs --arquivo data/urls-camada2.txt
//
// Uma URL por linha no arquivo. Linha vazia e comecando com # sao ignoradas.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { extrair } from '../src/busca/extrair-id.js';
import { PROVEDORES } from '../src/fontes/ats.js';
import { DIR_DADOS, RAIZ } from '../src/config.js';
import { buscar, dormir } from '../src/util.js';

// A camada 2 fala em rotulo de fonte; o ats.js fala em chave de provedor.
//
// SO ENTRA AQUI O QUE extrair-id.js SABE LER. O ats.js tem API de Workable e de
// SmartRecruiters, mas extrair() nunca devolve essas fontes porque nao ha handler
// para apply.workable.com nem para jobs.smartrecruiters.com: mapea-los aqui criava
// ramo inalcancavel e dava a impressao de cobrir quatro provedores cobrindo dois.
// Ver config/dorks.json -> _sites_sem_extrator.
const FONTE_PARA_PROVEDOR = {
  Ashby: 'ashby',
  Greenhouse: 'greenhouse',
};

const SAIDA = join(DIR_DADOS, 'empresas-descobertas.json');

const args = process.argv.slice(2);
const iArq = args.indexOf('--arquivo');
let urls = [];

if (iArq >= 0) {
  const p = args[iArq + 1];
  if (!p) {
    console.error('Falta o caminho depois de --arquivo.');
    process.exit(1);
  }
  urls = readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
} else {
  urls = args.filter((a) => a.startsWith('http'));
}

if (!urls.length) {
  console.error('Nenhuma URL. Use --arquivo <caminho> ou passe as URLs como argumento.');
  process.exit(1);
}

const jaConhecidas = new Set(
  // RAIZ, nao caminho relativo: rodando de fora de vagas/ o relativo morria com
  // ENOENT. Todo o resto do projeto resolve por aqui, e este script era a excecao.
  JSON.parse(readFileSync(join(RAIZ, 'config', 'empresas-ats.json'), 'utf8')).empresas
    .map((e) => `${e.provedor}:${String(e.org).toLowerCase()}`),
);

// 1. URL -> candidata (provedor + slug), sem repetir
const candidatas = new Map();
const semExtrator = [];   // extrair() nao reconheceu o dominio
const semDescoberta = []; // reconheceu, mas nao ha API de quadro para consultar
for (const url of urls) {
  const info = extrair(url);
  if (!info) { semExtrator.push(url); continue; }
  const provedor = FONTE_PARA_PROVEDOR[info.fonte];
  if (!provedor || !info.empresa) { semDescoberta.push(info.fonte); continue; }
  const org = String(info.empresa).toLowerCase();
  const chave = `${provedor}:${org}`;
  if (jaConhecidas.has(chave)) continue;
  if (!candidatas.has(chave)) candidatas.set(chave, { provedor, org, exemplo: url });
}

console.log(`\n${urls.length} URL(s) lida(s). ${candidatas.size} empresa(s) fora da lista atual.`);
// Dois motivos diferentes de sair, e juntar os dois era mentira: o Gupy caia no
// mesmo balde e a mensagem dizia que ele nao tem coletor, quando tem.
if (semExtrator.length) {
  console.log(`${semExtrator.length} URL(s) de dominio que extrair-id.js nao sabe ler (ver config/dorks.json -> _sites_sem_extrator).`);
}
if (semDescoberta.length) {
  const fontes = [...new Set(semDescoberta)].join(', ');
  console.log(`${semDescoberta.length} URL(s) de fonte reconhecida mas sem API de quadro para descobrir empresa: ${fontes}.`);
}
if (!candidatas.size) process.exit(0);

// 2. Bate na API de cada uma. Quadro que nao responde ou volta vazio nao vira sugestao.
const aprovadas = [];
const recusadas = [];
for (const c of [...candidatas.values()]) {
  const prov = PROVEDORES[c.provedor];
  let total = 0;
  let design = 0;
  let erro = null;
  try {
    // buscar() ja devolve JSON por padrao, e devolve null em 404/400,
    // que e exatamente o que um slug inventado produz.
    // Slug encodado: ele sai de segmento de caminho JA decodificado por new URL(),
    // entao uma barra escapada na origem viraria outro endpoint aqui.
    const json = await buscar(prov.url(encodeURIComponent(c.org)), { tentativas: 2 });
    const vagas = json ? (prov.extrair(json) || []) : [];
    total = vagas.length;
    design = vagas.filter((v) => /design/i.test(v.title || v.name || v.text || '')).length;
  } catch (e) {
    erro = e.message?.slice(0, 60) || 'falhou';
  }
  const linha = { ...c, total, design, erro };
  if (!erro && total > 0) aprovadas.push(linha); else recusadas.push(linha);
  console.log(`  ${erro ? 'x' : total ? 'ok' : '--'} ${c.provedor}/${c.org}  quadro=${total} design=${design}${erro ? '  ' + erro : ''}`);
  await dormir(700);
}

// 3. Grava a sugestao. Ordena por vaga de design, porque e o que decide entrar.
aprovadas.sort((a, b) => b.design - a.design || b.total - a.total);
mkdirSync(DIR_DADOS, { recursive: true });
writeFileSync(SAIDA, JSON.stringify({
  _nota: 'Sugestao do scripts/descobrir-empresas.mjs. NAO e config: copie a mao para config/empresas-ats.json o que quiser manter.',
  geradoEm: new Date().toISOString(),
  aprovadas,
  recusadas,
}, null, 2));

console.log(`\n${aprovadas.length} com quadro vivo, ${recusadas.length} descartada(s).`);
console.log(`Sugestao em ${SAIDA}`);
if (aprovadas.length) {
  console.log('\nPara adicionar, copie as linhas que interessarem para config/empresas-ats.json:');
  for (const a of aprovadas.slice(0, 15)) {
    console.log(`  { "provedor": "${a.provedor}", "org": "${a.org}" },   // ${a.design} de design em ${a.total}`);
  }
}
