// ATS internacionais, por empresa.
//
// POR QUE ESTA E A UNICA ROTA INTERNACIONAL QUE FUNCIONA:
// os agregadores prometiam busca e nao entregam. Medido em 2026-07-30 —
//   Himalayas: 98.705 vagas, `search` e `category` IGNORADOS, 20 por pagina.
//              Filtrar design exigiria 4.935 requisicoes.
//   Remotive:  o feed publico inteiro tem 35 vagas, das quais 1 e de design,
//              e é design grafico. `search` e `category` tambem ignorados.
// Aqui nao precisa de busca: pedimos o quadro de UMA empresa e filtramos local.
//
// Cada provedor tem um formato. O que muda e so como extrair; o resto e comum.
import { buscar, limparHtml, dormir, novoContador, normalizarTexto, casaTermo } from '../util.js';
import { palavras } from '../config.js';
import { avaliarElegibilidade } from './intl.js';

export const NOME = 'ATS internacional';

// Exportado para o scripts/descobrir-empresas.mjs reusar a URL de cada provedor
// em vez de manter uma segunda copia dela, que sairia do ar sem ninguem notar.
export const PROVEDORES = {
  ashby: {
    rotulo: 'Ashby',
    url: (org) => `https://api.ashbyhq.com/posting-api/job-board/${org}?includeCompensation=true`,
    extrair: (json) => json?.jobs || [],
    normalizar: (j, org) => ({
      id: j.id,
      titulo: j.title,
      empresa: j.organizationName || org,
      descricao: limparHtml(j.descriptionPlain || j.descriptionHtml),
      link: j.jobUrl,
      local: j.location || j.secondaryLocations?.map((l) => l.location).join(', '),
      remoto: j.isRemote === true,
      publicadaEm: j.publishedAt || null,
      salarioBruto: montarSalarioAshby(j.compensation),
    }),
  },
  greenhouse: {
    rotulo: 'Greenhouse',
    url: (org) => `https://boards-api.greenhouse.io/v1/boards/${org}/jobs?content=true`,
    extrair: (json) => json?.jobs || [],
    normalizar: (j, org, nome) => ({
      id: j.id,
      titulo: j.title,
      empresa: nome || org,
      descricao: limparHtml(j.content),
      link: j.absolute_url,
      local: j.location?.name || null,
      remoto: /remote/i.test(j.location?.name || ''),
      publicadaEm: j.updated_at || j.first_published || null,
      salarioBruto: null,
    }),
  },
  workable: {
    rotulo: 'Workable',
    url: (org) => `https://apply.workable.com/api/v1/widget/accounts/${org}?details=true`,
    extrair: (json) => json?.jobs || [],
    normalizar: (j, org) => ({
      id: j.shortcode || j.id,
      titulo: j.title,
      empresa: j.company || org,
      descricao: limparHtml(j.description),
      link: j.url || j.application_url,
      local: [j.city, j.country].filter(Boolean).join(', ') || null,
      remoto: j.telecommuting === true || /remote/i.test(j.location?.location_str || ''),
      publicadaEm: j.published_on || j.created_at || null,
      salarioBruto: null,
    }),
  },
  smartrecruiters: {
    rotulo: 'SmartRecruiters',
    url: (org) => `https://api.smartrecruiters.com/v1/companies/${org}/postings?limit=100`,
    extrair: (json) => json?.content || [],
    normalizar: (j, org) => ({
      id: j.id,
      titulo: j.name,
      empresa: j.company?.name || org,
      descricao: limparHtml(j.jobAd?.sections?.jobDescription?.text),
      link: j.ref || `https://jobs.smartrecruiters.com/${org}/${j.id}`,
      local: [j.location?.city, j.location?.country].filter(Boolean).join(', ') || null,
      remoto: j.location?.remote === true,
      publicadaEm: j.releasedDate || null,
      salarioBruto: null,
    }),
  },
};

function montarSalarioAshby(comp) {
  const c = comp?.compensationTierSummary || comp?.summaryComponents?.[0];
  if (!c) return null;
  const min = c.minValue ?? c.min ?? null;
  const max = c.maxValue ?? c.max ?? null;
  if (!min && !max) return null;
  return { minSalary: min, maxSalary: max, salaryCurrency: c.currencyCode || 'USD', type: 'year' };
}

function interessa(titulo) {
  const t = normalizarTexto(titulo);
  if (!t) return false;
  if ((palavras.cargo_excluido || []).some((x) => casaTermo(t, x))) return false;
  if (palavras.titulo_excluido.some((x) => casaTermo(t, x))) return false;
  return Object.keys(palavras.titulo_aceito).some((k) => t.includes(normalizarTexto(k)));
}

/**
 * @param {Array<{provedor:string, org:string}>} empresas
 * @returns {{vagas:object[], contador:object, resolvidas:string[], naoResolvidas:string[]}}
 */
export async function coletar(empresas) {
  const c = novoContador(NOME);
  const vagas = [];
  const resolvidas = [];
  const naoResolvidas = [];

  for (const { provedor, org, nome } of empresas) {
    const p = PROVEDORES[provedor];
    if (!p) continue;
    c.consultadas++;

    let json = null;
    try {
      json = await buscar(p.url(org), { tentativas: 1, timeoutMs: 15000 });
    } catch {
      c.falhas++;
      naoResolvidas.push(`${provedor}:${org}`);
      await dormir(200);
      continue;
    }

    const itens = p.extrair(json);
    if (!itens.length) {
      // Quadro vazio e slug errado sao indistinguiveis aqui, e ambos sao "nao rendeu".
      naoResolvidas.push(`${provedor}:${org}`);
      await dormir(200);
      continue;
    }

    resolvidas.push(`${provedor}:${org} (${itens.length})`);
    c.brutas += itens.length;

    for (const bruto of itens) {
      const v = p.normalizar(bruto, org, nome);
      if (!interessa(v.titulo)) continue;

      const eleg = avaliarElegibilidade({ restricoes: v.local, descricao: v.descricao });
      if (!eleg.entra) continue; // vaga que nao aceita LATAM nao serve

      vagas.push({
        idExterno: `${provedor}:${v.id}`,
        fonte: p.rotulo,
        camada: 'API',
        titulo: v.titulo,
        empresa: v.empresa,
        descricao: v.descricao,
        link: v.link,
        cidade: v.local,
        estado: null,
        pais: v.local,
        modelo: v.remoto ? 'remoto' : null,
        remoto: v.remoto || null,
        publicadaEm: v.publicadaEm,
        atualizadaEm: null,
        prazo: null,
        salarioBruto: v.salarioBruto,
        statusFonte: null,
        validada: true,
        elegibilidadeLatam: eleg.latam,
        elegibilidadeMotivo: eleg.motivo,
      });
    }
    await dormir(250);
  }

  return { vagas, contador: c, resolvidas, naoResolvidas };
}
