// Uma linha por dependencia e por fonte. Verde ou vermelho, e sai != 0 se faltar
// algo essencial. E o primeiro comando a rodar quando algo estiver estranho:
// acaba com o "na minha maquina funciona".
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ } from '../src/config.js';

const OK = '  ok  ';
const RUIM = ' FALHA';
const AVISO = ' aviso';
let essencialFaltando = 0;

function linha(marca, nome, detalhe = '') {
  console.log(`[${marca}] ${nome.padEnd(30)} ${detalhe}`);
}

function checar(nome, fn, { essencial = true } = {}) {
  try {
    const d = fn();
    linha(OK, nome, d || '');
  } catch (e) {
    linha(essencial ? RUIM : AVISO, nome, String(e.message || e).slice(0, 90));
    if (essencial) essencialFaltando++;
  }
}

async function checarFonte(nome, url, opcoes = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0', ...(opcoes.headers || {}) } });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const txt = await res.text();
    linha(OK, nome, `HTTP ${res.status}, ${txt.length}B`);
  } catch (e) {
    clearTimeout(t);
    linha(AVISO, nome, String(e.message || e).slice(0, 60));
  }
}

console.log('\nCaca-vagas — doctor\n' + '='.repeat(52) + '\n\nAmbiente');

checar('Node >= 20', () => {
  const maior = Number(process.versions.node.split('.')[0]);
  if (maior < 20) throw new Error(`v${process.versions.node} e antigo; fetch nativo precisa de 20+`);
  return `v${process.versions.node}`;
});

checar('fetch nativo', () => {
  if (typeof fetch !== 'function') throw new Error('ausente');
  return 'presente';
});

checar('python3', () => execFileSync('python3', ['-V'], { encoding: 'utf8' }).trim());

checar(
  'reportlab (PDF)',
  () => execFileSync('python3', ['-c', 'import reportlab;print(reportlab.Version)'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(),
  { essencial: false }
);

checar(
  'python-docx (DOCX)',
  () => execFileSync('python3', ['-c', 'import docx;print("ok")'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(),
  { essencial: false }
);

console.log('\nArquivos');
for (const f of [
  'config/perfil.json',
  'config/palavras-chave.json',
  'config/dorks.json',
  'config/inhire-tenants.json',
  'AGENTS.md',
  '../Skills/adapt-resume/base_content_pt.json',
  '../Skills/adapt-resume/base_content_en.json',
  '../Skills/adapt-resume/generate_resume.py',
]) {
  checar(f, () => {
    if (!existsSync(join(RAIZ, f))) throw new Error('nao encontrado');
    return '';
  });
}

console.log('\nLinkedIn via Apify (aviso nao bloqueia: sem isto a fonte fica de fora)');
checar('APIFY_TOKEN no .env', () => {
  if (!process.env.APIFY_TOKEN) throw new Error('ausente. Copie .env.example para .env e cole o token da Apify');
  return 'presente';
}, { essencial: false });
checar('busca do LinkedIn', () => {
  if (process.env.APIFY_TASK) return `pela Task ${process.env.APIFY_TASK} (config/linkedin.json ignorado)`;
  const cfg = JSON.parse(readFileSync(join(RAIZ, 'config', 'linkedin.json'), 'utf8'));
  return `Actor direto: ${cfg.busca?.keywords?.slice(0, 50)} · ${cfg.busca?.location}`;
}, { essencial: false });

console.log('\nFontes (aviso nao bloqueia: fonte quebrada nao derruba a rodada)');
await checarFonte('Gupy', 'https://employability-portal.gupy.io/api/v1/jobs?jobName=Designer&offset=0&limit=1');
await checarFonte('Remotar', 'https://api.remotar.com.br/jobs?search=designer&page=1');
await checarFonte('InHire', 'https://api.inhire.app/job-posts/public/pages', { headers: { 'X-Inhire-Client': 'web-inhire', 'X-Tenant': 'mjv' } });
await checarFonte('Vagas Remotas', 'https://vagasremotas.com.br/?feed=job_feed&search_keywords=designer');
await checarFonte('Coluna Tech', 'https://vagas.colunatech.com.br/wp-json/wp/v2/posts?per_page=1');
await checarFonte('Vagas UX', 'https://vagasux.com.br/oportunidades/vagas-remotas');
// O DDG rate-limita: aviso aqui e esperado e nao significa nada quebrado.
// A camada 2 confiavel e o WebSearch alimentando scripts/enriquecer.mjs.
await checarFonte('DuckDuckGo (rate-limita)', 'https://html.duckduckgo.com/html/?q=site%3Agupy.io+designer');

console.log('\n' + '='.repeat(52));
if (essencialFaltando) {
  console.log(`\n${essencialFaltando} item(ns) essencial(is) faltando. Rode: npm run setup\n`);
  process.exit(1);
}
console.log('\nTudo essencial no lugar.\n');
