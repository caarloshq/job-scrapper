// O estado do onboarding: o que ja esta configurado, o que falta, e qual e o
// proximo bloco. E o comando que a pessoa e o agente rodam para saber onde
// estao. Nao pergunta nada: quem entrevista e o agente, pelo ONBOARDING.md.
//
//   npm run onboarding                # estado e proximo bloco
//   npm run onboarding -- --abrir     # o formulario no navegador (localhost), que grava nos arquivos
//   npm run onboarding -- --extrair   # PDF e ZIP em materiais-fonte/ viram texto
//   npm run onboarding -- --concluir  # marca o perfil como configurado, se tudo fechou
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { RAIZ, perfil, palavras } from '../src/config.js';
import { validar as validarMercado, idiomaDoCurriculo } from '../src/mercado.js';

const DIR_ADAPT = join(RAIZ, '..', 'Skills', 'adapt-resume');
const DIR_MATERIAIS = join(DIR_ADAPT, 'materiais-fonte');
const ARQ_PERFIL = join(RAIZ, 'config', 'perfil.json');
const ARQ_CAND = join(RAIZ, 'config', 'perfil-candidatura.json');

const lerJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// ---------- extrair ----------

function extrairPdf(arquivo, destino) {
  const py = `
import sys
texto = None
try:
    import fitz
    doc = fitz.open(sys.argv[1]); texto = "\\n".join(p.get_text() for p in doc)
except Exception:
    try:
        from pypdf import PdfReader
        texto = "\\n".join((p.extract_text() or "") for p in PdfReader(sys.argv[1]).pages)
    except Exception as e:
        sys.stderr.write(str(e)); sys.exit(2)
open(sys.argv[2], "w", encoding="utf-8").write(texto or "")
`;
  const r = spawnSync('python3', ['-c', py, arquivo, destino], { encoding: 'utf8' });
  if (r.status !== 0) return `falhou: ${r.stderr.trim().slice(0, 120)}. Instale: pip3 install --user pypdf`;
  return `ok, ${readFileSync(destino, 'utf8').length} caracteres`;
}

/**
 * O export oficial do LinkedIn (Configuracoes → Privacidade de dados → Obter
 * uma copia dos seus dados) e um ZIP de planilhas. As que importam para o
 * curriculo sao poucas; o resto (conexoes, mensagens) fica de fora de
 * proposito — e dado pessoal que o curriculo nao usa.
 */
const CSVS_LINKEDIN = ['Profile.csv', 'Positions.csv', 'Education.csv', 'Skills.csv', 'Languages.csv', 'Certifications.csv', 'Projects.csv'];

function extrairZip(arquivo, destino) {
  const pasta = destino.replace(/\.extraido\.md$/, '');
  mkdirSync(pasta, { recursive: true });
  const r = spawnSync('unzip', ['-o', '-q', arquivo, ...CSVS_LINKEDIN, '-d', pasta], { encoding: 'utf8' });
  if (r.error) return 'precisa do comando `unzip` (vem no macOS e no Linux). Sem ele, descompacte o ZIP à mão e deixe os CSV nesta pasta';
  if (r.status !== 0 && r.status !== 11) return `falhou ao abrir o zip: ${r.stderr.trim().slice(0, 120)}`;
  const partes = [];
  for (const csv of CSVS_LINKEDIN) {
    const p = join(pasta, csv);
    if (!existsSync(p)) continue;
    partes.push(`## ${csv}\n\n\`\`\`csv\n${readFileSync(p, 'utf8').trim()}\n\`\`\`\n`);
  }
  if (!partes.length) return 'zip aberto, mas nenhuma planilha do LinkedIn dentro (Profile.csv, Positions.csv...)';
  writeFileSync(destino, `# Export do LinkedIn\n\n${partes.join('\n')}`);
  return `ok, ${partes.length} planilhas`;
}

function extrair() {
  mkdirSync(DIR_MATERIAIS, { recursive: true });
  const arquivos = readdirSync(DIR_MATERIAIS).filter((a) => /\.(pdf|zip)$/i.test(a));
  if (!arquivos.length) {
    console.log('\nNenhum PDF ou ZIP em Skills/adapt-resume/materiais-fonte/. Coloque o currículo e o LinkedIn lá e rode de novo.\n');
    return;
  }
  console.log('\nExtraindo texto dos materiais\n');
  for (const a of arquivos) {
    const origem = join(DIR_MATERIAIS, a);
    const nome = basename(a, extname(a));
    const ehZip = /\.zip$/i.test(a);
    const destino = join(DIR_MATERIAIS, `${nome}.extraido.${ehZip ? 'md' : 'txt'}`);
    const resultado = ehZip ? extrairZip(origem, destino) : extrairPdf(origem, destino);
    console.log(`  ${a.padEnd(40)} ${resultado}`);
  }
  console.log('\nO agente lê os .extraido.* daqui. O original fica só para conferência.\n');
}

// ---------- estado ----------

export function estado() {
  const cand = existsSync(ARQ_CAND) ? lerJson(ARQ_CAND) : {};
  const basePt = existsSync(join(DIR_ADAPT, 'base_content_pt.json')) ? lerJson(join(DIR_ADAPT, 'base_content_pt.json')) : null;
  const baseEn = existsSync(join(DIR_ADAPT, 'base_content_en.json')) ? lerJson(join(DIR_ADAPT, 'base_content_en.json')) : null;
  // Renomear o exemplo nao basta: a impressao digital sao as empresas e o
  // e-mail ficticios. Se um deles ainda esta la, a base e o exemplo com outro nome.
  const DIGITAL_EXEMPLO = /NimbusTech|Loja R[aá]pida|exemplo@email\.com|example@email\.com|EXEMPLO|EXAMPLE/i;
  const ehExemplo = (b) => !b || DIGITAL_EXEMPLO.test(JSON.stringify(b));
  const materiais = existsSync(DIR_MATERIAIS)
    ? readdirSync(DIR_MATERIAIS).filter((a) => /\.(pdf|zip|md|txt)$/i.test(a) && a !== 'README.md')
    : [];
  const extraidos = materiais.filter((a) => /\.extraido\.(txt|md)$/.test(a));
  const brutos = materiais.filter((a) => /\.(pdf|zip)$/i.test(a));
  const mercadoOk = validarMercado(perfil.mercado).ok;
  const idioma = idiomaDoCurriculo(perfil);
  const baseDoIdioma = idioma === 'en' ? baseEn : basePt;

  const blocos = [
    { n: 1, nome: 'Quem é e o que busca', ok: Boolean(perfil.cargo_alvo) && Boolean(perfil.pais), detalhe: perfil.cargo_alvo && perfil.pais ? `cargo alvo: ${perfil.cargo_alvo}, mora em ${perfil.pais}` : 'perfil.cargo_alvo ou perfil.pais vazio' },
    { n: 2, nome: 'Mercado', ok: mercadoOk, detalhe: mercadoOk ? `${perfil.mercado.foco}${perfil.mercado.prioridade ? `, prioriza ${perfil.mercado.prioridade}` : ''}` : (validarMercado(perfil.mercado).erro || 'não definido') },
    { n: 3, nome: 'Currículo e LinkedIn', ok: !ehExemplo(baseDoIdioma), detalhe: ehExemplo(baseDoIdioma) ? `base_content_${idioma}.json ainda é o exemplo fictício · materiais: ${brutos.length} arquivo(s), ${extraidos.length} extraído(s)` : `base_content_${idioma}.json é da pessoa` },
    { n: 4, nome: 'Profissão e termos de busca', ok: palavras.termo_busca_larga !== 'designer' || perfil.profissao_confirmada === true, detalhe: palavras.termo_busca_larga === 'designer' && !perfil.profissao_confirmada ? 'palavras-chave.json ainda é o padrão de design' : `termo largo: ${palavras.termo_busca_larga}` },
    { n: 5, nome: 'Perfil e salário', ok: Number.isFinite(perfil.salario?.minimo_mensal_brl) && perfil.salario_confirmado === true, detalhe: perfil.salario_confirmado ? `piso R$ ${perfil.salario.minimo_mensal_brl}/mês` : 'piso e referência ainda são os valores de exemplo' },
    { n: 6, nome: 'Candidatura automática', ok: true, detalhe: cand.autorizado ? 'LIGADA, autorizada pela pessoa' : 'desligada (padrão). Liga só com autorizado: true no perfil de candidatura' },
    { n: 7, nome: 'Apify (LinkedIn)', ok: Boolean(process.env.APIFY_TOKEN), detalhe: process.env.APIFY_TOKEN ? (process.env.APIFY_TASK ? 'token presente; busca pela sua Task' : 'token presente; busca de config/linkedin.json') : 'sem token: a fonte LinkedIn fica de fora até você colar APIFY_TOKEN no vagas/.env' },
  ];
  const proximo = blocos.find((b) => !b.ok && b.n !== 7) || (blocos[6].ok ? null : blocos[6]);
  return { configurado: perfil._configurado === true, blocos, proximo, idioma, brutos, extraidos };
}

function imprimir() {
  const e = estado();
  console.log('\nCaça-vagas — onboarding\n' + '='.repeat(52) + '\n');
  console.log(`Perfil ${e.configurado ? 'CONFIGURADO' : 'ainda NÃO configurado'}. Roteiro: ONBOARDING.md na raiz.\n`);
  for (const b of e.blocos) {
    console.log(`[${b.ok ? '  ok  ' : ' falta'}] ${String(b.n)}. ${b.nome.padEnd(30)} ${b.detalhe}`);
  }
  console.log('');
  if (e.proximo) console.log(`Próximo bloco: ${e.proximo.n}. ${e.proximo.nome}`);
  else if (!e.configurado) console.log('Tudo respondido. Feche com: npm run onboarding -- --concluir');
  else console.log('Onboarding concluído. Rode: npm run doctor && npm run rodada');
  console.log('');
}

function concluir() {
  const e = estado();
  const faltando = e.blocos.filter((b) => !b.ok && b.n !== 7);
  if (faltando.length) {
    console.log(`\nAinda falta: ${faltando.map((b) => `${b.n}. ${b.nome}`).join(' · ')}. Não marquei como configurado.\n`);
    process.exit(1);
  }
  const p = lerJson(ARQ_PERFIL);
  p._configurado = true;
  p._configurado_em = new Date().toISOString().slice(0, 10);
  writeFileSync(ARQ_PERFIL, JSON.stringify(p, null, 2) + '\n');
  console.log('\nPerfil marcado como configurado. Próximo: npm run doctor && npm run rodada\n');
}

// ---------- formulario no navegador ----------
//
// Servidor local minimo, Node puro. Serve onboarding/index.html e grava o que a
// pessoa responde nos arquivos do projeto. Nada sai da maquina: escuta so em
// 127.0.0.1. O token vai para o .env e nunca volta para a tela.

const PORTA = Number(process.env.ONBOARDING_PORTA || 4181);
const DIR_REPO = join(RAIZ, '..');
const ARQ_ENV = join(RAIZ, '.env');
const ARQ_LINKEDIN = join(RAIZ, 'config', 'linkedin.json');
const GEO = { Brazil: '106057199', Portugal: '100364837', 'United States': '103644278', 'United Kingdom': '101165590', Canada: '101174742', Germany: '101282230', Spain: '105646813' };

function lerEnv() {
  if (!existsSync(ARQ_ENV)) return {};
  const o = {};
  for (const l of readFileSync(ARQ_ENV, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/); if (m) o[m[1]] = m[2].trim(); }
  return o;
}
function gravarEnv(mudancas) {
  const atual = lerEnv();
  for (const [k, v] of Object.entries(mudancas)) if (v) atual[k] = v;
  const linhas = ['# Gerado pelo formulario de onboarding. Fora do git.', ...Object.entries(atual).map(([k, v]) => `${k}=${v}`)];
  writeFileSync(ARQ_ENV, linhas.join('\n') + '\n');
}
const gravarJson = (p, obj) => writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');

function estadoParaTela() {
  const p = lerJson(ARQ_PERFIL);
  const env = lerEnv();
  const cand = existsSync(ARQ_CAND) ? lerJson(ARQ_CAND) : {};
  mkdirSync(DIR_MATERIAIS, { recursive: true });
  const materiais = ['curriculo', 'linkedin'].filter((t) => existsSync(join(DIR_MATERIAIS, `${t}.pdf`)) && statSync(join(DIR_MATERIAIS, `${t}.pdf`)).size > 0).map((t) => ({
    tipo: t, nome: `${t}.pdf`, tamanho: statSync(join(DIR_MATERIAIS, `${t}.pdf`)).size, extraido: existsSync(join(DIR_MATERIAIS, `${t}.extraido.txt`)),
  }));
  return {
    perfil: p,
    env: { token: Boolean(env.APIFY_TOKEN), task: env.APIFY_TASK || '' },
    candidatura: { autorizado: cand.autorizado === true },
    materiais,
    blocos: estado().blocos,
  };
}

// O formulario valida na tela, mas a API e quem grava: tudo que chega aqui e
// conferido de novo. Descoberto no teste de 2026-09-14: sem isto, nome vazio,
// salario negativo, foco "marte" e nivel "hacker" iam direto para o perfil.
const TEXTO_MAX = 200;
const texto = (v, max = TEXTO_MAX) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const numero = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
const NIVEIS = ['junior', 'pleno', 'senior', 'lideranca'];

function validarPasso(passo, d = {}) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'dados precisam ser um objeto';
  if (![1, 2, 3, 4, 5, 6, 7].includes(passo)) return `passo ${passo} não existe`;
  if (passo === 1) {
    if (!texto(d.nome)) return 'Precisa do seu nome.';
    if (!texto(d.cargo_alvo)) return 'Precisa do cargo, como aparece em anúncio.';
    if (!texto(d.pais)) return 'Precisa do país.';
  }
  if (passo === 2) {
    if (!['nacional', 'internacional', 'ambos'].includes(d.foco)) return 'Mercado precisa ser nacional, internacional ou ambos.';
    if (d.foco === 'ambos' && !['nacional', 'internacional'].includes(d.prioridade)) return 'Com os dois mercados, diga qual você prioriza.';
  }
  if (passo === 3) {
    if (d.arquivos !== undefined && !Array.isArray(d.arquivos)) return 'arquivos precisa ser uma lista';
    for (const a of d.arquivos || []) {
      if (!a || typeof a.nome !== 'string' || typeof a.base64 !== 'string') return 'cada arquivo precisa de nome e conteúdo';
      if (!['curriculo', 'linkedin'].includes(a.tipo)) return 'tipo de arquivo precisa ser curriculo ou linkedin';
      if (!/\.pdf$/i.test(a.nome)) return `${a.nome} não é PDF`;
      if (a.base64.length > 20 * 1024 * 1024) return `${a.nome} passa de 15 MB`;
    }
  }
  if (passo === 4) {
    if (!texto(d.profissao)) return 'Diga a sua área em uma frase.';
    if (!Array.isArray(d.niveis_aceitos) || !d.niveis_aceitos.length) return 'Marque ao menos um nível.';
    if (d.niveis_aceitos.some((n) => !NIVEIS.includes(n))) return 'Nível desconhecido.';
  }
  if (passo === 5) {
    const piso = numero(d.minimo_mensal_brl); const ref = numero(d.referencia_atual_brl);
    if (!(piso > 0 && piso < 1e7)) return 'Piso precisa ser um número maior que zero.';
    if (!(ref > 0 && ref < 1e7)) return 'O que você ganha hoje precisa ser um número maior que zero.';
    const modelos = [d.aceita_remoto !== false, d.aceita_hibrido === true, d.aceita_presencial === true];
    if (!modelos.some(Boolean)) return 'Marque ao menos um modelo de trabalho.';
    if ((d.aceita_hibrido === true || d.aceita_presencial === true) && !texto(d.cidade)) return 'Híbrido e presencial precisam da sua cidade.';
  }
  if (passo === 7) {
    if (d.token != null && d.token !== '' && !/^[A-Za-z0-9_-]{10,200}$/.test(String(d.token).trim())) return 'Token inválido: só letras, números, hífen e sublinhado.';
  }
  return null;
}

function salvarPasso(passo, d = {}) {
  const erro = validarPasso(passo, d);
  if (erro) { const e = new Error(erro); e.validacao = true; throw e; }
  const p = lerJson(ARQ_PERFIL);
  if (passo === 1) {
    p.nome = texto(d.nome);
    p.cargo_alvo = texto(d.cargo_alvo);
    p.pais = texto(d.pais, 80);
    const li = lerJson(ARQ_LINKEDIN);
    li.busca.keywords = `${p.cargo_alvo} remote`;
    if (d.pais && d.pais !== 'outro') { li.busca.location = d.pais; li.busca.geoId = GEO[d.pais] || li.busca.geoId; }
    gravarJson(ARQ_LINKEDIN, li);
    if (existsSync(ARQ_CAND)) { const c = lerJson(ARQ_CAND); c.identidade.nome_completo = p.nome; c.identidade.nome_profissional = p.nome; c.identidade.pais = p.pais; gravarJson(ARQ_CAND, c); }
  } else if (passo === 2) {
    p.mercado = { ...p.mercado, foco: d.foco, prioridade: d.foco === 'ambos' ? d.prioridade || null : null };
  } else if (passo === 3) {
    mkdirSync(DIR_MATERIAIS, { recursive: true });
    for (const a of d.arquivos || []) {
      // Nome fixo por tipo: curriculo.pdf e linkedin.pdf. O nome original nao
      // importa para o agente, e nome fixo e o que deixa o estado ser lido.
      const bytes = Buffer.from(a.base64 || '', 'base64');
      if (!bytes.length || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) continue;
      writeFileSync(join(DIR_MATERIAIS, `${a.tipo}.pdf`), bytes);
    }
    if ((d.arquivos || []).length) extrair();
  } else if (passo === 4) {
    p.profissao = texto(d.profissao);
    // Board so de UX: fica ligado so para quem e de design. Inferido do que a
    // pessoa escreveu, em vez de mais uma pergunta na tela.
    p.eh_design = /\b(design|designer|ux|ui|user experience|product design)\b/i.test(`${p.profissao} ${p.cargo_alvo || ''}`);
    p.niveis_aceitos = d.niveis_aceitos.filter((n) => NIVEIS.includes(n));
    const desligadas = new Set(p.fontes_desligadas || []);
    if (p.eh_design) desligadas.delete('Vagas UX'); else desligadas.add('Vagas UX');
    p.fontes_desligadas = [...desligadas];
    const desc = new Set(['estagio', 'trainee', 'aprendiz']);
    if (!p.niveis_aceitos.includes('junior')) desc.add('junior');
    if (!p.niveis_aceitos.includes('pleno')) desc.add('pleno');
    p.senioridade = { ...p.senioridade, descartadas: [...desc] };
  } else if (passo === 5) {
    p.salario = { ...p.salario, minimo_mensal_brl: Number(d.minimo_mensal_brl), referencia_atual_brl: Number(d.referencia_atual_brl) };
    p.aceita_hibrido = d.aceita_hibrido === true;
    p.aceita_presencial = d.aceita_presencial === true;
    p.aceita_remoto = d.aceita_remoto !== false;
    p.cidade = texto(d.cidade, 80);
    // Quem aceita hibrido ou presencial nao quer o filtro Remote do LinkedIn.
    const li = lerJson(ARQ_LINKEDIN); li.busca.remoto = !(p.aceita_hibrido || p.aceita_presencial); gravarJson(ARQ_LINKEDIN, li);
    p.salario_confirmado = true;
  } else if (passo === 6) {
    if (existsSync(ARQ_CAND)) { const c = lerJson(ARQ_CAND); c.autorizado = d.autorizado === true; c.autorizado_em = c.autorizado ? new Date().toISOString().slice(0, 10) : null; gravarJson(ARQ_CAND, c); }
  } else if (passo === 7) {
    const token = d.token ? String(d.token).trim() : '';
    gravarEnv({ APIFY_TOKEN: token });
    if (token) process.env.APIFY_TOKEN = token;
  }
  p._formulario_em = new Date().toISOString().slice(0, 10);
  gravarJson(ARQ_PERFIL, p);
}

function abrir() {
  const TIPOS = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const servidor = createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORTA}`);
    const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': TIPOS['.html'] }); res.end(readFileSync(join(DIR_REPO, 'onboarding', 'index.html'))); return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/img/')) {
      const alvo = join(DIR_REPO, 'docs', url.pathname.replace(/\.\./g, ''));
      if (!existsSync(alvo)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TIPOS[extname(alvo)] || 'application/octet-stream' }); res.end(readFileSync(alvo)); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/estado') return json(200, estadoParaTela());
    if (req.method === 'POST' && url.pathname === '/api/salvar') {
      let corpo = '';
      req.on('data', (c) => { corpo += c; if (corpo.length > 60 * 1024 * 1024) req.destroy(); });
      req.on('end', () => {
        try { const { passo, dados } = JSON.parse(corpo); salvarPasso(Number(passo), dados); json(200, { ok: true, estado: estadoParaTela() }); }
        catch (e) { json(e.validacao ? 422 : 400, { erro: String(e.message || e) }); }
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  servidor.listen(PORTA, '127.0.0.1', () => {
    const endereco = `http://localhost:${PORTA}`;
    console.log(`\nFormulário de onboarding em ${endereco}\nEle grava nos arquivos deste projeto. Ctrl+C fecha.\n`);
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    if (process.argv.includes('--sem-navegador')) return;
    try { spawn(cmd, [endereco], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref(); } catch { /* abre a mao */ }
  });
}

const args = process.argv.slice(2);
if (args.includes('--abrir')) abrir();
else if (args.includes('--extrair')) extrair();
else if (args.includes('--concluir')) concluir();
else imprimir();
