import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROVEDORES } from '../src/fontes/ats.js';
import { lerPagina, coletarDe as coletarPortais } from '../src/fontes/portais.js';
import { expandirConsultas, coletarDe } from '../src/fontes/gringas.js';
import { criarFontes, perfilDeDesign } from '../src/fontes-registro.js';
import { juntar } from '../src/dedupe.js';
const po = { consultas_estreitas: ['product owner', 'product manager'], titulo_aceito: { 'product owner': 20, 'product manager': 16 }, titulo_excluido: ['designer'], cargo_excluido: [] };

test('Lever direto preserva listas, descrição, localidades e fatos desconhecidos', () => {
  assert.equal(PROVEDORES.lever.url('empresa-exemplo'), 'https://api.lever.co/v0/postings/empresa-exemplo?mode=json');
  const v = PROVEDORES.lever.normalizar({ id: '123', text: 'Product Owner', description: '<p>Produto</p>', lists: [{text:'Requisitos',content:'<li>Backlog</li>'}], additionalPlain:'Benefícios', categories: { location:'Remote',allLocations:['Brazil','Remote'] }, hostedUrl:'https://jobs.lever.co/example/123' }, 'example');
  assert.match(v.descricao, /Produto Requisitos Backlog Benefícios/);
  assert.equal(v.local, 'Remote; Brazil');
  assert.equal(v.remoto,null); assert.equal(v.publicadaEm,null); assert.equal(v.salarioBruto,null);
});
test('Greenhouse continua disponível junto de Lever', () => {
  assert.ok(PROVEDORES.greenhouse.url('example').includes('boards-api.greenhouse.io'));
  assert.equal(PROVEDORES.greenhouse.normalizar({id:2,title:'PO',content:'<p>Backlog</p>',location:{name:'Brazil'}} ,'example').descricao,'Backlog');
});
test('portais extraem links reais sem inventar remoto, salário ou empresa', () => {
  for (const [id,url] of [['vanhack','https://app.vanhack.com/job/12034'],['trampos','https://trampos.co/oportunidades/774928-product-owner'],['dribbble','https://dribbble.com/jobs/309878-designer'],['wellfound','https://wellfound.com/jobs/123456-product-owner']]) {
    const [v] = lerPagina(`<a href="${url}">Product Owner</a>`,id);
    assert.equal(v.link,url);assert.equal(v.remoto,null);assert.equal(v.salarioBruto,null);assert.equal(v.empresa,null);assert.equal(v.validada,false);assert.equal(v.descricaoPendente,true);
  }
});
test('JSON-LD preserva descrição e modalidade explícita, sem inferir Brasil', () => {
  const html='<script type="application/ld+json">'+JSON.stringify({'@type':'JobPosting',title:'Product Owner',url:'https://wellfound.com/jobs/123456-product-owner',description:'<p>Backlog</p>',jobLocationType:'TELECOMMUTE',datePosted:'2026-11-03',hiringOrganization:{name:'Exemplo'}})+'</script>';
  const [v]=lerPagina(html,'wellfound');assert.equal(v.remoto,true);assert.equal(v.empresa,'Exemplo');assert.equal(v.descricao,'Backlog');assert.equal(v.elegibilidadeLatam,null);
});
test('portais não seguem links externos, credenciais ou apply_now',()=>{
 assert.equal(lerPagina('<a href="https://dribbble.com/jobs/1-test/apply_now">Apply</a><a href="https://evil.test/jobs/1-test">Product Owner</a><a href="https://secret@dribbble.com/jobs/1-test">Product Owner</a>','dribbble').length,0);
});
test('403 não vira sucesso vazio; Authentic Jobs fica assistida; PO não consulta Dribbble',async()=>{
 let chamadas=0;
 const r=await coletarPortais([{id:'dribbble',enabled:true},{id:'wellfound',enabled:true},{id:'authenticjobs',enabled:true}],{incluirDesign:false,fetchImpl:async()=>{chamadas++;return {ok:false,status:403};}});
 assert.equal(chamadas,1);assert.equal(r.contador.falhas,1);assert.equal(r.porFonte.Wellfound.erro,'HTTP 403');assert.equal(r.porFonte['Authentic Jobs'].estado,'assistida');
});
test('HTML sem links fica inconclusivo, não zero vagas confirmado',async()=>{
 const r=await coletarPortais([{id:'vanhack',enabled:true}],{fetchImpl:async()=>({ok:true,headers:new Headers(),text:async()=>'<div id="app"></div>'})});
 assert.equal(r.porFonte.VanHack.estado,'sem_links_verificaveis');
});
test('perfil PO usa consultas PO nos providers, não herda designer da config',()=>{
 const fontes=[{provider:'builtin',builtin:{queries:['ux designer']},enabled:true},{provider:'torre',search:'designer',enabled:true},{provider:'wttj',wttj:{queries:['designer']},enabled:true},{provider:'a16z',q:'designer',enabled:true}];
 const out=expandirConsultas(fontes,po);
 assert.deepEqual(out[0].builtin.queries,po.consultas_estreitas);assert.equal(out[1].search,'product owner');assert.equal(out[2].search,'product manager');assert.deepEqual(out[3].wttj.queries,po.consultas_estreitas);assert.equal(out[4].q,'product owner');
 assert.equal(fontes[0].builtin.queries[0],'ux designer');
});
test('teste avulso PO: coleta simulada, filtro profissional/país, normalização e dedupe',async()=>{
 const entradas=[{name:'Built In',provider:'builtin',enabled:true,builtin:{queries:['designer']}}];
 let consultas;
 const vagas=[{title:'Senior Product Owner',company:'Empresa fictícia A',url:'https://example.com/jobs/po',location:'Remote · Brazil',description:'Produto e backlog'}, {title:'Product Owner',company:'Empresa fictícia B',url:'https://example.com/jobs/us',location:'United States, Remote'}, {title:'UX Designer',url:'https://example.com/jobs/design',location:'Remote · Brazil'}];
 const r=await coletarDe(entradas,async()=>({fetch:async entrada=>{consultas=entrada.builtin.queries;return [...vagas,vagas[0]];}}),{},po);
 assert.deepEqual(consultas,po.consultas_estreitas);assert.equal(r.vagas.length,1);assert.equal(r.vagas[0].titulo,'Senior Product Owner');assert.equal(r.vagas[0].elegibilidadeLatam,true);
 const unicas=juntar([...r.vagas,...r.vagas]).vagas;assert.equal(unicas.length,1);
 const nomes=criarFontes({perfil:{cargo_alvo:'Product Owner'},palavras:po}).map(x=>x.NOME);
 assert.ok(nomes.includes('Gringas (career-ops)'));assert.ok(nomes.includes('ATS internacional'));assert.ok(!nomes.includes('Vagas UX'));assert.ok(!nomes.includes('UX Jobs'));
 assert.equal(perfilDeDesign({cargo_alvo:'Product Owner'}, {titulo_aceito:{designer:10}}),false);
});
test('local desconhecido de provider não é convertido em remoto automaticamente',async()=>{
 const r=await coletarDe([{name:'Fonte',provider:'teste',enabled:true}],async()=>({fetch:async()=>[{title:'Product Owner',url:'https://example.com/job',location:'Brazil'}]}),{},po);
 assert.equal(r.vagas[0].remoto,null);
});

test('provider real Remotive até adaptador PO mantém empresa desconhecida', async () => {
  const provider = (await import('../src/fontes/careerops/providers/remotive.mjs')).default;
  const result = await coletarDe([{provider:'remotive',name:'Remotive',enabled:true}], async()=>provider, {fetchJson:async()=>({jobs:[{title:'Product Owner',url:'https://remotive.com/remote-jobs/product/po-123',candidate_required_location:'Worldwide'}]})},po);
  assert.equal(result.vagas.length,1);
  assert.equal(result.vagas[0].empresa,null);
  assert.equal(result.vagas[0].titulo,'Product Owner');
});
test('Lever híbrido não vira presencial e datas impossíveis não viram fatos', () => {
  const v=PROVEDORES.lever.normalizar({workplaceType:'hybrid'},'example');
  assert.equal(v.modelo,'hibrido'); assert.equal(v.remoto,false);
  const [p]=lerPagina(`<script type="application/ld+json">${JSON.stringify({'@type':'JobPosting',title:'Product Owner',url:'https://wellfound.com/jobs/123-product-owner',datePosted:'2026-02-31',validThrough:'2026-04-31'})}</script>`,'wellfound');
  assert.equal(p.publicadaEm,null); assert.equal(p.prazo,null);
});

test('PO avulso usa configuração de profissão no filtro e score reais sem mudar arquivos', async () => {
  const {palavras,perfil}=await import('../src/config.js');
  const {avaliar}=await import('../src/filtro.js');
  const {calcular}=await import('../src/score.js');
  const anteriorPalavras=structuredClone(palavras), anteriorPerfil=structuredClone(perfil);
  try {
    Object.assign(palavras,po,{consultas_amplas:['Product Owner'],dominio_alto:['produto'],dominio_medio:[],sinais:['backlog','roadmap']});
    Object.assign(perfil,{cargo_alvo:'Product Owner',modelo_desconhecido_passa:true});
    const provider=(await import('../src/fontes/careerops/providers/remotive.mjs')).default;
    const r=await coletarDe([{provider:'remotive',name:'Remotive',enabled:true}],async()=>provider,{fetchJson:async()=>({jobs:[{title:'Senior Product Owner',company_name:'Empresa fictícia',url:'https://remotive.com/remote-jobs/product/fixture-po',candidate_required_location:'Worldwide'},{title:'UX Designer',url:'https://remotive.com/remote-jobs/design/fixture',candidate_required_location:'Worldwide'}]})},palavras);
    assert.equal(r.vagas.length,1);
    const v={...r.vagas[0],descricao:'Produto, backlog, roadmap e priorização.',publicadaEm:'2026-11-03T12:00:00Z'};
    assert.equal(avaliar(v,new Date('2026-11-04')).passa,true);
    assert.equal(calcular(v,new Date('2026-11-04')).parcelas.titulo,20);
    assert.equal(calcular({...v,titulo:'UX Designer'},new Date('2026-11-04')).parcelas.titulo,0);
  } finally { for(const k of Object.keys(palavras)) delete palavras[k];Object.assign(palavras,anteriorPalavras);for(const k of Object.keys(perfil)) delete perfil[k];Object.assign(perfil,anteriorPerfil); }
});

test('outros agregadores não usam nome do portal como empregador', async()=>{
 const {normalizeGetonbrdJob}=await import('../src/fontes/careerops/providers/getonbrd.mjs');
 const {normalizeLandingJob}=await import('../src/fontes/careerops/providers/landingjobs.mjs');
 const {normalizeMuseJob}=await import('../src/fontes/careerops/providers/themuse.mjs');
 assert.equal(normalizeGetonbrdJob({attributes:{title:'Product Owner'},links:{public_url:'https://www.getonbrd.com/jobs/po'}},'Portal').company,null);
 assert.equal(normalizeLandingJob({title:'Product Owner',url:'https://landing.jobs/test'},'Portal').company,null);
 assert.equal(normalizeMuseJob({name:'Product Owner',refs:{landing_page:'https://www.themuse.com/jobs/po'}}).company,null);
});
