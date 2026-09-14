// Coluna Tech — WordPress com wp-json aberto e robots.txt permissivo.
// As vagas sao "post" comum, nao custom post type: nao existe /wp/v2/jobs aqui.
//
// Vale a pena por dois motivos: o site e 100% home office, o que casa direto com
// a regra de so remoto, e custa UMA requisicao por rodada (84 posts em per_page=100).
// Em 2026-07-30 nao havia nenhuma vaga de design no ar. Rendimento zero hoje,
// custo zero tambem — fica ligada para quando aparecer.
import { buscar, limparHtml, novoContador, normalizarTexto, casaTermo } from '../util.js';
import { palavras } from '../config.js';

const API = 'https://vagas.colunatech.com.br/wp-json/wp/v2/posts';
export const NOME = 'Coluna Tech';

/** "Vaga home office: Analista Contábil Pleno na Asaas" -> {cargo, empresa} */
export function partirTitulo(bruto) {
  const limpo = limparHtml(bruto).replace(/\s+/g, ' ').trim();
  const semPrefixo = limpo.replace(/^vaga\s+home\s+office\s*:\s*/i, '');
  const m = semPrefixo.match(/^(.*?)\s+na\s+([^-–—]+?)(?:\s*[-–—].*)?$/i);
  if (m) return { cargo: m[1].trim(), empresa: m[2].trim() };
  return { cargo: semPrefixo, empresa: null };
}

function interessa(cargo) {
  const t = normalizarTexto(cargo);
  if (!t) return false;
  if (palavras.titulo_excluido.some((x) => casaTermo(t, x))) return false;
  return Object.keys(palavras.titulo_aceito).some((k) => t.includes(normalizarTexto(k)));
}

export async function coletar() {
  const c = novoContador(NOME);
  const vagas = [];

  c.consultadas++;
  const posts = await buscar(`${API}?per_page=100&_fields=id,date,modified,link,title,content`, { tentativas: 2 });
  const lista = Array.isArray(posts) ? posts : [];
  c.brutas = lista.length;

  for (const p of lista) {
    const { cargo, empresa } = partirTitulo(p.title?.rendered);
    if (!interessa(cargo)) continue;
    vagas.push({
      idExterno: `colunatech:${p.id}`,
      fonte: NOME,
      camada: 'API',
      titulo: cargo,
      empresa,
      descricao: limparHtml(p.content?.rendered),
      link: p.link,
      cidade: null,
      estado: null,
      pais: 'Brasil',
      modelo: 'remoto', // o site inteiro e home office
      remoto: true,
      publicadaEm: p.date ? new Date(p.date).toISOString() : null,
      atualizadaEm: p.modified ? new Date(p.modified).toISOString() : null,
      prazo: null,
      salarioBruto: null,
      statusFonte: null,
      validada: true,
    });
  }

  return { vagas, contador: c };
}
