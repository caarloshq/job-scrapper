// Remotar — 5.268 vagas, paginado 50/pagina.
// Achei o endpoint lendo o bundle JS no navegador depois de reprovar a fonte por engano
// com curl em caminho adivinhado. Licao registrada em Memory/regras-aprendidas.md.
//
// Ela e ela mesma agregadora: integrationSource devolve inhire, recrutei e greenhouse.
// Por isso o dedupe por link normalizado nao e enfeite.
import { buscar, limparHtml, dormir, novoContador } from '../util.js';
import { palavras } from '../config.js';

const API = 'https://api.remotar.com.br/jobs';

/**
 * `jobRequirements` e um ARRAY DE OBJETOS, cada um com o texto em `.description`.
 * Jogar o array num join() dava "[object Object],[object Object]" — e o custo
 * nao era o lixo visivel, era o silencioso: os requisitos de verdade sumiam.
 * A vaga da nstech perdia oito linhas do tipo "Experiencia em UX/Product Design
 * de produtos digitais B2B", que sao exatamente o que a leitura semantica usa
 * para decidir encaixe. Sete vagas no cache estavam assim em 2026-08-01.
 */
export function requisitos(bruto) {
  if (!bruto) return null;
  if (typeof bruto === 'string') return bruto;
  if (!Array.isArray(bruto)) return null;
  const linhas = bruto
    .map((r) => (typeof r === 'string' ? r : r?.description || r?.texto || null))
    .filter(Boolean);
  return linhas.length ? linhas.join(' \n ') : null;
}
export const NOME = 'Remotar';

const MODELO = { remote: 'remoto', hybrid: 'hibrido', onsite: 'presencial' };

function paraVaga(j) {
  const encerrada = j.expired === true || j.active === false;
  return {
    idExterno: `remotar:${j.id}`,
    fonte: NOME,
    camada: 'API',
    titulo: j.title,
    empresa: j.company?.name || j.companyDisplayName || null,
    descricao: limparHtml([j.description, requisitos(j.jobRequirements), j.subtitle].filter(Boolean).join(' \n ')),
    link: j.externalLink || null,
    cidade: j.city || null,
    estado: j.state || null,
    pais: j.country || 'Brasil',
    modelo: MODELO[j.type] || null,
    remoto: j.type === 'remote',
    publicadaEm: j.createdAt || null,
    atualizadaEm: j.updatedAt || null,
    prazo: j.expiresAt || null,
    salarioBruto: j.jobSalary || null,
    statusFonte: encerrada ? 'encerrada' : 'ativa',
    encerrada,
    integradaDe: j.integrationSource || null,
    validada: true,
  };
}

export async function coletar() {
  const c = novoContador(NOME);
  const vistos = new Map();

  // A busca da Remotar e fuzzy (devolveu engenheiro Ruby para "product designer"),
  // entao o filtro local e que decide. Aqui so reduzimos o volume trazido.
  for (const termo of [...palavras.consultas_estreitas, palavras.termo_busca_larga].filter(Boolean)) {
    c.consultadas++;
    for (let pagina = 1; pagina <= 4; pagina++) {
      const json = await buscar(`${API}?search=${encodeURIComponent(termo)}&page=${pagina}`);
      const dados = json?.data || [];
      for (const j of dados) if (!vistos.has(j.id)) vistos.set(j.id, paraVaga(j));
      c.brutas += dados.length;
      const ultima = json?.meta?.last_page ?? pagina;
      if (pagina >= ultima || dados.length === 0) break;
      await dormir(150);
    }
    await dormir(150);
  }

  return { vagas: [...vistos.values()], contador: c };
}
