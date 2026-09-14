import { test } from 'node:test';
import assert from 'node:assert/strict';
import { juntar, prioridade, idCanonico, chaveAnuncio, reconciliarCache } from '../src/dedupe.js';
import { normalizarLink } from '../src/util.js';

test('normalizarLink tira utm, barra final e www', () => {
  const a = normalizarLink('https://mjv.inhire.app/vagas/abc-123/product-designer?utm_source=remotar');
  const b = normalizarLink('http://www.mjv.inhire.app/vagas/abc-123/product-designer/');
  assert.equal(a, b);
});

test('a mesma vaga chegando por InHire e por Remotar vira uma linha, e vence a InHire', () => {
  // Caso real: a Remotar trouxe uma vaga apontando para mjv.inhire.app.
  const link = 'https://mjv.inhire.app/vagas/e2e3ecd3-beb1-4c18-b862-f4f06cc3c726/product-designer-senior';
  const { vagas, colisoes } = juntar([
    { idExterno: 'remotar:156937', fonte: 'Remotar', titulo: 'Product Designer Sênior', link: `${link}?utm_source=remotar` },
    { idExterno: 'inhire:e2e3ecd3-beb1-4c18-b862-f4f06cc3c726', fonte: 'InHire', titulo: 'Product Designer Sênior', link, descricao: 'texto completo' },
  ]);
  assert.equal(vagas.length, 1);
  assert.equal(colisoes, 1);
  assert.equal(vagas[0].fonte, 'InHire', 'a ATS de origem deve vencer o agregador');
  assert.deepEqual(vagas[0].tambemVistoEm, ['Remotar']);
});

test('o agregador preenche lacuna que a fonte vencedora nao trouxe', () => {
  const link = 'https://x.gupy.io/jobs/1';
  const { vagas } = juntar([
    { idExterno: 'gupy:1', fonte: 'Gupy', titulo: 'Product Designer', link, descricao: 'tem descricao', salarioBruto: null },
    { idExterno: 'remotar:9', fonte: 'Remotar', titulo: 'Product Designer', link, salarioBruto: { from: 12000, to: 16000, currency: 'BRL', type: 'monthly' } },
  ]);
  assert.equal(vagas.length, 1);
  assert.equal(vagas[0].fonte, 'Gupy');
  assert.ok(vagas[0].salarioBruto, 'devia herdar o salario que so a Remotar tinha');
});

test('vagas diferentes nao colidem', () => {
  const { vagas, colisoes } = juntar([
    { idExterno: 'gupy:1', fonte: 'Gupy', titulo: 'A', link: 'https://a.gupy.io/jobs/1' },
    { idExterno: 'gupy:2', fonte: 'Gupy', titulo: 'B', link: 'https://a.gupy.io/jobs/2' },
  ]);
  assert.equal(vagas.length, 2);
  assert.equal(colisoes, 0);
});

test('vaga sem link ainda dedupa por id', () => {
  const { vagas } = juntar([
    { idExterno: 'gupy:1', fonte: 'Gupy', titulo: 'A', link: null },
    { idExterno: 'gupy:1', fonte: 'Gupy', titulo: 'A', link: null },
  ]);
  assert.equal(vagas.length, 1);
});

test('prioridade: ATS de origem acima de agregador', () => {
  assert.ok(prioridade('Gupy') > prioridade('Remotar'));
  assert.ok(prioridade('InHire') > prioridade('Remotar'));
  assert.ok(prioridade('Remotar') > prioridade('Solta'));
});

test('Remotar anexa slug no link da ATS: dedupe tem que pegar mesmo assim', () => {
  // Caso real da primeira sincronizacao (2026-07-30): a mesma vaga da MJV
  // entrou duas vezes porque a Remotar aponta para o link da InHire COM o slug
  // no fim, e normalizar o link nao casa caminhos diferentes.
  const { vagas, colisoes } = juntar([
    {
      idExterno: 'inhire:e2e3ecd3-beb1-4c18-b862-f4f06cc3c726',
      fonte: 'InHire',
      titulo: 'Product Designer Sênior (IA Generativa)',
      link: 'https://mjv.inhire.app/vagas/e2e3ecd3-beb1-4c18-b862-f4f06cc3c726',
    },
    {
      idExterno: 'remotar:156937',
      fonte: 'Remotar',
      titulo: 'Product Designer Sênior',
      link: 'https://mjv.inhire.app/vagas/e2e3ecd3-beb1-4c18-b862-f4f06cc3c726/product-designer-senior-ia-generativa-projeto-temporario',
    },
  ]);
  assert.equal(vagas.length, 1, 'era a mesma vaga da MJV');
  assert.equal(colisoes, 1);
  assert.equal(vagas[0].fonte, 'InHire');
  assert.deepEqual(vagas[0].tambemVistoEm, ['Remotar']);
});

test('mesmo caso na Luby', () => {
  const { vagas } = juntar([
    { idExterno: 'remotar:152802', fonte: 'Remotar', titulo: 'Product Designer (IA) Sênior', link: 'https://luby.inhire.app/vagas/fcc3becd-3a58-4fc4-88c9-176d6ae5715d/profissional-product-designer-ia-senior-remoto' },
    { idExterno: 'inhire:fcc3becd-3a58-4fc4-88c9-176d6ae5715d', fonte: 'InHire', titulo: 'Profissional Product Designer (IA) Sênior', link: 'https://luby.inhire.app/vagas/fcc3becd-3a58-4fc4-88c9-176d6ae5715d' },
  ]);
  assert.equal(vagas.length, 1);
  assert.equal(vagas[0].fonte, 'InHire');
});

test('idCanonico usa o id do link quando ele aponta para uma ATS conhecida', () => {
  assert.equal(
    idCanonico({ idExterno: 'remotar:156774', link: 'https://job-boards.greenhouse.io/arcoeducacao/jobs/6127944004?utm_source=remotar' }),
    'greenhouse:6127944004'
  );
  // link de host desconhecido mantem o id da propria fonte
  assert.equal(idCanonico({ idExterno: 'colunatech:25765', link: 'https://vagas.colunatech.com.br/vaga-x-25765/' }), 'colunatech:25765');
});

test('vaga republicada com identidade nova na propria fonte colapsa', () => {
  // Casos reais de 2026-07-30, cada um ocupando duas linhas do radar:
  // a Radix republicou na InHire com outro UUID, a SCALIS na Vagas Remotas
  // com slug -2 e -3. Nada em comum entre as duas formas: nem id, nem link,
  // nem id canonico.
  const { vagas } = juntar([
    { idExterno: 'inhire:a10b2bac', fonte: 'InHire', empresa: 'Radix', titulo: 'Profissional Web Designer Sr.',
      link: 'https://radix.inhire.app/vagas/a10b2bac/profissional-web-designer-sr' },
    { idExterno: 'inhire:c46ab29f', fonte: 'InHire', empresa: 'Radix', titulo: 'Profissional Web Designer Sr. ',
      link: 'https://radix.inhire.app/vagas/c46ab29f/profissional-web-designer-sr' },
  ]);
  assert.equal(vagas.length, 1);
  // O perdedor nunca some: a chave e fraca, entao a informacao fica guardada.
  assert.ok(vagas[0].idsAlternativos.includes('inhire:c46ab29f'));
});

test('empresas diferentes com o mesmo titulo NAO colapsam', () => {
  const { vagas } = juntar([
    { idExterno: 'a', fonte: 'Gupy', empresa: 'Nubank', titulo: 'Product Designer', link: 'https://x/a' },
    { idExterno: 'b', fonte: 'Gupy', empresa: 'Itau', titulo: 'Product Designer', link: 'https://x/b' },
  ]);
  assert.equal(vagas.length, 2);
});

test('chaveAnuncio ignora caixa, acento e espaco sobrando', () => {
  const a = chaveAnuncio({ empresa: 'Radix', titulo: 'Profissional Web Designer Sr. ' });
  const b = chaveAnuncio({ empresa: 'RADIX', titulo: 'Profissional  Web Designer Sr.' });
  assert.equal(a, b);
  assert.equal(chaveAnuncio({ empresa: '', titulo: 'x' }), null);
});

test('agregador que esconde a empresa final NÃO colapsa por empresa+título', () => {
  // A Jobgether é intermediária: "empresa" é ela, não quem contrata. Duas
  // vagas "Jobgether | Product Designer" são de empresas finais diferentes.
  assert.equal(chaveAnuncio({ empresa: 'Jobgether', titulo: 'Product Designer' }), null);
  assert.equal(chaveAnuncio({ empresa: 'Jobgether (empresa não revelada)', titulo: 'Product Designer' }), null);

  const { vagas } = juntar([
    { idExterno: 'a', fonte: 'Vagas Remotas', empresa: 'Jobgether', titulo: 'Product Designer', link: 'https://x/fintech' },
    { idExterno: 'b', fonte: 'Vagas Remotas', empresa: 'Jobgether', titulo: 'Product Designer', link: 'https://x/saude' },
  ]);
  assert.equal(vagas.length, 2);

  // e o caso que a chave existe para resolver continua resolvido
  const radix = juntar([
    { idExterno: 'inhire:a', fonte: 'InHire', empresa: 'Radix', titulo: 'Web Designer Sr.', link: 'https://r/vagas/a/s' },
    { idExterno: 'inhire:b', fonte: 'InHire', empresa: 'Radix', titulo: 'Web Designer Sr.', link: 'https://r/vagas/b/s' },
  ]);
  assert.equal(radix.vagas.length, 1);
});

test('reconciliarCache funde vaga que entrou solta numa chamada anterior', () => {
  // Caso real de 2026-08-03: `npm run apify` achou a Lastlink antes de a
  // InHire (mesma vaga, ja concluida) estar no cache, entao as duas viraram
  // chaves separadas. `juntar()` isolado nunca resolve isso porque cada
  // chamada so compara contra a lista que ela mesma recebeu.
  const cache = {
    'inhire:0d1db9fd': {
      idExterno: 'inhire:0d1db9fd', fonte: 'InHire', empresa: 'Lastlink', titulo: 'Staff Product Designer',
      link: 'https://lastlink.inhire.app/vagas/0d1db9fd/staff-product-designer',
      concluida: true, statusNotion: 'Já apliquei',
    },
    'linkedin:4438352034': {
      idExterno: 'linkedin:4438352034', fonte: 'LinkedIn (Apify)', empresa: 'Lastlink', titulo: 'Staff Product Designer',
      link: 'https://www.linkedin.com/jobs/view/4438352034',
      concluida: false, noNotion: false,
    },
  };

  const { vagas, removidos } = reconciliarCache(cache);

  assert.deepEqual(removidos, ['linkedin:4438352034'], 'a entrada solta do LinkedIn tem que sumir do cache');
  assert.equal(Object.keys(vagas).length, 1);
  assert.equal(vagas['inhire:0d1db9fd'].fonte, 'InHire', 'a ATS de origem vence, mesmo entrando depois');
  assert.ok(vagas['inhire:0d1db9fd'].idsAlternativos.includes('linkedin:4438352034'), 'o id do LinkedIn fica registrado, nao evapora');
});

test('reconciliarCache nao mexe em vagas de empresas diferentes', () => {
  const cache = {
    a: { idExterno: 'a', fonte: 'Gupy', empresa: 'Nubank', titulo: 'Product Designer', link: 'https://x/a' },
    b: { idExterno: 'b', fonte: 'Gupy', empresa: 'Itau', titulo: 'Product Designer', link: 'https://x/b' },
  };
  const { vagas, removidos } = reconciliarCache(cache);
  assert.equal(Object.keys(vagas).length, 2);
  assert.equal(removidos.length, 0);
});
