import test from 'node:test';
import assert from 'node:assert/strict';
import { validarBanco, validarCandidatura, respostaAutomatica, modeloCandidatura, contemMetatexto } from '../src/respostas.js';

const entrada = (extra = {}) => ({ pergunta: 'Qual sua disponibilidade?', normalizada: 'qual sua disponibilidade',
  resposta: 'Disponibilidade imediata.', uso: 'direta', aprovada: true, fonte: 'config/perfil-candidatura.json#contratacao', escopo: 'geral', ...extra });
const candidatura = (extra = {}) => ({ idExterno: 'teste:123', empresa: 'Vivo', idioma: 'pt-BR',
  descricaoFonte: 'https://empresa.example/vagas/123', estado: 'rascunho',
  autorizacaoEnvio: { em: '2026-09-14', referencia: 'data/revisoes/vivo-2026-09-14.md#autorizacao-voce' },
  respostas: [{ pergunta: 'Qual sua disponibilidade?', resposta: 'Disponibilidade imediata.',
    fonte: 'config/perfil-candidatura.json#contratacao', escopo: 'geral', aprovada: true }], ...extra });

test('texto final aprovado e referenciado passa; contextual aprovado não é automático', () => {
  assert.equal(validarBanco({ perguntas: [entrada()] }).ok, true);
  assert.equal(respostaAutomatica(entrada(), { empresa: 'Vivo' }), true);
  assert.equal(respostaAutomatica(entrada()), false);
  assert.equal(respostaAutomatica(entrada({ escopo: 'Vivo' }), { empresa: 'Deel' }), false);
  assert.equal(respostaAutomatica(entrada({ escopo: 'empresas discutidas em 2026-09-14' }), { empresa: 'Vivo' }), false);
  assert.equal(respostaAutomatica(entrada({ uso: 'contextual' }), { empresa: 'Vivo' }), false);
  assert.equal(respostaAutomatica(entrada({ uso: 'pessoal' }), { empresa: 'Vivo' }), false);
});

test('banco recusa metatexto aprovado e aceita pendência contextual sem texto', () => {
  for (const resposta of ['Traducao para o ingles da resposta aprovada', 'Resposta enviada em 2026-09-01',
    'Texto sobre trabalho remoto', 'Ver data/dados-pessoais.json', 'Depende da vaga.', 'B2. NAO declarar fluencia.']) {
    assert.equal(validarBanco({ perguntas: [entrada({ resposta })] }).ok, false);
  }
  assert.equal(validarBanco({ perguntas: [entrada({ resposta: null, uso: 'contextual', aprovada: false })] }).ok, true);
  assert.equal(validarBanco({ perguntas: [entrada({ resposta: null })] }).ok, false);
});

test('instrução e resumo antigo separados não contaminam texto final', () => {
  assert.equal(validarBanco({ perguntas: [entrada({ instrucao: 'Depende da vaga', registro_anterior: 'Resposta enviada em 2026-09-01' })] }).ok, true);
});

test('candidatura permite geral e empresa exata; recusa outra empresa e país não declarado', () => {
  assert.equal(validarCandidatura(candidatura()).ok, true);
  for (const [escopo, esperado] of [['Vivo', true], ['Deel', false], ['Brasil', false]]) {
    const c = candidatura(); c.respostas[0].escopo = escopo;
    assert.equal(validarCandidatura(c).ok, esperado);
  }
  const c = candidatura({ pais: 'Brasil' }); c.respostas[0].escopo = 'Brasil';
  assert.equal(validarCandidatura(c).ok, true);
});

test('rascunho pendente bloqueia pré-envio e enviada precisa confirmação concreta', () => {
  const c = candidatura(); c.respostas[0].aprovada = false;
  assert.equal(validarCandidatura(c).ok, false);
  assert.equal(validarCandidatura(c).pendencias.length, 1);
  assert.equal(validarCandidatura(candidatura({ estado: 'enviada' })).ok, false);
  assert.equal(validarCandidatura(candidatura({ estado: 'enviada', confirmacao: {
    em: '2026-09-14', referencia: 'data/revisoes/vivo-2026-09-14.md#tela-confirmacao-plataforma',
  } })).ok, true);
});

test('registro recusa documento, dado sensível, fonte vaga e metatexto sem exibir conteúdo', () => {
  for (const patch of [{ pergunta: 'Qual seu CPF?', resposta: '123.456.789-00' },
    { pergunta: 'What pronouns do you use?', resposta: 'He/Him' },
    { fonte: 'confirmado' }, { resposta: 'Traducao para o ingles da resposta aprovada' }]) {
    const c = candidatura(); Object.assign(c.respostas[0], patch);
    const resultado = validarCandidatura(c);
    assert.equal(resultado.ok, false);
    assert.equal(JSON.stringify(resultado).includes('123.456.789-00'), false);
  }
});

test('modelo é pendente e erro de perfil identifica default contextual', () => {
  assert.equal(validarCandidatura(modeloCandidatura()).ok, false);
  assert.equal(validarBanco({ perguntas: [entrada()] }, { perguntas_comuns: { ja_trabalhou_na_empresa: 'Não' } }).ok, false);
});

test('consentimento condicionado conserva autorização sem liberar opcionais', () => {
  const banco = { perguntas: [entrada()] };
  assert.equal(validarBanco(banco, { consentimento: { marcar_lgpd_automaticamente: false } }).ok, true);
  assert.equal(validarBanco(banco, { consentimento: { marcar_lgpd_automaticamente: true } }).ok, false);
  const consentimento = { marcar_lgpd_automaticamente: true, somente_candidatura_com_envio_autorizado: true,
    opcionais_exigem_decisao: true, fonte_autorizacao: 'data/revisoes/2026-09-14.md#consentimento' };
  assert.equal(validarBanco(banco, { consentimento }).ok, true);
  assert.equal(validarBanco(banco, { consentimento: { ...consentimento, opcionais_exigem_decisao: false } }).ok, false);
});


test('formulário sem perguntas não exige resposta fictícia e confirmação aceita imagem', () => {
  assert.equal(validarCandidatura(candidatura({ respostas: [] })).ok, true);
  assert.equal(validarCandidatura(candidatura({ respostas: [], estado: 'enviada', confirmacao: {
    em: '2026-09-14', referencia: 'data/respostas-enviadas/confirmacao.png',
  } })).ok, true);
});


test('todo em português não é placeholder; fonte vaga nunca é chamada pronta', () => {
  assert.equal(contemMetatexto('Atuei em todo o ciclo de discovery e entrega.'), false);
  assert.equal(contemMetatexto('TODO: preencher'), true);
  assert.equal(contemMetatexto('[TODO]'), true);
  assert.equal(respostaAutomatica(entrada({ fonte: 'Registro legado' }), { empresa: 'Vivo' }), false);
  assert.equal(respostaAutomatica(entrada({ fonte: 'config/perfil-candidatura.json#profissional.escolaridade' }), { empresa: 'Vivo' }), true);
});
