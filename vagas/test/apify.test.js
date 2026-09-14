import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataRelativa, nivelDoLinkedIn, salarioDoTexto, remotoPelaBusca, normalizar } from '../src/fontes/apify.js';

const AGORA = new Date('2026-08-01T12:00:00Z');
const dias = (iso) => Math.round((AGORA - new Date(iso)) / 86400000);

test('postedTime relativo vira data, porque postedDate vem vazio em 82% dos itens', () => {
  assert.equal(dias(dataRelativa('1 day ago', AGORA)), 1);
  assert.equal(dias(dataRelativa('3 days ago', AGORA)), 3);
  assert.equal(dias(dataRelativa('1 week ago', AGORA)), 7);
  assert.equal(dias(dataRelativa('2 weeks ago', AGORA)), 14);
  assert.equal(dias(dataRelativa('2 months ago', AGORA)), 60);
  assert.equal(dias(dataRelativa('just now', AGORA)), 0);
});

test('texto de data não reconhecido devolve null, nunca "hoje"', () => {
  // Chutar hoje faria vaga velha parecer nova, que é o erro caro nesta direção.
  for (const t of ['', 'anteontem', 'sometime', null, undefined, 'ago']) {
    assert.equal(dataRelativa(t, AGORA), null, String(t));
  }
});

test('Entry level é júnior; Mid-Senior é ambíguo e não decide', () => {
  assert.equal(nivelDoLinkedIn('Entry level'), 'junior');
  assert.equal(nivelDoLinkedIn('Internship'), 'junior');
  assert.equal(nivelDoLinkedIn('Director'), 'senior');
  // O LinkedIn junta pleno e sênior num rótulo só: deixa o senioridade.js ler o texto.
  assert.equal(nivelDoLinkedIn('Mid-Senior level'), null);
  assert.equal(nivelDoLinkedIn('Associate'), null);
  assert.equal(nivelDoLinkedIn('Not Applicable'), null);
});

test('R$ é lido como BRL, nunca como USD', () => {
  // Erro real deste projeto: uma bolsa de R$ 2.000 foi publicada como "USD 2k"
  // porque o cifrão casou sozinho. Aqui o R$ tem que ser testado antes.
  const s = salarioDoTexto('R$8,100.00/mo');
  assert.equal(s.currency, 'BRL');
  assert.equal(s.de, 8100);
  assert.equal(s.type, 'monthly');

  const anual = salarioDoTexto('$40,000.00/yr - $50,000.00/yr');
  assert.equal(anual.currency, 'USD');
  assert.equal(anual.de, 40000);
  assert.equal(anual.ate, 50000);
  assert.equal(anual.type, 'yearly');
});

test('salário por hora devolve null: virar mês exigiria carga horária que o anúncio não declara', () => {
  assert.equal(salarioDoTexto('$15.00/hr - $85.00/hr'), null);
  assert.equal(salarioDoTexto(''), null);
  assert.equal(salarioDoTexto('a combinar'), null);
});

test('remoto vem do filtro f_WT=2 da busca, e some quando ele some', () => {
  assert.equal(remotoPelaBusca('https://www.linkedin.com/jobs/search?keywords=x&location=Brazil&f_WT=2&position=1'), true);
  // Sem a marca não assume remoto: devolve null e o filtro decide pelas outras pistas.
  assert.equal(remotoPelaBusca('https://www.linkedin.com/jobs/search?keywords=x&location=Brazil'), null);
  assert.equal(remotoPelaBusca(''), null);
});

test('item real do dataset vira vaga do pipeline', () => {
  const v = normalizar({
    jobUrl: 'https://www.linkedin.com/jobs/view/4410882420',
    jobTitle: 'Ux Designer',
    companyName: 'Jump',
    jobDescription: 'Atuação de um(a) UX Designer Sênior com foco em discovery e design system.',
    location: 'Brazil',
    seniorityLevel: 'Mid-Senior level',
    postedDate: '',
    postedTime: '1 week ago',
    salary: '',
    sourceSearchUrl: 'https://www.linkedin.com/jobs/search?keywords=x&f_WT=2&position=1',
  }, AGORA);

  assert.equal(v.idExterno, 'linkedin:4410882420');
  assert.equal(v.empresa, 'Jump');
  assert.equal(v.remoto, true);
  assert.equal(v.modelo, 'remoto');
  assert.equal(v.pais, 'Brasil');
  assert.equal(dias(v.publicadaEm), 7);
  assert.equal(v.cidade, null, 'location "Brazil" é país, não cidade: preencher seria inventar precisão');
  assert.equal(v.senioridade, undefined, 'Mid-Senior não decide, deixa o senioridade.js ler');
});

test('item do curious_coder vira a mesma vaga, com o id que casa com o Notion', () => {
  // Amostra real do dataset de 2026-09-14. O link traz slug antes do número:
  // lido pelo regex antigo, o id saía errado e a vaga repetida parecia inédita.
  const v = normalizar({
    id: '4465163818',
    link: 'https://br.linkedin.com/jobs/view/product-owner-po-developer-senior-fluent-english-at-gx2-tecnologia-4465163818?position=50&pageNum=0',
    title: 'Senior Product Designer',
    companyName: 'GX2 Tecnologia',
    descriptionText: 'Buscamos Product Designer Sênior para atuar com design system.',
    location: 'São Paulo, São Paulo, Brazil',
    postedAt: '2026-09-09',
    salary: '',
    seniorityLevel: 'Not Applicable',
    inputUrl: 'https://www.linkedin.com/jobs/search/?keywords=x&location=Brazil&geoId=106057199&f_WT=2&f_TPR=r604800',
  }, AGORA);

  assert.equal(v.idExterno, 'linkedin:4465163818');
  assert.equal(v.link, 'https://www.linkedin.com/jobs/view/4465163818');
  assert.equal(v.empresa, 'GX2 Tecnologia');
  assert.equal(v.remoto, true, 'o f_WT=2 vem no inputUrl');
  assert.equal(v.pais, 'Brasil');
  assert.equal(v.publicadaEm.slice(0, 10), '2026-09-09');
  assert.equal(v.senioridade, undefined, 'Not Applicable não decide');
});

test('item do curious_coder sem id nenhum é descartado', () => {
  assert.equal(normalizar({ link: 'https://br.linkedin.com/jobs/view/sem-numero', title: 'X' }), null);
});

test('item malformado é descartado, não vira vaga quebrada', () => {
  assert.equal(normalizar({ jobTitle: 'sem link' }), null);
  assert.equal(normalizar({ jobUrl: 'https://x/jobs/view/1' }), null);
  assert.equal(normalizar(null), null);
});

test('número sem separador de milhar não perde dígito', () => {
  // O dataset que eu vi só tinha formato americano com vírgula, então os
  // primeiros testes passaram e o defeito escapou. R$ 12000 virava 120, que
  // cai abaixo do piso e faz o filtro DESCARTAR a vaga em silêncio.
  assert.equal(salarioDoTexto('R$8100/mo').de, 8100);
  assert.equal(salarioDoTexto('R$ 12000/mo').de, 12000);
  assert.equal(salarioDoTexto('$9500/yr').de, 9500);
});

test('formato brasileiro de milhar e centavo é lido certo', () => {
  const s = salarioDoTexto('R$1.500,00/mo');
  assert.equal(s.currency, 'BRL');
  assert.equal(s.de, 1500);
});

test('faixa com os dois lados iguais não vira faixa falsa', () => {
  const s = salarioDoTexto('R$17,000.00/mo - R$17,000.00/mo');
  assert.equal(s.de, 17000);
  assert.equal(s.ate, 17000);
});

// ---------- disparo direto do Actor (2026-09-14) ----------
import { montarUrlBusca, montarInput, modo } from '../src/fontes/apify.js';

test('a URL de busca leva país, geoId, remoto e janela de dias, e recusa busca sem país', () => {
  const u = new URL(montarUrlBusca({ keywords: 'product designer', location: 'Brazil', geoId: '106057199', remoto: true, dias: 7 }));
  assert.equal(u.searchParams.get('keywords'), 'product designer');
  assert.equal(u.searchParams.get('location'), 'Brazil');
  assert.equal(u.searchParams.get('geoId'), '106057199');
  assert.equal(u.searchParams.get('f_WT'), '2', 'f_WT=2 é o que remotoPelaBusca() lê de volta');
  assert.equal(u.searchParams.get('f_TPR'), 'r604800');
  // Sem país o LinkedIn devolveu 100 de 100 vagas nos EUA (2026-09-14).
  assert.throws(() => montarUrlBusca({ keywords: 'x' }), /location e busca.geoId/);
  assert.throws(() => montarUrlBusca({ location: 'Brazil', geoId: '1' }), /keywords/);
});

test('remoto desligado não põe f_WT, e o input do Actor sai no formato que ele espera', () => {
  const u = new URL(montarUrlBusca({ keywords: 'x', location: 'Brazil', geoId: '1', remoto: false }));
  assert.equal(u.searchParams.get('f_WT'), null);
  const input = montarInput({ busca: { keywords: 'x', location: 'Brazil', geoId: '1' }, limite_por_busca: 50, enriquecer_empresa: false });
  assert.deepEqual(Object.keys(input).sort(), ['autoConvertToAiSearch', 'companyIds', 'datePosted', 'limitPerSource', 'scrapeCompany', 'splitByLocation', 'under10Applicants', 'urls'].sort());
  assert.equal(input.limitPerSource, 50);
  assert.equal(input.scrapeCompany, false);
  assert.equal(input.urls.length, 1);
});

test('o caminho da coleta: só o token basta com linkedin.json; a Task, quando existe, manda', () => {
  const linkedin = { actor: 'abc', busca: { keywords: 'x', location: 'Brazil', geoId: '1' } };
  assert.equal(modo({ token: 't', linkedin }), 'actor');
  assert.equal(modo({ token: 't', task: 'eu~task', linkedin }), 'task');
  assert.equal(modo({ token: 't' }), 'desligado');
  assert.equal(modo({ task: 'eu~task', linkedin }), 'desligado', 'sem token nada roda');
});
