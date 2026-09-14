// InHire — startups BR. Nao ha diretorio publico de empresas, entao a lista de
// 486 tenants vem do trabalho de harvest do repo do Leo (vonrondow/busca-vagas-gupy-inhire),
// que reconstruiu os subdominios reais a partir de arquivos web. Reuso, nao refaco.
//
// Fluxo em dois passos, porque a listagem nao traz descricao nem data:
//   1. listagem por tenant (486 requisicoes pequenas, em paralelo) -> filtra titulo local
//   2. detalhe so das que casaram (um punhado) -> descricao, datas, status
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buscar, limparHtml, novoContador, normalizarTexto, casaTermo, DIACRITICOS } from '../util.js';
import { RAIZ, palavras } from '../config.js';

const API = 'https://api.inhire.app/job-posts/public';
const HEADERS = { 'X-Inhire-Client': 'web-inhire', 'Content-Type': 'application/json' };
export const NOME = 'InHire';

const MODELO = { REMOTE: 'remoto', HYBRID: 'hibrido', ON_SITE: 'presencial', PRESENTIAL: 'presencial' };

const tenants = JSON.parse(readFileSync(join(RAIZ, 'config', 'inhire-tenants.json'), 'utf8'));

/**
 * A URL publica da InHire e `https://<tenant>.inhire.app/vagas/<jobId>/<slug>`
 * e o SLUG E OBRIGATORIO. Sem ele a rota nao casa e a pagina renderiza vazia,
 * sem nem dar erro — foi assim que 8 links foram para o Notion quebrados em
 * 2026-07-30. `<tenant>.inhire.app` sozinho redireciona para /login, que e o
 * app do recrutador, nao a pagina de vaga.
 *
 * Verificado no navegador: QUALQUER slug funciona, so precisa existir. Entao
 * este slug e por legibilidade, e a correcao do link nao depende de acertar
 * o charmap. Mesmo assim replicamos o do npm `slugify`, que a InHire usa,
 * para a URL ficar igual a que o Google indexa: "|" vira "or" e "&" vira "and".
 */
export function slugVaga(displayName) {
  const s = String(displayName || '')
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .replace(/\|/g, ' or ')
    .replace(/&/g, ' and ')
    .toLowerCase()
    // Regra do slugify: espaco e o separador; os OUTROS simbolos sao REMOVIDOS,
    // nao substituidos. Por isso "UX/UI" vira "uxui" e nao "ux-ui".
    .replace(/[^a-z0-9\s-]+/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'vaga';
}

export function urlPublica(tenantSlug, jobId, displayName) {
  return `https://${tenantSlug}.inhire.app/vagas/${jobId}/${slugVaga(displayName)}`;
}

function interessa(titulo) {
  const t = normalizarTexto(titulo);
  if (!t) return false;
  if (palavras.titulo_excluido.some((x) => casaTermo(t, x))) return false;
  return Object.keys(palavras.titulo_aceito).some((k) => t.includes(normalizarTexto(k)));
}

/** Executa em lotes para nao abrir 486 conexoes de uma vez. */
async function emLotes(itens, tamanho, fn) {
  const saida = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    saida.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))));
  }
  return saida;
}

export async function coletar() {
  const c = novoContador(NOME);
  const alvos = tenants.filter((t) => (t.vagas ?? 0) > 0);

  const listagens = await emLotes(alvos, 12, async (t) => {
    c.consultadas++;
    try {
      const json = await buscar(`${API}/pages`, { headers: { ...HEADERS, 'X-Tenant': t.slug }, tentativas: 2, timeoutMs: 15000 });
      const itens = Array.isArray(json?.jobsPage) ? json.jobsPage : [];
      c.brutas += itens.length;
      return itens.filter((j) => interessa(j.displayName)).map((j) => ({ tenant: t, job: j }));
    } catch {
      c.falhas++; // 486 tenants: falha pontual e normal, mas tem que aparecer no relatorio
      return [];
    }
  });

  const candidatas = listagens.flat();

  const vagas = await emLotes(candidatas, 8, async ({ tenant, job }) => {
    try {
      const d = await buscar(`${API}/pages/${job.jobId}`, {
        headers: { ...HEADERS, 'X-Tenant': tenant.slug },
        tentativas: 2,
        timeoutMs: 15000,
      });
      const status = normalizarTexto(d?.status || job.status || '');
      return {
        idExterno: `inhire:${job.jobId}`,
        fonte: NOME,
        camada: 'API',
        titulo: d?.displayName || job.displayName,
        empresa: d?.tenantName || tenant.nome,
        descricao: limparHtml(d?.description),
        link: urlPublica(tenant.slug, job.jobId, d?.displayName || job.displayName),
        cidade: d?.location?.city || job.location?.city || null,
        estado: d?.location?.state || job.location?.state || null,
        pais: d?.location?.country || 'Brasil',
        modelo: MODELO[(d?.workplaceType || job.workplaceType || '').toUpperCase()] || null,
        remoto: /remote/i.test(d?.workplaceType || job.workplaceType || ''),
        publicadaEm: d?.publishedAt || d?.createdAt || null,
        atualizadaEm: d?.updatedAt || null,
        republicadaEm: d?.lastPublishedAt || null,
        prazo: null,
        salarioBruto: null,
        statusFonte: status || null,
        encerrada: !!status && !/published|open|active/i.test(status),
        validada: true,
      };
    } catch {
      c.falhas++;
      return null;
    }
  });

  return { vagas: vagas.filter(Boolean), contador: c };
}
