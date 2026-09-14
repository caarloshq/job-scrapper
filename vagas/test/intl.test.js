import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elegivelLatam, citaLatamNoTexto, avaliarElegibilidade } from '../src/fontes/intl.js';

test('campo estruturado decide quando é claro', () => {
  assert.equal(elegivelLatam(['Brazil']).elegivel, true);
  assert.equal(elegivelLatam(['LATAM', 'Europe']).elegivel, true);
  assert.equal(elegivelLatam('Worldwide').elegivel, true);
  assert.equal(elegivelLatam(['United States']).elegivel, false);
  assert.equal(elegivelLatam(['Canada']).elegivel, false);
});

test('sem restrição declarada é "não sei", e não sei passa', () => {
  // Descartar por falta de dado já custou vaga boa três vezes neste projeto.
  assert.equal(elegivelLatam(null).elegivel, null);
  assert.equal(avaliarElegibilidade({ restricoes: null, descricao: 'vaga remota' }).entra, true);
});

test('menção solta a LATAM no corpo NÃO vale', () => {
  // Bug real: vaga da Figma em San Francisco entrou porque o texto
  // institucional cita LATAM em algum lugar. Mesmo erro do boilerplate de LGPD.
  const boilerplate = 'We are a global company with offices in San Francisco, London and Brazil. We are an equal opportunity employer.';
  assert.equal(citaLatamNoTexto(boilerplate), false);
});

test('menção colada em rótulo de localização vale', () => {
  assert.equal(citaLatamNoTexto('Location: Remote (United States, Europe, Canada, or LATAM)'), true);
  assert.equal(citaLatamNoTexto('This role is open to candidates based in Brazil'), true);
  assert.equal(citaLatamNoTexto('Work from anywhere'), true);
});

test('campo estruturado VENCE o texto', () => {
  // A vaga em San Francisco não vira vaga para o Brasil porque o corpo
  // menciona LATAM. Antes disso a Figma inteira entrava no radar.
  const r = avaliarElegibilidade({
    restricoes: 'San Francisco, CA',
    descricao: 'Location: our teams work across the US, Europe and LATAM.',
  });
  assert.equal(r.entra, false, 'campo explícito não pode ser sobrescrito pelo texto');
});

test('caso real do CodePath entra', () => {
  const r = avaliarElegibilidade({
    restricoes: null,
    descricao: 'About the Role Location: Remote (United States, Europe, Canada, or LATAM) Role Type: Full-Time',
  });
  assert.equal(r.entra, true);
  assert.equal(r.latam, true);
});

test('campo que nomeia um lugar sem citar LATAM bloqueia', () => {
  // Enumerar cidade do mundo é impossível, então a regra é invertida: se o
  // campo nomeia um lugar e não cita LATAM, é o endereço do escritório.
  for (const l of ['San Francisco, CA', 'Tel Aviv, Israel', 'London, England', 'New York, NY']) {
    assert.equal(elegivelLatam(l).elegivel, false, l);
  }
});

test('"Remote" sozinho é ambíguo e passa marcado', () => {
  assert.equal(elegivelLatam('Remote').elegivel, null);
  assert.equal(elegivelLatam('Remoto').elegivel, null);
  assert.equal(avaliarElegibilidade({ restricoes: 'Remote', descricao: 'vaga' }).entra, true);
});

test('local brasileiro continua entrando', () => {
  for (const l of ['São Paulo, Brazil', 'Remoto, Brasil', 'Remote - LATAM']) {
    assert.equal(elegivelLatam(l).elegivel, true, l);
  }
});
