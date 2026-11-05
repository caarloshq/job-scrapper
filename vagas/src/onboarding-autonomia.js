// Preferências locais do onboarding. O agendamento pertence ao assistente,
// fora deste processo; este arquivo nunca cria tarefas nem chama a Apify.
import { join } from 'node:path';
import { lerEstado, salvarEstado } from './estado-central.js';

export const POLITICA_PADRAO = Object.freeze({
  ativa: false,
  intervaloHoras: 4,
  apifyMaximoPorDia: 1,
  modoCandidatura: 'mapear',
});

export function normalizarEscolhas(dados = {}) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new Error('Escolhas inválidas.');
  if (!['local', 'notion'].includes(dados.fonteEstado)) throw new Error('Escolha quadro local ou Notion.');
  const databaseId = String(dados.databaseId ?? '').trim();
  if (dados.fonteEstado === 'notion' && !(/^[0-9a-f]{32}$/i.test(databaseId) || /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(databaseId))) {
    throw new Error('Informe o ID de 32 caracteres da database do Notion. Não cole token.');
  }
  if (!['mapear', 'chrome_assistido'].includes(dados.modoCandidatura)) throw new Error('Escolha mapear ou configurar candidatura assistida no Chrome.');
  if (typeof dados.autonomia !== 'boolean') throw new Error('Escolha se quer a rodada automática.');
  return {
    fonteEstado: dados.fonteEstado,
    databaseId: dados.fonteEstado === 'notion' ? databaseId.replaceAll('-', '') : null,
    politica: { ativa: dados.autonomia, intervaloHoras: 4, apifyMaximoPorDia: 1, modoCandidatura: dados.modoCandidatura },
  };
}

export function lerPolitica(dirDados) {
  const p = lerEstado(join(dirDados, 'politica-autonomia.json'), POLITICA_PADRAO);
  if (typeof p.ativa !== 'boolean' || p.intervaloHoras !== 4 || p.apifyMaximoPorDia !== 1 ||
      !['mapear', 'chrome_assistido'].includes(p.modoCandidatura)) throw new Error('POLITICA_AUTONOMIA_INVALIDA');
  return p;
}

export function salvarPolitica(dirDados, politica) {
  const atual = lerPolitica(dirDados);
  Object.assign(atual, politica);
  salvarEstado(join(dirDados, 'politica-autonomia.json'), atual, dirDados);
  return atual;
}

export function instrucaoOnboarding({ fonteEstado, databaseId, politica }) {
  const fonte = fonteEstado === 'notion'
    ? `Escolhi Notion como fonte de estado, database ID ${databaseId}. Configure sua própria conexão Notion; não peça token ou credencial no chat. Consulte a database inteira antes de confiar em status e preserve o quadro local.`
    : 'Escolhi o quadro local como fonte de estado.';
  const candidatura = politica.modoCandidatura === 'chrome_assistido'
    ? 'Quero configurar candidaturas assistidas no Chrome depois de revisar o perfil, as respostas e cada autorização necessária. Esta escolha não autoriza preenchimento ou envio irrestrito.'
    : 'Quero apenas mapear e avaliar vagas; não preencha nem envie candidaturas.';
  const autonomia = politica.ativa
    ? 'Depois de concluir o onboarding, crie no agendador nativo do assistente uma tarefa recorrente a cada 4 horas. Use vagas/RODADA-DIARIA.md como única fonte do processo. Respeite no máximo uma execução da Apify por dia, mesmo com quatro ou mais rodadas. Mostre no chat a tarefa criada e seu próximo horário. Se o agendador não estiver disponível, entregue o prompt pronto no chat e informe que a tarefa ainda não foi criada. Ela depende de o computador e as conexões estarem disponíveis; não prometa execução com o computador desligado.'
    : 'Não crie tarefa recorrente; farei as rodadas manualmente.';
  return [
    'Quero concluir o onboarding do JobRelay. Leia AGENTS.md, ONBOARDING.md e rode `cd vagas && npm run onboarding`; não repergunte blocos marcados ok.',
    'Use Skills/adapt-resume/materiais-fonte/ para montar meu currículo base. Entreviste antes de escrever fatos e deixe o currículo para minha conferência. Ajuste vagas/config/palavras-chave.json à minha profissão. Depois rode `npm run onboarding -- --concluir`.',
    fonte,
    candidatura,
    autonomia,
    'Configure as conexões necessárias na sua própria conta ou ferramenta. Nunca peça credenciais em chat. Não inicie candidatura antes de concluir as confirmações do perfil.',
  ].join('\n\n');
}
