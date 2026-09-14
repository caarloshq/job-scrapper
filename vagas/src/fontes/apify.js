// Camada 4 — LinkedIn via Apify.
//
// O Apify ja faz o scraping; aqui so se dispara o Actor (ou a sua Task, se
// APIFY_TASK existir), espera, baixa o dataset e normaliza para o pipeline. NAO ha scraping proprio, e
// nao deve haver: o LinkedIn bloqueia, e a Task ja e paga e mantida.
//
// O token mora em `.env`, que e gitignored. Sem ele esta fonte nao roda, e
// isso nao pode derrubar a rodada — as outras continuam.
//
// DOIS CAMINHOS, decididos por quem chama (coletar.js le o .env):
//   - so APIFY_TOKEN: dispara o Actor de config/linkedin.json com o input
//     montado daquele arquivo. E o caminho padrao: a pessoa cola um valor so.
//   - APIFY_TOKEN + APIFY_TASK: dispara a Task salva na conta dela, e o
//     linkedin.json e ignorado. Para quem prefere ajustar a busca no site.
//
// MEDIDO no dataset real de 2026-08-01, 50 vagas, e cada armadilha abaixo
// veio de olhar o dado, nao de supor:
//   - `postedDate` vem VAZIO em 41 das 50. So sobra `postedTime` relativo.
//   - `location` e "Brazil" em 41 das 50, entao nao serve de cidade.
//   - `salary` aparece em 6 das 50, e mistura "R$8,100.00/mo" com "$40,000/yr".
//   - `seniorityLevel` traz "Entry level", que e junior e tem que sair.
import { limparHtml } from '../util.js';
import { paraNumero } from '../salario.js';

export const NOME = 'LinkedIn (Apify)';
const BASE = 'https://api.apify.com/v2';

/**
 * "1 week ago" -> ISO de ~7 dias atras.
 *
 * Existe porque `postedDate` vem vazio em 82% dos itens; sem isto o frescor
 * nao tem data, e vaga sem data nenhuma nao consegue nem ser classificada.
 * A precisao e a que a fonte da: "2 weeks ago" pode ser 8 ou 14 dias. Para o
 * frescor, que trabalha em faixas de 7/21/45 dias, isso basta — e e melhor que
 * o nada que existe hoje.
 *
 * Devolve null quando nao reconhece, em vez de chutar "hoje": data inventada
 * faria vaga velha parecer nova, que e o erro caro nesta direcao.
 */
export function dataRelativa(texto, agora = new Date()) {
  const t = String(texto || '').trim().toLowerCase();
  if (!t) return null;
  if (/^(just now|today|hoje)$/.test(t)) return agora.toISOString();

  const m = t.match(/^(\d+)\s*(minute|hour|day|week|month|year|minuto|hora|dia|semana|mes|mês|ano)s?\s*(ago|atras|atrás)?$/);
  if (!m) return null;

  const n = Number(m[1]);
  const dias = {
    minute: 0, minuto: 0, hour: 0, hora: 0,
    day: 1, dia: 1,
    week: 7, semana: 7,
    month: 30, mes: 30, 'mês': 30,
    year: 365, ano: 365,
  }[m[2]];
  if (dias === undefined) return null;

  const d = new Date(agora);
  d.setDate(d.getDate() - n * dias);
  return d.toISOString();
}

/**
 * O `seniorityLevel` do LinkedIn e um enum, e e sinal MAIS forte que adivinhar
 * pelo titulo. "Entry level" e junior e tem que sair; "Mid-Senior level" e
 * ambiguo de proposito no LinkedIn, entao vira sem_rotulo e deixa o
 * senioridade.js decidir lendo o titulo e o texto.
 */
export function nivelDoLinkedIn(valor) {
  const v = String(valor || '').trim().toLowerCase();
  if (v === 'internship' || v === 'entry level') return 'junior';
  if (v === 'director' || v === 'executive') return 'senior';
  return null; // Associate, Mid-Senior level, Not Applicable: nao decide
}

/**
 * "R$8,100.00/mo" | "$40,000.00/yr" | "$15.00/hr" -> objeto que o salario.js le.
 *
 * A ordem do teste de moeda importa e nao e estetica: "R$" tem que ser
 * reconhecido ANTES de "$", senao o cifrao casa sozinho e R$ 8.100 vira USD
 * 8.100. Esse erro exato ja aconteceu neste projeto com uma bolsa de R$ 2.000
 * que foi publicada como "USD 2k".
 *
 * Por hora devolve null: o pipeline compara mensal, e hora vira mes so com
 * carga horaria, que o anuncio nao declara. Numero errado e pior que ausente.
 */
export function salarioDoTexto(bruto) {
  const t = String(bruto || '').trim();
  if (!t) return null;

  const moeda = /R\$/i.test(t) ? 'BRL' : /US\$|\$|USD/i.test(t) ? 'USD' : /€|EUR/i.test(t) ? 'EUR' : null;
  if (!moeda) return null;

  const periodo = /\/\s*(yr|year|ano)/i.test(t) ? 'ano'
    : /\/\s*(mo|month|mes|mês)/i.test(t) ? 'mes'
    : null;
  if (!periodo) return null; // /hr cai aqui de proposito

  // Captura o numero INTEIRO e deixa o paraNumero decidir a convencao. A
  // versao anterior casava so os tres primeiros digitos quando nao havia
  // separador de milhar: "R$ 12000/mo" virava 120, que fica abaixo do piso e
  // DESCARTA a vaga em silencio. Numero errado aqui nao so mente, mata.
  const numeros = [...t.matchAll(/\d[\d.,]*/g)]
    .map((m) => paraNumero(m[0]))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!numeros.length) return null;

  return {
    de: numeros[0],
    ate: numeros.length > 1 ? numeros[numeros.length - 1] : null,
    currency: moeda,
    type: periodo === 'ano' ? 'yearly' : 'monthly',
  };
}

/**
 * A busca do LinkedIn usa `f_WT=2`, que e o filtro "Remote" deles. Quando o
 * item carrega essa marca no `sourceSearchUrl`, o remoto esta DECLARADO pela
 * origem, nao suposto por mim. Sem a marca, devolve null e o filtro decide
 * pelas outras pistas — nunca assume remoto por conveniencia.
 */
export function remotoPelaBusca(sourceSearchUrl) {
  const u = String(sourceSearchUrl || '');
  if (!u) return null;
  return /[?&]f_WT=2(&|$)/.test(u) ? true : null;
}

/**
 * Item do curious_coder/linkedin-jobs-scraper -> o formato do crawlworks, que e
 * o que o resto deste arquivo le.
 *
 * O actor trocou em 2026-09-14. Medido com a mesma busca (Brasil, remoto, 7
 * dias, 50 vagas): 49 das 50 vagas eram as mesmas nos dois, e o curious_coder
 * custou US$ 0,10 contra US$ 0,25. O crawlworks ainda marcava "Entry level" em
 * vaga Staff e Senior, e o filtro descartava como junior.
 *
 * O LINK e a armadilha: o curious_coder devolve
 * `br.linkedin.com/jobs/view/<slug-do-titulo>-4465163818?position=...`, e o id
 * nao sai pelo `/jobs/view/(\d+)`. Sem o `id` do proprio item, as 49 vagas
 * repetidas viraram ineditas na primeira medicao, e cada uma teria ganhado
 * cartao duplicado no Notion. O link canonico e remontado pelo id.
 *
 * Perde-se o que so o crawlworks trazia: `applicationType` (Candidatura
 * Simplificada ou externa) e `validThrough` (prazo).
 */
export function doCuriousCoder(item) {
  if (!item?.link || !item?.title || item.jobUrl) return item;
  const id = String(item.id || '').match(/^\d+$/)?.[0]
    || String(item.link).match(/(\d{6,})(?:[/?#]|$)/)?.[1];
  if (!id) return null;
  return {
    jobUrl: `https://www.linkedin.com/jobs/view/${id}`,
    jobTitle: item.title,
    companyName: item.companyName,
    jobDescription: item.descriptionHtml || item.descriptionText,
    location: item.location,
    postedDate: item.postedAt,
    salary: Array.isArray(item.salary) ? item.salary.join(' ') : item.salary,
    seniorityLevel: item.seniorityLevel,
    sourceSearchUrl: item.inputUrl,
  };
}

/** Item cru do dataset -> vaga no formato do pipeline. */
export function normalizar(item, agora = new Date()) {
  item = doCuriousCoder(item);
  if (!item?.jobUrl || !item?.jobTitle) return null;

  const id = String(item.jobUrl).match(/\/jobs\/view\/(\d+)/)?.[1]
    || String(item.jobUrl).split('/').filter(Boolean).pop();

  const publicada = item.postedDate
    ? new Date(item.postedDate).toISOString()
    : dataRelativa(item.postedTime, agora);

  const nivel = nivelDoLinkedIn(item.seniorityLevel);

  return {
    idExterno: `linkedin:${id}`,
    fonte: NOME,
    camada: 'Apify',
    titulo: String(item.jobTitle).trim(),
    empresa: item.companyName || null,
    descricao: limparHtml(item.jobDescription),
    link: item.jobUrl,
    // `location` e "Brazil" na maioria: e pais, nao cidade. Preencher `cidade`
    // com isso seria inventar precisao que o dado nao tem.
    cidade: null,
    estado: null,
    pais: /brasil|brazil|, BR$/i.test(String(item.location || '')) ? 'Brasil' : null,
    modelo: remotoPelaBusca(item.sourceSearchUrl) ? 'remoto' : null,
    remoto: remotoPelaBusca(item.sourceSearchUrl),
    publicadaEm: publicada,
    atualizadaEm: null,
    prazo: item.validThrough ? new Date(item.validThrough).toISOString() : null,
    salarioBruto: salarioDoTexto(item.salary),
    statusFonte: null,
    // Nivel so viaja quando o LinkedIn foi conclusivo; senao o senioridade.js
    // le titulo e descricao, como faz para as outras fontes.
    ...(nivel ? { senioridade: nivel } : {}),
    validada: true,
  };
}

// ---------- rede ----------

async function api(caminho, token, opcoes = {}) {
  const sep = caminho.includes('?') ? '&' : '?';
  const r = await fetch(`${BASE}${caminho}${sep}token=${token}`, opcoes);
  if (!r.ok) throw new Error(`Apify ${r.status} em ${caminho.split('?')[0]}`);
  return r.json();
}

/**
 * config/linkedin.json → URL de busca do LinkedIn.
 *
 * `location` e `geoId` andam juntos e sao obrigatorios: sem eles o LinkedIn
 * devolveu 100 de 100 vagas nos EUA (medido em 2026-09-14), e o filtro aprovou
 * 97 porque nao enxerga restricao de pais no texto. `f_WT=2` e o filtro Remote,
 * e e a mesma marca que `remotoPelaBusca()` le no item de volta.
 */
export function montarUrlBusca(busca = {}) {
  if (!busca.keywords) throw new Error('linkedin.json: busca.keywords vazio');
  if (!busca.location || !busca.geoId) throw new Error('linkedin.json: busca.location e busca.geoId sao obrigatorios juntos');
  const p = new URLSearchParams();
  p.set('keywords', busca.keywords);
  p.set('location', busca.location);
  p.set('geoId', String(busca.geoId));
  if (busca.remoto !== false) p.set('f_WT', '2');
  if (busca.dias) p.set('f_TPR', `r${Number(busca.dias) * 86400}`);
  return `https://www.linkedin.com/jobs/search/?${p.toString()}`;
}

/** config/linkedin.json → input do Actor curious_coder/linkedin-jobs-scraper. */
export function montarInput(cfg = {}) {
  return {
    urls: [montarUrlBusca(cfg.busca)],
    limitPerSource: Number(cfg.limite_por_busca ?? 100),
    scrapeCompany: cfg.enriquecer_empresa !== false,
    splitByLocation: false,
    under10Applicants: false,
    autoConvertToAiSearch: false,
    datePosted: 'anyTime',
    companyIds: [],
  };
}

/** Dispara o Actor com input e devolve o run, sem esperar. */
export async function dispararActor(actor, input, token, { memoriaMb = 512, timeoutS = 480 } = {}) {
  const j = await api(`/acts/${actor}/runs?memory=${memoriaMb}&timeout=${timeoutS}`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return j.data;
}

/** Dispara a Task e devolve o run, sem esperar. */
export async function dispararTask(task, token) {
  const j = await api(`/actor-tasks/${task}/runs`, token, { method: 'POST' });
  return j.data;
}

/**
 * Espera a Task terminar. Tem teto de tempo porque a rodada diaria nao pode
 * ficar pendurada: estourou, a fonte devolve vazio e as outras seis seguem.
 */
export async function aguardar(runId, token, { tetoMs = 8 * 60 * 1000, intervaloMs = 10_000, aoAndar } = {}) {
  const limite = Date.now() + tetoMs;
  while (Date.now() < limite) {
    const j = await api(`/actor-runs/${runId}`, token);
    const s = j.data.status;
    if (aoAndar) aoAndar(s);
    if (s === 'SUCCEEDED') return j.data;
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(s)) {
      throw new Error(`run terminou como ${s}`);
    }
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
  throw new Error(`run passou de ${Math.round(tetoMs / 60000)} min sem terminar`);
}

export async function baixarDataset(datasetId, token) {
  const j = await api(`/datasets/${datasetId}/items`, token);
  return Array.isArray(j) ? j : [];
}

/**
 * Ultimo run bem-sucedido, para reimportar sem gastar credito. Task e Actor
 * guardam os runs em lugares diferentes da API, por isso os dois caminhos.
 */
export async function ultimoRun({ task, actor }, token) {
  const caminho = task ? `/actor-tasks/${task}/runs` : `/acts/${actor}/runs`;
  const j = await api(`${caminho}?limit=10&desc=1`, token);
  return (j.data.items || []).find((r) => r.status === 'SUCCEEDED') || null;
}

/** Qual caminho a coleta vai usar, pelo que existe. Puro, para teste. */
export function modo({ token, task, linkedin } = {}) {
  if (!token) return 'desligado';
  if (task) return 'task';
  if (linkedin?.actor && linkedin?.busca?.keywords) return 'actor';
  return 'desligado';
}

/**
 * @param {{token:string, task?:string, linkedin?:object, usarUltimo?:boolean, aoAndar?:Function}} opcoes
 *   `linkedin` e o config/linkedin.json inteiro; so e lido sem `task`.
 * @returns {Promise<{vagas: object[], contador: object}>}
 */
export async function coletar({ token, task, linkedin, usarUltimo = false, aoAndar } = {}) {
  const m = modo({ token, task, linkedin });
  if (m === 'desligado') throw new Error('APIFY_TOKEN ausente, ou config/linkedin.json sem actor e busca: veja .env.example');

  let run;
  if (usarUltimo) {
    run = await ultimoRun({ task, actor: linkedin?.actor }, token);
    if (!run) throw new Error('nenhum run bem-sucedido para reimportar');
  } else if (m === 'task') {
    const disparado = await dispararTask(task, token);
    run = await aguardar(disparado.id, token, { aoAndar });
  } else {
    const disparado = await dispararActor(linkedin.actor, montarInput(linkedin), token, {
      memoriaMb: linkedin.memoria_mb, timeoutS: linkedin.timeout_s,
    });
    run = await aguardar(disparado.id, token, { aoAndar });
  }

  const itens = await baixarDataset(run.defaultDatasetId, token);
  const vagas = [];
  let semLink = 0;
  let semData = 0;
  for (const item of itens) {
    const v = normalizar(item);
    if (!v) { semLink++; continue; }
    if (!v.publicadaEm) semData++;
    vagas.push(v);
  }
  return {
    vagas,
    contador: { brutas: itens.length, normalizadas: vagas.length, semLink, semData, runId: run.id, modo: m },
  };
}
