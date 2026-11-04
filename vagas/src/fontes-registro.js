// Catálogo executável compartilhado: mudar as fontes aqui exige conferir paridade.
import * as gupy from './fontes/gupy.js';
import * as remotar from './fontes/remotar.js';
import * as inhire from './fontes/inhire.js';
import * as vagasremotas from './fontes/vagasremotas.js';
import * as colunatech from './fontes/colunatech.js';
import * as vagasux from './fontes/vagasux.js';
import * as arc from './fontes/arc.js';
import * as uxremotetalent from './fontes/uxremotetalent.js';
import * as uxjobs from './fontes/uxjobs.js';
import * as ats from './fontes/ats.js';
import * as gringas from './fontes/gringas.js';
import * as portais from './fontes/portais.js';
import * as importadas from './fontes/importadas.js';
export function perfilDeDesign(perfil = {}, palavras = {}) {
  const cargo = String(perfil.cargo_alvo || '').trim();
  const texto = cargo || Object.keys(palavras.titulo_aceito || {}).join(' ');
  return /design|\bux\b|\bui\b/i.test(texto);
}
export function criarFontes({ empresasAts = [], perfil = {}, palavras = {} } = {}) {
  const fontes = [gupy, remotar, inhire, vagasremotas, colunatech];
  if (perfilDeDesign(perfil, palavras)) fontes.push(vagasux, arc, uxremotetalent, uxjobs);
  fontes.push({ NOME: ats.NOME, coletar: () => ats.coletar(empresasAts) }, gringas,
    { NOME: portais.NOME, coletar: () => portais.coletar({ incluirDesign: perfilDeDesign(perfil, palavras) }) }, importadas);
  return fontes.filter(f => !(perfil.fontes_desligadas || []).includes(f.NOME));
}
