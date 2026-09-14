// Dedupe em quatro chaves.
// A Remotar e ela mesma agregadora: o campo integrationSource dela devolve
// inhire, recrutei e links de job-boards.greenhouse.io. Entao a mesma vaga
// chega por mais de um caminho e uma chave so nao resolve.
import { normalizarLink, normalizarTexto } from './util.js';
import { extrair } from './busca/extrair-id.js';
import { palavras } from './config.js';

/**
 * Quarta chave: a mesma vaga REPUBLICADA, com identidade nova na propria fonte.
 * As tres primeiras chaves nao alcancam isto porque nao existe nada em comum:
 *   Radix   inhire.app/vagas/a10b2bac-... e /vagas/c46ab29f-...  (UUIDs distintos)
 *   SCALIS  vagasremotas/ui-ux-designer-2/ e -3/                 (slugs distintos)
 * Os dois casos apareceram na leitura de 2026-07-30, cada um ocupando duas
 * linhas do radar.
 *
 * Empresa + titulo e chave FRACA de proposito — uma empresa pode ter duas vagas
 * reais com o mesmo titulo. Por isso o perdedor nunca some: vai para
 * idsAlternativos e tambemVistoEm, igual as outras chaves.
 */
/**
 * Titulo comparavel: tira o que muda entre reanuncios da MESMA vaga.
 *
 * Escrito em 2026-09-07, depois de você ver o piloto aplicando de novo em
 * coisa que ja tinha ido semanas antes. Tres formas do mesmo anuncio passaram
 * pelo dedupe porque o titulo diferia num sufixo que nao e a vaga:
 *   Blacksmith  "... Design Systems (Remote, Fortaleza)" / "(Remote, Belem)"
 *   BairesDev   "Senior Product Designer - Remote Work | REF#301709"
 *   alt.bank    "Product Designer" / "Product Designer - Remoto"
 * Cidade, modalidade e numero de requisicao sao rotulo de anuncio, nao de vaga.
 */
export function tituloComparavel(titulo) {
  let s = normalizarTexto(titulo || '');
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/\bref\.?\s*#?\s*[0-9a-z]+\b/g, ' ');
  s = s.replace(/[|\u2013\u2014-]\s*(remoto|remote|home office|brasil|brazil|latam)\b.*$/g, ' ');
  s = s.replace(/\b(remoto|remote|home office|trabalho remoto|work from home)\b/g, ' ');
  s = s.replace(/\bpessoa\b/g, ' ');
  s = s.replace(/\bdesigner de produto\b/g, 'product designer');
  s = s.replace(/\bux\s*\/?\s*ui\b/g, 'uiux').replace(/\bui\s*\/?\s*ux\b/g, 'uiux');
  s = s.replace(/\bsenior\b/g, 'sr').replace(/\bs\u00eanior\b/g, 'sr');
  s = s.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Numero de requisicao dentro do titulo. Quando a empresa publica o mesmo
 * requisition em varios canais, ele e a identidade que sobrevive ao rotulo:
 *   Nortal     "(1552) Senior UX/UI - Product Designer"  no LinkedIn
 *              "Senior UX/UI Product Designer"           na UX Remote Talent
 * As duas sao a requisicao 5223821007 do Greenhouse, e a segunda foi oferecida
 * como nova depois de a primeira ja ter sido enviada.
 */
export function requisicaoDoTitulo(titulo) {
  const s = String(titulo || '');
  let m = s.match(/\((\d{3,6})\)/);
  if (m) return m[1];
  m = s.match(/REF\s*#?\s*([0-9]{3,8}[a-z]?)/i);
  if (m) return m[1].toUpperCase();
  m = s.match(/\bRef\.?\s*([0-9]{3,8}[a-z]?)\b/i);
  if (m) return m[1].toUpperCase();
  return null;
}

/**
 * Duas vagas com titulo equivalente ainda podem ser DIFERENTES quando cada uma
 * carrega o proprio numero de requisicao. A Nortal tem "(1520) Senior UX/UI -
 * Product Designer" e "(1552) Senior UX/UI - Product Designer": mesmo cargo,
 * duas vagas. Mas quando SO UM lado imprime o numero, o silencio do outro nao e
 * prova de nada, e o titulo continua valendo — foi assim que a mesma requisicao
 * 1552 entrou como novidade pela UX Remote Talent depois de ja ter sido enviada.
 *
 * @returns true quando os numeros existem nos dois lados e sao diferentes.
 */
export function requisicoesConflitam(a, b) {
  const ra = requisicaoDoTitulo(a?.titulo);
  const rb = requisicaoDoTitulo(b?.titulo);
  return !!(ra && rb && ra !== rb);
}

/** Quinta chave: empresa + numero de requisicao. Vale a mesma ressalva de agregador. */
export function chaveRequisicao(vaga) {
  const empresa = normalizarTexto(vaga.empresa || '');
  const req = requisicaoDoTitulo(vaga.titulo);
  if (!empresa || !req) return null;
  const agregadores = palavras.empresa_nao_e_empregador || [];
  if (agregadores.some((a) => empresa.includes(normalizarTexto(a)))) return null;
  return `${empresa}##${req}`;
}

export function chaveAnuncio(vaga) {
  const empresa = normalizarTexto(vaga.empresa || '');
  const titulo = tituloComparavel(vaga.titulo);
  if (!empresa || !titulo) return null;

  // Quando "empresa" e o intermediario e nao quem contrata, esta chave mente:
  // duas vagas "Jobgether | Product Designer" sao de empresas finais DIFERENTES.
  // Sao 8 vagas de Jobgether no board, e colapsa-las perderia vaga de verdade.
  const agregadores = palavras.empresa_nao_e_empregador || [];
  if (agregadores.some((a) => empresa.includes(normalizarTexto(a)))) return null;

  return `${empresa}::${titulo}`;
}

/**
 * Terceira chave, e a que realmente resolve o caso da Remotar.
 * O link dela aponta para a ATS de origem mas com o slug anexado:
 *   InHire:  mjv.inhire.app/vagas/e2e3ecd3-...
 *   Remotar: mjv.inhire.app/vagas/e2e3ecd3-.../product-designer-senior-ia-generativa
 * Os caminhos diferem, entao normalizar o link nao basta. Extrair o id do
 * proprio link resolve, porque o id e o mesmo nas duas formas.
 */
export function idCanonico(vaga) {
  const doLink = extrair(vaga.link);
  return doLink?.idExterno || vaga.idExterno;
}

/** Quanto mais direto o link, melhor. Agregador perde para a ATS de origem. */
const PRIORIDADE = {
  Gupy: 10, InHire: 10, Ashby: 10, Greenhouse: 10, Workable: 10, SmartRecruiters: 10, Lever: 10,
  // O LinkedIn fica ABAIXO da ATS de origem e ACIMA dos agregadores BR.
  // Medido no dataset de 2026-08-01: 37 das 50 vagas sao "External Apply", ou
  // seja, a pagina do LinkedIn so redireciona para a ATS — nesses casos o link
  // da ATS e o util. Mas a pagina do LinkedIn e completa e estavel, bem melhor
  // que entrada de agregador raspada do CareerJet, que chega truncada.
  'LinkedIn (Apify)': 7,
  // O Arc hospeda a propria vaga e a candidatura acontece la, entao ele e
  // origem, nao agregador. Fica abaixo da ATS da empresa (a vaga do Arc e de
  // cliente do Arc, nao da empresa final) e acima do LinkedIn.
  Arc: 8,
  Himalayas: 6, 'Vagas Remotas': 5, Remotive: 5,
  // A UX Remote Talent declara na propria pagina que curadoria vem de fonte
  // externa e que ela nao e afiliada ao empregador. Agregador, mesma faixa da
  // Vagas Remotas.
  'UX Remote Talent': 5,
  Remotar: 4,
  Solta: 1,
};

export function prioridade(fonte) {
  return PRIORIDADE[fonte] ?? 5;
}

/**
 * Quinta camada: reconcilia o CACHE inteiro entre chamadas de coleta.
 *
 * `juntar()` so enxerga a lista que recebe. `npm run apify` roda sozinho e
 * junta contra o cache inteiro; `npm run rodada` junta so contra o que
 * pescou nesta chamada. Rodar os dois no mesmo dia — o caminho documentado
 * em RODADA-DIARIA.md — deixa uma vaga como entrada solta no cache se ela
 * apareceu numa chamada sem a duplicata ainda estar la para comparar. Uma
 * vez gravada como chave propria, nada volta a comparar essa entrada contra
 * o resto do cache, e ela nunca mais sai — inclusive se a duplicata ja
 * concluida (Já apliquei) estiver bem ao lado.
 *
 * Caso real de 2026-08-03: `npm run apify` achou a vaga da Lastlink antes de
 * a InHire (que ja tinha a mesma vaga, concluida) estar no cache. As duas
 * chaves sobreviveram lado a lado, e a do LinkedIn foi publicada no Notion
 * como se fosse nova.
 *
 * @param {Record<string, object>} vagasCache o `cache.carregar().vagas`
 * @returns {{vagas: Record<string, object>, removidos: string[]}}
 *   `vagas` e o cache reconciliado, pronto para `cache.salvar()`.
 *   `removidos` sao os ids que deixaram de existir como chave propria porque
 *   uma outra entrada do cache ja e a mesma vaga.
 */
export function reconciliarCache(vagasCache) {
  const antes = new Set(Object.keys(vagasCache));
  const { vagas } = juntar(Object.values(vagasCache));
  const novoCache = Object.fromEntries(vagas.map((v) => [v.idExterno, v]));
  const removidos = [...antes].filter((id) => !(id in novoCache));
  return { vagas: novoCache, removidos };
}

/**
 * Junta vagas de varias fontes. Vence a de link mais direto; as outras
 * ficam registradas em tambemVistoEm para nao perder a informacao.
 * @returns {{vagas: object[], colisoes: number}}
 */
function candidatoPorAnuncio(mapa, chave, v) {
  const outro = mapa.get(chave);
  if (!outro) return null;
  return requisicoesConflitam(v, outro) ? null : outro;
}

export function juntar(lista) {
  const porId = new Map();
  const porLink = new Map();
  const porCanonico = new Map();
  const porAnuncio = new Map();
  const porRequisicao = new Map();
  let colisoes = 0;

  for (const v of lista) {
    const link = normalizarLink(v.link);
    const canonico = idCanonico(v);
    const anuncio = chaveAnuncio(v);
    const requisicao = chaveRequisicao(v);
    const existente = porId.get(v.idExterno)
      || porCanonico.get(canonico)
      || (link ? porLink.get(link) : null)
      || (requisicao ? porRequisicao.get(requisicao) : null)
      || (anuncio ? candidatoPorAnuncio(porAnuncio, anuncio, v) : null);

    if (!existente) {
      v.tambemVistoEm = [];
      v.idCanonico = canonico;
      v.idsAlternativos = [];
      porId.set(v.idExterno, v);
      porCanonico.set(canonico, v);
      if (link) porLink.set(link, v);
      if (anuncio) porAnuncio.set(anuncio, v);
      if (requisicao) porRequisicao.set(requisicao, v);
      continue;
    }

    colisoes++;
    if (prioridade(v.fonte) > prioridade(existente.fonte)) {
      // a nova e mais direta: assume o lugar e herda o historico
      v.tambemVistoEm = [...new Set([...(existente.tambemVistoEm || []), existente.fonte])];
      v.idCanonico = canonico;
      // O vencedor herda os ids do perdedor. Sem isto, mudar a prioridade de
      // uma fonte troca o idExterno vencedor e ORFANA o julgamento semantico:
      // Arco e RD Station perderam nota 87% e 86% assim em 2026-07-30.
      v.idsAlternativos = [...new Set([
        ...(v.idsAlternativos || []), ...(existente.idsAlternativos || []),
        existente.idExterno, existente.idCanonico,
      ].filter((x) => x && x !== v.idExterno))];
      porId.set(v.idExterno, v);
      porId.set(existente.idExterno, v);
      porCanonico.set(canonico, v);
      if (link) porLink.set(link, v);
      if (anuncio) porAnuncio.set(anuncio, v);
      if (requisicao) porRequisicao.set(requisicao, v);
    } else {
      existente.tambemVistoEm = [...new Set([...(existente.tambemVistoEm || []), v.fonte])];
      existente.idsAlternativos = [...new Set([
        ...(existente.idsAlternativos || []), v.idExterno, canonico,
      ].filter((x) => x && x !== existente.idExterno))];
      // preenche lacunas com o que a fonte menos prioritaria trouxe
      for (const c of ['descricao', 'salarioBruto', 'atualizadaEm', 'publicadaEm', 'cidade', 'estado', 'modelo']) {
        if (!existente[c] && v[c]) existente[c] = v[c];
      }
    }
  }

  return { vagas: [...new Set(porId.values())], colisoes };
}
