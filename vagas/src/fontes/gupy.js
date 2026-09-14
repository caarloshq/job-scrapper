// Gupy — employability-portal. Maior volume BR e traz DESCRICAO COMPLETA.
// Nao traz salario: enumerei as 18 chaves em 20 vagas em 2026-07-29. So o texto resta.
// Atencao: este portal so lista quem optou pelo portal publico. Vaga que mora
// so em <empresa>.gupy.io nao aparece aqui — e por isso que a camada 2 existe.
import { buscar, limparHtml, dormir, novoContador } from '../util.js';
import { palavras } from '../config.js';

const API = 'https://employability-portal.gupy.io/api/v1/jobs';
export const NOME = 'Gupy';

const MODELO = { remote: 'remoto', hybrid: 'hibrido', 'on-site': 'presencial', onsite: 'presencial', presential: 'presencial' };

function paraVaga(j) {
  return {
    idExterno: `gupy:${j.id}`,
    fonte: NOME,
    camada: 'API',
    titulo: j.name,
    empresa: j.careerPageName || null,
    descricao: limparHtml(j.description),
    link: j.jobUrl,
    cidade: j.city || null,
    estado: j.state || null,
    pais: j.country || 'Brasil',
    modelo: MODELO[j.workplaceType] || (j.isRemoteWork ? 'remoto' : null),
    remoto: j.isRemoteWork === true || j.workplaceType === 'remote',
    publicadaEm: j.publishedDate || null,
    atualizadaEm: null,
    prazo: j.applicationDeadline || null,
    salarioBruto: null,
    statusFonte: null,
    validada: true,
  };
}

/** Puxa largo e filtra local: "Designer" devolve 246 e contem inteiramente os 22 de "Product Designer". */
export async function coletar() {
  const c = novoContador(NOME);
  const vistos = new Map();

  for (const termo of palavras.consultas_amplas) {
    c.consultadas++;
    let offset = 0;
    const limite = 100;
    while (offset <= 1000) {
      const url = `${API}?jobName=${encodeURIComponent(termo)}&offset=${offset}&limit=${limite}`;
      // try/catch POR PAGINA: sem isto, um erro de rede numa pagina estourava a
      // fonte inteira e as 1180 vagas ja coletadas iam embora com ela.
      let json = null;
      try {
        json = await buscar(url);
      } catch (e) {
        c.erro = `pagina ${termo}@${offset}: ${e.message}`;
        break;
      }
      const dados = json?.data || [];
      for (const j of dados) if (!vistos.has(j.id)) vistos.set(j.id, paraVaga(j));
      c.brutas += dados.length;
      if (dados.length < limite) break;
      offset += limite;
      await dormir(150);
    }
    await dormir(150);
  }

  return { vagas: [...vistos.values()], contador: c };
}
