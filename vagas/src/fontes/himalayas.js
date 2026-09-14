// Himalayas — remoto internacional. A melhor fonte de salario da lista:
// traz minSalary, maxSalary e salaryCurrency estruturados, o que nenhuma
// fonte BR faz. Tambem traz seniority e locationRestrictions.
import { buscar, limparHtml, novoContador, normalizarTexto, casaTermo } from '../util.js';
import { palavras } from '../config.js';
import { avaliarElegibilidade } from './intl.js';

const API = 'https://himalayas.app/jobs/api';
export const NOME = 'Himalayas';

function interessa(titulo) {
  const t = normalizarTexto(titulo);
  if (!t) return false;
  if ((palavras.cargo_excluido || []).some((x) => casaTermo(t, x))) return false;
  if (palavras.titulo_excluido.some((x) => casaTermo(t, x))) return false;
  return Object.keys(palavras.titulo_aceito).some((k) => t.includes(normalizarTexto(k)));
}

/** O Himalayas devolve seniority como lista: ["Senior"], ["Mid-level"]. */
function nivelDe(seniority) {
  const s = normalizarTexto(Array.isArray(seniority) ? seniority.join(' ') : seniority || '');
  if (/senior|lead|staff|principal/.test(s)) return 'senior';
  if (/mid|pleno/.test(s)) return 'pleno';
  if (/junior|entry|intern/.test(s)) return 'junior';
  return null;
}

export async function coletar() {
  const c = novoContador(NOME);
  const vagas = [];
  const vistos = new Set();

  for (const termo of ['product designer', 'ux designer', 'design systems']) {
    c.consultadas++;
    let json = null;
    try {
      json = await buscar(`${API}?limit=100&search=${encodeURIComponent(termo)}`);
    } catch {
      c.falhas++;
      continue;
    }
    const itens = json?.jobs || [];
    c.brutas += itens.length;

    for (const j of itens) {
      const id = j.guid || j.applicationLink || j.title;
      if (!id || vistos.has(id)) continue;
      if (!interessa(j.title)) continue;

      const descricao = limparHtml(j.description || j.excerpt);
      const eleg = avaliarElegibilidade({ restricoes: j.locationRestrictions, descricao });
      if (!eleg.entra) continue; // vaga que nao aceita LATAM nao serve

      vistos.add(id);
      const pub = j.pubDate ? new Date(Number(j.pubDate) * 1000) : null;
      vagas.push({
        idExterno: `himalayas:${id}`,
        fonte: NOME,
        camada: 'API',
        titulo: j.title,
        empresa: j.companyName || null,
        descricao,
        link: j.applicationLink || j.url || null,
        cidade: null,
        estado: null,
        pais: Array.isArray(j.locationRestrictions) ? j.locationRestrictions.join(', ') : null,
        modelo: 'remoto', // o site inteiro e remoto
        remoto: true,
        senioridade: nivelDe(j.seniority) || undefined,
        publicadaEm: pub && !Number.isNaN(pub.getTime()) ? pub.toISOString() : null,
        atualizadaEm: null,
        prazo: null,
        salarioBruto: j.minSalary || j.maxSalary
          ? { minSalary: j.minSalary, maxSalary: j.maxSalary, salaryCurrency: j.salaryCurrency || 'USD', type: 'year' }
          : null,
        statusFonte: null,
        validada: true,
        elegibilidadeLatam: eleg.latam,
        elegibilidadeMotivo: eleg.motivo,
      });
    }
  }

  return { vagas, contador: c };
}
