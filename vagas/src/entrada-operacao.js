// Entradas com rede ou múltiplas gravações adquirem posse antes do primeiro
// efeito. Não há takeover por tempo; outro run ativo exige reconciliação.
import { DIR_DADOS } from './config.js';
import { operar, comEscritaCentral } from './operacao.js';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hoje } from './util.js';

export function entrarEscritor(nome) {
  const dia = hoje();
  const diaBackup = new Date().toISOString().slice(0, 10);
  const entradas = {
    coleta: ['cota-apify.json', 'vagas.json', 'quadro.json', `backups/quadro-${diaBackup}.json`, 'semantico.json', `rodada-${dia}.json`],
    apify: ['vagas.json', 'semantico.json', 'cota-apify.json'],
    enriquecer: ['vagas.json'],
    contador: ['candidaturas.json'],
    instrucoes: [],
  };
  if (!Object.hasOwn(entradas, nome)) throw new Error('Entrada de escrita desconhecida. Declare os arquivos permitidos.');
  const arquivos = entradas[nome].map(n => join(DIR_DADOS, n));
  let recebido = null;
  if (process.env.VAGAS_OPERACAO_TOKEN) recebido = JSON.parse(process.env.VAGAS_OPERACAO_TOKEN);
  // Um filho já concedido não ganha capacidade de administrador por invocar
  // uma entrada. Valida os caminhos exatos antes de qualquer rede.
  if (recebido?.tipo === 'filho') {
    comEscritaCentral(DIR_DADOS, () => {}, arquivos);
    return;
  }
  const propria = !recebido;
  const token = recebido || operar(DIR_DADOS, 'iniciar', { dono: `${nome}:${process.pid}` }).token;
  let filho;
  process.once('exit', () => {
    try {
      if (filho) operar(DIR_DADOS, 'revogar', { token, concessao: filho.concessao });
      if (propria) operar(DIR_DADOS, 'encerrar', { token });
    }
    catch { /* Uma posse revogada não pode encerrar o dono novo. */ }
  });
  if (arquivos.length) {
    filho = operar(DIR_DADOS, 'conceder', {
      token, donoFilho: `${nome}:filho:${process.pid}`, arquivos,
      janela: randomUUID(), etapa: nome,
    }).token;
    process.env.VAGAS_OPERACAO_TOKEN = JSON.stringify(filho);
  } else {
    process.env.VAGAS_OPERACAO_TOKEN = JSON.stringify(token);
    comEscritaCentral(DIR_DADOS, () => {});
    delete process.env.VAGAS_OPERACAO_TOKEN;
  }
}
