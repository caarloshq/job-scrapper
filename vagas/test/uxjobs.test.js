import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerIndice, aceitaBrasil, tituloLimpo, paraVaga, lerDetalhe } from '../src/fontes/uxjobs.js';
import { idCanonico } from '../src/dedupe.js';

// Itens reais do bloco jobs-data da home de jobs.uxjobs.io, copiados em
// 2026-10-06. Um de cada caso que decide se a vaga entra.
const ITENS = [
  { s: 'senior-product-designer-feegow-100-remote-friendly-in-brazil-docplanner-3u0ion', u: 'https://jobs.ashbyhq.com/docplanner/37b73df0-6fc5-4bbe-9bfe-69a4e4d6a474', t: 'Senior Product Designer - Feegow (100% remote friendly in Brazil) - Docplanner', co: 'Docplanner', l: 'Rio de Janeiro, Curitiba, São Paulo', rm: 1, sl: 'Ashby', c: 'BR', wp: 'Remote', sen: 'Senior', p: 1790258300117 },
  { s: 'product-designer-end-user-autofill-bitwarden-mc8cpr', u: 'https://bitwarden.com/careers/8013629003/?gh_jid=8013629003', t: 'Product Designer - End User (Autofill) - Bitwarden', co: 'Bitwarden', l: 'Remote', rm: 1, sl: 'Greenhouse', c: '', wp: '', sen: 'Mid-level', p: 1791304968000 },
  { s: 'senior-product-designer-ux-ui-sombra-dqlht7', u: 'https://jobs.dou.ua/companies/sombra/vacancies/375786/', t: 'Senior Product Designer (UX/UI) - Sombra', co: 'Sombra', l: 'Remote', rm: 1, sl: 'DOU (Ukraine)', c: '', wp: 'Remote', sen: 'Senior', p: 1791314422058 },
  { s: 'brand-designer-dourolabs-2dl0oa', u: 'https://jobs.ashbyhq.com/dourolabs.xyz/72e511c9-c023-4bef-9fb9-c183b217ef7b', t: 'Brand Designer - Dourolabs', co: 'Dourolabs', l: 'North America - Remote', rm: 1, sl: 'Ashby', c: '', wp: 'Remote', sen: 'Mid-level', p: 1790433532016 },
  { s: 'ux-researcher-vasco-ronypi', u: 'https://jobs.ashbyhq.com/vasco/819dd3b4-d8a8-4931-80d9-c2fd1443ce5a', t: 'UX Researcher - Vasco', co: 'Vasco', l: 'Montreal Office', rm: 0, sl: 'Ashby', c: 'CA', wp: 'Hybrid', sen: 'Mid-level', p: 1791319849789 },
  { s: 'visual-design-intern-testsprite-20vmxv', u: 'https://www.testsprite.com/careers/visual-design-intern', t: 'Visual Design Intern - TestSprite', co: 'TestSprite', l: 'Remote', rm: 1, sl: 'Start-Ups & VC', c: '', wp: 'Remote', sen: 'Junior / Entry', p: 1791196064564 },
  { s: 'ai-native-product-designer-breakmark-w629sa', u: 'https://jobs.ashbyhq.com/breakmark/29c5bcda-b289-49ca-8cbb-37b45f654fcb', t: 'AI-Native Product Designer - Breakmark', co: 'Breakmark', l: 'Anywhere in Latin America', rm: 1, sl: 'Ashby', c: '', wp: '', sen: 'Mid-level', p: 1790768308938 },
];
const AGORA = Date.UTC(2026, 9, 7);
const HOME = `<html><script type="application/json" id="jobs-data">${JSON.stringify(ITENS)}</script></html>`;
const porEmpresa = (co) => ITENS.find((j) => j.co === co);

test('le o indice inteiro do bloco jobs-data', () => {
  assert.equal(lerIndice(HOME).length, ITENS.length);
});

test('home sem o bloco, ou com JSON quebrado, devolve lista vazia e nao derruba a rodada', () => {
  assert.deepEqual(lerIndice('<html></html>'), []);
  assert.deepEqual(lerIndice('<script id="jobs-data">[{quebrado</script>'), []);
});

test('pais declarado decide: Brasil e America Latina entram, Ucrania e America do Norte saem', () => {
  assert.equal(aceitaBrasil(porEmpresa('Docplanner')), true);
  assert.equal(aceitaBrasil(porEmpresa('Breakmark')), true);
  assert.equal(aceitaBrasil(porEmpresa('Sombra')), false, 'quadro ucraniano so publica para a Ucrania');
  assert.equal(aceitaBrasil(porEmpresa('Dourolabs')), false, '"North America" nao inclui o Brasil');
  assert.equal(aceitaBrasil(porEmpresa('Vasco')), false);
});

test('"Remote" sem pais passa como desconhecido: quem corta e a leitura, por decisao do pessoa', () => {
  assert.equal(aceitaBrasil(porEmpresa('Bitwarden')), null);
  assert.ok(paraVaga(porEmpresa('Bitwarden'), AGORA));
});

test('hibrido, junior e pais excluido nem viram vaga', () => {
  assert.equal(paraVaga(porEmpresa('Vasco'), AGORA), null);
  assert.equal(paraVaga(porEmpresa('TestSprite'), AGORA), null);
  assert.equal(paraVaga(porEmpresa('Sombra'), AGORA), null);
  assert.equal(paraVaga(porEmpresa('Dourolabs'), AGORA), null);
});

test('vaga mais velha que 45 dias nao entra', () => {
  assert.equal(paraVaga({ ...porEmpresa('Docplanner'), p: AGORA - 50 * 864e5 }, AGORA), null);
});

test('titulo perde o " - Empresa" do fim, e o link e o da ATS de origem', () => {
  const v = paraVaga(porEmpresa('Docplanner'), AGORA);
  assert.equal(tituloLimpo(porEmpresa('Docplanner')), 'Senior Product Designer - Feegow (100% remote friendly in Brazil)');
  assert.equal(v.link, 'https://jobs.ashbyhq.com/docplanner/37b73df0-6fc5-4bbe-9bfe-69a4e4d6a474');
  assert.equal(v.idExterno, 'uxjobs:senior-product-designer-feegow-100-remote-friendly-in-brazil-docplanner-3u0ion');
});

test('a mesma vaga vinda do Ashby direto e reconhecida pelo dedupe', () => {
  // Sem isto, toda vaga do UX Jobs que o coletor ja pega na ATS viraria cartao
  // duplicado no Notion.
  const v = paraVaga(porEmpresa('Docplanner'), AGORA);
  assert.equal(idCanonico(v), 'ashby:37b73df0-6fc5-4bbe-9bfe-69a4e4d6a474');
});

test('descricao vem do JobPosting da pagina /jobs/<slug>/, e pagina sem ele devolve null', () => {
  const html = '<script type="application/ld+json">{"@type":"BreadcrumbList"}</script><script type="application/ld+json">{"@context":"https://schema.org/","@type":"JobPosting","title":"Senior Product Designer","description":"\\u003cp>Hands-on product design role, embedded in a cross-functional squad.\\u003c/p>"}</script>';
  assert.match(lerDetalhe(html), /Hands-on product design role/);
  assert.equal(lerDetalhe('<p>The full job description lives on the original posting</p>'), null);
});

test('trecho do anuncio terminado em reticencias nao conta como descricao', () => {
  // A pagina da Breakmark trazia so o comeco do anuncio, cortado em "Explore
  // what…". Sem isto, a vaga era lida pela metade e a origem nunca era consultada.
  const html = '<script type="application/ld+json">{"@type":"JobPosting","description":"AI-Native Product Designer. The role owns the design of the product in an AI-first environment. Explore what…"}</script>';
  assert.equal(lerDetalhe(html), null);
});


