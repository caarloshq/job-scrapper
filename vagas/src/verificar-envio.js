// Verificação local antes de qualquer interação de candidatura. O retorno não
// arbitra navegador nem substitui a conferência do anúncio e do formulário.
import { join } from 'node:path';
import { RAIZ, DIR_DADOS } from './config.js';
import { lerJsonSeguro } from './persistencia.js';
import * as cache from './cache.js';
import * as quadro from './quadro.js';
import { hidratar } from './hidratar.js';
import { validarEnvio } from './operacao.js';

export function avaliarPrecondicoes({ vaga, card, autorizado, transmissao }) {
  const motivos = [];
  if (autorizado !== true) motivos.push('opt-in de candidatura desligado');
  if (!vaga) motivos.push('vaga ausente ou barrada pela regra atual');
  if (!card || card.status !== 'Aplicar') motivos.push('vaga não está em Aplicar no quadro');
  if (vaga && !vaga.lida) motivos.push('anúncio ainda não foi lido contra o currículo');
  if (vaga?.julgamentoDesatualizado) motivos.push('anúncio mudou: releitura necessária');
  if (vaga?.conflitoIdentidade) motivos.push('identidade ambígua: conferir a requisição oficial');
  if (transmissao !== true) motivos.push('controle de transmissão não liberado');
  return { precondicoesAtendidas: motivos.length === 0, liberadoClique: false, motivos };
}

export function verificarEnvio(idExterno) {
  if (typeof idExterno !== 'string' || !idExterno.trim()) throw new Error('ID_OBRIGATORIO');
  const id = idExterno.trim();
  const perfil = lerJsonSeguro(join(RAIZ, 'config', 'perfil-candidatura.json'));
  const card = quadro.carregar().vagas[id];
  const vaga = hidratar(Object.values(cache.carregar().vagas)).ativas.find(v => v.idExterno === id);
  let transmissao = false;
  try { validarEnvio(DIR_DADOS, vaga?.idCanonico || id); transmissao = true; }
  catch { /* ausência, envio incerto ou confirmado mantêm o bloqueio */ }
  return { idExterno: id, ...avaliarPrecondicoes({ vaga, card, autorizado: perfil.autorizado, transmissao }) };
}
