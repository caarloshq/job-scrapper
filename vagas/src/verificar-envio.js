// Verificação local antes de qualquer interação de candidatura. O retorno não
// arbitra navegador nem substitui a conferência do anúncio e do formulário.
import { join } from 'node:path';
import { RAIZ, DIR_DADOS } from './config.js';
import { lerJsonSeguro } from './persistencia.js';
import * as cache from './cache.js';
import { configuracao, carregarFonte } from './fonte-estado.js';
import { hidratar } from './hidratar.js';
import { validarEnvio } from './operacao.js';
import { lerPolitica } from './onboarding-autonomia.js';

export function avaliarPrecondicoes({ vaga, card, autorizado, transmissao, fonte = 'local', sincronizadoEm = null, agora = new Date(), modoCandidatura = 'chrome_assistido' }) {
  const motivos = [];
  if (modoCandidatura !== 'chrome_assistido') motivos.push('modo somente mapeamento: candidatura desativada');
  if (autorizado !== true) motivos.push('opt-in de candidatura desligado');
  if (!vaga) motivos.push('vaga ausente ou barrada pela regra atual');
  if (!card || card.status !== 'Aplicar') motivos.push('vaga não está em Aplicar na fonte de estado');
  if (fonte === 'notion') {
    const idade = new Date(agora).getTime() - Date.parse(sincronizadoEm);
    if (!Number.isFinite(idade) || idade < 0 || idade > 5 * 60 * 1000) {
      motivos.push('snapshot Notion sem consulta recente; agente deve conferir Status e Gaps na database');
    }
    if (typeof card?.gaps !== 'string') motivos.push('Gaps do Notion não consultados pelo agente');
    if (vaga?.statusNotion && card?.status !== vaga.statusNotion) motivos.push('status mudou durante a verificação; consulte novamente');
  }
  if (vaga && !vaga.lida) motivos.push('anúncio ainda não foi lido contra o currículo');
  if (vaga?.julgamentoDesatualizado) motivos.push('anúncio mudou: releitura necessária');
  if (vaga?.conflitoIdentidade) motivos.push('identidade ambígua: conferir a requisição oficial');
  if (transmissao !== true) motivos.push('controle de transmissão não liberado');
  return { precondicoesAtendidas: motivos.length === 0, liberadoClique: false, motivos };
}

export function verificarEnvio(idExterno, { agora = new Date() } = {}) {
  if (typeof idExterno !== 'string' || !idExterno.trim()) throw new Error('ID_OBRIGATORIO');
  const id = idExterno.trim();
  const perfil = lerJsonSeguro(join(RAIZ, 'config', 'perfil-candidatura.json'));
  const fonte = configuracao();
  const estado = carregarFonte();
  const card = estado.vagas[id];
  const vaga = hidratar(Object.values(cache.carregar().vagas)).ativas.find(v => v.idExterno === id);
  let transmissao = false;
  try { validarEnvio(DIR_DADOS, vaga?.idCanonico || id); transmissao = true; }
  catch { /* ausência, envio incerto ou confirmado mantêm o bloqueio */ }
  return { idExterno: id, ...avaliarPrecondicoes({ vaga, card, autorizado: perfil.autorizado,
    transmissao, fonte: fonte.fonte, sincronizadoEm: estado.sincronizadoEm, agora, modoCandidatura: lerPolitica(DIR_DADOS).modoCandidatura }) };
}
