import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avaliar, avaliarLocal, pistasDoTitulo } from '../src/filtro.js';

const base = (extra = {}) => ({
  titulo: 'Product Designer Sênior',
  empresa: 'Empresa X',
  descricao: 'design system, discovery, figma',
  modelo: 'remoto',
  remoto: true,
  publicadaEm: new Date(Date.now() - 2 * 86400000).toISOString(),
  ...extra,
});

test('titulos reais do Gupy que devem ser descartados', () => {
  // A lista veio do ruido observado no proprio Gupy em 2026-07-29.
  const lixo = [
    'Designer de Sobrancelhas',
    'Motion Designer',
    'Designer Gráfico Jr',
    'Designer de Moda',
    'Designer de Interiores',
    'Projetista CAD',
    'Designer de Embalagem',
    'Designer de Joias',
    'Designer Instrucional',
    'Lash Designer',
    'Designer de Cílios',
  ];
  for (const titulo of lixo) {
    const r = avaliar(base({ titulo }));
    assert.equal(r.passa, false, `deveria descartar: ${titulo}`);
    assert.ok(r.motivo, `sem motivo para: ${titulo}`);
  }
});

test('titulos que devem passar', () => {
  const bons = [
    'Product Designer Sênior',
    'Product Designer',
    'UX/UI Designer Pleno',
    'Designer de Produto Sr',
    'UX Designer Senior',
    'Especialista em Design System',
    'Product Design Lead',
  ];
  for (const titulo of bons) {
    const r = avaliar(base({ titulo }));
    assert.equal(r.passa, true, `deveria passar: ${titulo} (motivo: ${r.motivo})`);
  }
});

test('junior e estagio saem, mesmo com titulo da area', () => {
  for (const titulo of ['Product Designer Júnior', 'Estágio em UX Design', 'Trainee Product Design']) {
    assert.equal(avaliar(base({ titulo })).passa, false, titulo);
  }
});

test('remoto de qualquer lugar do mundo entra', () => {
  for (const cidade of ['Berlin', 'San Francisco', 'Lisboa', 'Sao Paulo', null]) {
    assert.equal(avaliarLocal(base({ modelo: 'remoto', remoto: true, cidade })).passa, true, `remoto em ${cidade}`);
  }
});

test('hibrido e presencial saem, em qualquer cidade.', () => {
  // Regra de 2026-07-30: geografia nao conta mais. So remoto entra.
  for (const cidade of ['Curitiba', 'Recife', 'Sao Paulo', 'Blumenau']) {
    assert.equal(avaliarLocal(base({ modelo: 'hibrido', remoto: false, cidade })).passa, false, `hibrido em ${cidade}`);
    assert.equal(avaliarLocal(base({ modelo: 'presencial', remoto: false, cidade })).passa, false, `presencial em ${cidade}`);
  }
});

test('presencial declarado so no titulo nao vaza', () => {
  // Caso real da primeira rodada: passou como aprovada porque o campo modelo veio nulo.
  const r = avaliarLocal(base({ titulo: 'Product Designer | Presencial | Blumenau/SC', modelo: null, remoto: null, cidade: null }));
  assert.equal(r.passa, false);
  assert.match(r.motivo, /presencial/);
});

test('remoto declarado so no titulo entra', () => {
  const r = avaliarLocal(base({ titulo: 'Product Designer Senior | 100% Remoto', modelo: null, remoto: null, cidade: 'Recife' }));
  assert.equal(r.passa, true);
});

test('modelo desconhecido passa e fica marcado', () => {
  // A Remotar devolve campo nulo em quase tudo. Descartar por falta de dado
  // jogou fora 57 vagas na primeira rodada real.
  const r = avaliarLocal(base({ titulo: 'Product Designer', modelo: null, remoto: null, cidade: null }));
  assert.equal(r.passa, true);
  assert.equal(r.modeloDesconhecido, true);
});

test('pistas do titulo', () => {
  assert.equal(pistasDoTitulo('PRODUCT DESIGNER SENIOR | REMOTO').modelo, 'remoto');
  assert.equal(pistasDoTitulo('Designer Hibrido SP').modelo, 'hibrido');
  assert.equal(pistasDoTitulo('Product Designer | Presencial | Blumenau/SC').modelo, 'presencial');
  assert.equal(pistasDoTitulo('Product Designer').modelo, null);
});

test('inscricao encerrada descarta mesmo sendo de ontem', () => {
  const r = avaliar(base({ encerrada: true, publicadaEm: new Date(Date.now() - 86400000).toISOString() }));
  assert.equal(r.passa, false);
  assert.match(r.motivo, /encerrad/);
});

test('prazo vencido descarta', () => {
  const r = avaliar(base({ prazo: '2020-01-01' }));
  assert.equal(r.passa, false);
  assert.match(r.motivo, /prazo/);
});

test('zumbi de mais de 45 dias descarta, mas prazo futuro o salva', () => {
  const velha = new Date(Date.now() - 60 * 86400000).toISOString();
  assert.equal(avaliar(base({ publicadaEm: velha })).passa, false);

  const futuro = new Date(Date.now() + 30 * 86400000).toISOString();
  assert.equal(avaliar(base({ publicadaEm: velha, prazo: futuro })).passa, true);
});

test('banco de talentos nao e vaga, mesmo com titulo limpo', () => {
  // Caso real da BRQ em 2026-07-30: titulo era so "Product Designer" e a
  // descricao abria com "Mantemos um banco de talentos ativo".
  const r = avaliar(base({
    titulo: 'Product Designer',
    descricao: 'Sobre a vaga Mantemos um banco de talentos ativo para Product Designers que queiram atuar com nossos clientes.',
  }));
  assert.equal(r.passa, false);
  assert.match(r.motivo, /nao e vaga aberta/);
});

test('cadastro reserva e candidatura espontanea tambem saem', () => {
  for (const d of ['Esta e uma cadastro reserva.', 'Candidatura espontânea para o time de design.']) {
    assert.equal(avaliar(base({ descricao: d })).passa, false, d);
  }
});

test('descricao normal nao e afetada', () => {
  assert.equal(avaliar(base({ descricao: 'Buscamos Product Designer para o time de crédito. Design System, discovery, figma.' })).passa, true);
});

test('LGPD no pe do anuncio NAO descarta vaga legitima', () => {
  // Caso real e caro: a vaga da Nomad (status published, melhor encaixe de
  // dominio da lista) foi descartada em 2026-07-30 porque o boilerplate de
  // LGPD no fim do texto cita "banco de talentos". Falso positivo custa vaga boa.
  const lgpd = 'seus dados serão tratados somente enquanto o processo seletivo perdurar e ou para fins de registro no banco de talentos.';
  const r = avaliar(base({
    titulo: 'Product Designer Sênior (Backoffice)',
    descricao: 'Existimos para derrubar fronteiras e fazer o seu dinheiro falar inglês pelo mundo. Buscamos Product Designer com portfólio que demonstre projetos de interfaces complexas, discovery, design system e trabalho próximo de engenharia e produto. Oferecemos ambiente internacional, produto de investimento em dólar e times multidisciplinares. '.repeat(2) + ' Aviso de privacidade: ' + lgpd,
  }));
  assert.equal(r.passa, true, `nao deveria descartar: ${r.motivo}`);
});

test('banco de talentos na ABERTURA ainda descarta', () => {
  const r = avaliar(base({
    titulo: 'Product Designer',
    descricao: 'Sobre a vaga Mantemos um banco de talentos ativo para Product Designers que queiram atuar com nossos clientes.',
  }));
  assert.equal(r.passa, false);
  assert.match(r.motivo, /nao e vaga aberta/);
});

test('cargo de outra disciplina nao entra por casar no titulo', () => {
  // Caso real: a vaga da Dropbox passou porque "Design Systems" casa em
  // titulo_aceito, mas o cargo era Software Engineer.
  const r = avaliar(base({ titulo: 'Frontend Product Software Engineer, Design Systems' }));
  assert.equal(r.passa, false);
  assert.match(r.motivo, /outra disciplina/);

  for (const t of ['Product Manager', 'Desenvolvedor Front-end', 'Data Scientist Sênior']) {
    assert.equal(avaliar(base({ titulo: t })).passa, false, t);
  }
});

test('designer de verdade continua passando', () => {
  for (const t of ['Product Designer Sênior', 'Especialista em Design System', 'Design Ops Sênior']) {
    assert.equal(avaliar(base({ titulo: t })).passa, true, t);
  }
});

test('modelo declarado só no corpo do anúncio também barra', () => {
  // Caso real da EDGE: "Modalidade: Presencial (Maceió ou Arapiraca)" na
  // abertura, título neutro. Entrava como remoto por omissão.
  const r = avaliar(base({
    titulo: 'Designer UI/UX',
    modelo: null, remoto: null,
    descricao: 'Modalidade: Presencial (Maceió ou Arapiraca) Carga Horária: 160h mensais. O Designer de Produto será responsável por criar soluções de software.',
  }));
  assert.equal(r.passa, false);
  assert.match(r.motivo, /presencial/);
});

test('outras disciplinas de design não entram', () => {
  for (const t of ['Web Designer Sr.', 'Visual Designer', 'Designer Visual Pleno']) {
    assert.equal(avaliar(base({ titulo: t })).passa, false, t);
  }
});

test('graduate e early-career contam como júnior', () => {
  assert.equal(avaliar(base({ titulo: 'Visual Designer Graduate' })).passa, false);
});

test('vaga de design de marketing não é vaga de produto', () => {
  // Caso real da CRMBonus: título limpo "Designer Pleno", descrição abrindo em
  // "Nossa área de Marketing" com landing pages e e-mail marketing.
  const r = avaliar(base({
    titulo: 'Designer Pleno',
    descricao: 'Nossa área de Marketing: Será responsável pela criação de materiais visuais que sustentam nossas estratégias de comunicação, geração de demanda e crescimento. O dia a dia envolve landing pages, materiais comerciais, e-mail marketing e apresentações institucionais.',
  }));
  assert.equal(r.passa, false);
  assert.match(r.motivo, /marketing/);
});

test('vaga de produto que cita marketing no meio do texto NÃO é descartada', () => {
  // Falso positivo que custaria vaga boa: quase todo anúncio de produto lista
  // marketing entre os stakeholders. Por isso a checagem só olha a abertura.
  const r = avaliar(base({
    descricao: 'Buscamos Product Designer sênior para o time de crédito. Você vai tocar discovery, design system e testes de usabilidade em produtos financeiros regulados, trabalhando junto de engenharia, produto e '.repeat(3)
      + ' marketing. Também apoiamos campanhas de marketing quando necessário.',
  }));
  assert.equal(r.passa, true, `não deveria descartar: ${r.motivo}`);
});

test('empregador de outra disciplina sai mesmo com título e texto neutros', () => {
  // Sete franqueadas da V4 Company ocuparam sete linhas do radar: o dedupe não
  // junta, porque cada uma tem id próprio e o nome entra no título.
  for (const e of ['V4 Company', 'Prizma Mídia']) {
    const r = avaliar(base({ titulo: 'Designer - Pleno | V4 Ames & Co', empresa: e }));
    assert.equal(r.passa, false, e);
    assert.match(r.motivo, /outra disciplina/);
  }
  assert.equal(avaliar(base({ empresa: 'Nubank' })).passa, true);
});

test('produto DE marketing é produto e deve passar', () => {
  // Falso positivo caro: "marketing" em cargo_excluido barrava vaga de produto.
  for (const t of ['Product Designer, Marketing Cloud', 'Senior Product Designer - Marketing Platform']) {
    assert.equal(avaliar(base({ titulo: t })).passa, true, t);
  }
  // idem no filtro de descrição: SaaS de social media é produto
  const r = avaliar(base({
    descricao: 'Buscamos Product Designer sênior para nossa plataforma de gestão de social media usada por 100 mil empresas. Discovery, design system e testes de usabilidade.',
  }));
  assert.equal(r.passa, true, r.motivo);
});

test('production designer continua fora, e marketing de verdade também', () => {
  assert.equal(avaliar(base({ titulo: 'Senior Production Designer – Marketing' })).passa, false);
  const m = avaliar(base({
    titulo: 'Designer Pleno',
    descricao: 'Nossa área de Marketing: criação de materiais visuais, landing pages, e-mail marketing e geração de demanda.',
  }));
  assert.equal(m.passa, false);
  assert.match(m.motivo, /marketing/);
});


test('modalidade incompatível prevalece sobre flag remota e explica o conflito', () => {
  for (const modelo of ['hibrido', 'presencial']) {
    const r = avaliarLocal(base({ modelo, remoto: true }));
    assert.equal(r.passa, false);
    assert.match(r.motivo, /conflito/);
    assert.match(r.motivo, new RegExp(modelo));
  }
});

test('modalidade explícita no título ou corpo não some atrás de campo remoto', () => {
  for (const extra of [
    { titulo: 'Product Designer | Híbrido' },
    { descricao: 'Modalidade: Presencial em São Paulo.' },
    { titulo: 'Product Designer | Remoto / Híbrido' },
  ]) {
    const r = avaliarLocal(base(extra));
    assert.equal(r.passa, false);
    assert.match(r.motivo, /conflito/);
  }
  assert.equal(avaliarLocal(base({ descricao: 'Pesquisa com clientes de lojas presenciais e equipes híbridas.' })).passa, true);
});


// ---------- hibrido e presencial, quando o perfil aceita (2026-09-14) ----------
import { perfil } from '../src/config.js';

test('com aceita_presencial e cidade no perfil, presencial entra so na cidade da pessoa', () => {
  const antes = { h: perfil.aceita_hibrido, p: perfil.aceita_presencial, c: perfil.cidade };
  Object.assign(perfil, { aceita_hibrido: true, aceita_presencial: true, cidade: 'Curitiba' });
  try {
    const base = (extra) => ({ titulo: 'Product Designer', descricao: '', modelo: null, remoto: null, cidade: null, estado: null, ...extra });
    assert.equal(avaliarLocal(base({ modelo: 'presencial', cidade: 'Curitiba' })).passa, true);
    assert.equal(avaliarLocal(base({ modelo: 'hibrido', titulo: 'Designer Hibrido Curitiba' })).passa, true);
    const fora = avaliarLocal(base({ modelo: 'presencial', cidade: 'Sao Paulo' }));
    assert.equal(fora.passa, false);
    assert.match(fora.motivo, /fora de Curitiba/);
    // Sem cidade no perfil nao da para conferir: passa, nao descarta por falta de dado.
    perfil.cidade = '';
    assert.equal(avaliarLocal(base({ modelo: 'presencial', cidade: 'Sao Paulo' })).passa, true);
  } finally {
    Object.assign(perfil, { aceita_hibrido: antes.h, aceita_presencial: antes.p, cidade: antes.c });
  }
});

test('aceitar hibrido nao abre presencial, e vice-versa', () => {
  const antes = { h: perfil.aceita_hibrido, p: perfil.aceita_presencial, c: perfil.cidade };
  Object.assign(perfil, { aceita_hibrido: true, aceita_presencial: false, cidade: 'Curitiba' });
  try {
    const base = (extra) => ({ titulo: 'Product Designer', descricao: '', modelo: null, remoto: null, cidade: 'Curitiba', estado: null, ...extra });
    assert.equal(avaliarLocal(base({ modelo: 'hibrido' })).passa, true);
    assert.equal(avaliarLocal(base({ modelo: 'presencial' })).passa, false);
  } finally {
    Object.assign(perfil, { aceita_hibrido: antes.h, aceita_presencial: antes.p, cidade: antes.c });
  }
});
