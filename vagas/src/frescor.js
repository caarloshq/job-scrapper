// Janela de frescor. Vaga parada nao conta, mas corte seco em 7 dias mata a lista:
// o portal do Gupy tem 22 vagas de Product Designer no total.
import { perfil } from './config.js';

/**
 * Data efetiva = a mais recente entre publicacao, atualizacao e republicacao.
 * Vaga publicada ha 40 dias mas editada ontem esta viva, e vale mais que
 * uma de ontem que ja fechou.
 */
export function dataEfetiva(vaga) {
  const candidatas = [vaga.publicadaEm, vaga.atualizadaEm, vaga.republicadaEm]
    .filter(Boolean)
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (!candidatas.length) return null;
  return new Date(Math.max(...candidatas.map((d) => d.getTime())));
}

export function idadeEmDias(vaga, agora = new Date()) {
  const d = dataEfetiva(vaga);
  if (!d) return null;
  return Math.floor((agora.getTime() - d.getTime()) / 86400000);
}

/**
 * Janela: nova | recente | parada | zumbi | desconhecida
 * Zumbi com prazo de inscricao futuro e explicito volta para recente.
 */
export function janela(vaga, agora = new Date()) {
  const f = perfil.frescor;
  const idade = idadeEmDias(vaga, agora);
  if (idade === null) return 'desconhecida';
  if (idade <= f.nova_ate) return 'nova';
  if (idade <= f.recente_ate) return 'recente';
  if (idade <= f.parada_ate) return 'parada';

  if (vaga.prazo) {
    const p = new Date(vaga.prazo);
    if (!Number.isNaN(p.getTime()) && p > agora) return 'recente';
  }
  return 'zumbi';
}

/** Parcela de frescor do score deterministico (0 a 5). */
export function pontosFrescor(vaga, agora = new Date()) {
  const idade = idadeEmDias(vaga, agora);
  if (idade === null) return 1;
  if (idade <= 3) return 5;
  if (idade <= 7) return 4;
  if (idade <= 14) return 2;
  if (idade <= 30) return 1;
  return 0;
}

export const ROTULO = {
  nova: '🆕 Nova',
  recente: 'Recente',
  parada: '⏳ Parada',
  zumbi: '☠️ Zumbi',
  desconhecida: 'Sem data',
};
