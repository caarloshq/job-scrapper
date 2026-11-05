// Controle otimista complementa a exclusão: uma cópia lida antes de outra
// gravação não pode substituir silenciosamente a versão mais nova.
import { dirname } from 'node:path';
import { lerJsonComHash, gravarJsonAtomico } from './persistencia.js';
import { comEscritaCentral } from './operacao.js';

const versoes = new WeakMap();
export function lerEstado(arquivo, inicial) {
  const { dados, hash } = lerJsonComHash(arquivo, inicial);
  if (dados && typeof dados === 'object') versoes.set(dados, { arquivo, hash });
  return dados;
}

export function herdarVersao(origem, destino) {
  if (versoes.has(origem)) versoes.set(destino, { ...versoes.get(origem) });
  return destino;
}

export function copiarEstado(origem) {
  return herdarVersao(origem, structuredClone(origem));
}

export function salvarEstado(arquivo, dados, dirDados = dirname(arquivo), transformar = x => x) {
  return comEscritaCentral(dirDados, () => {
    const versao = versoes.get(dados);
    const atual = lerJsonComHash(arquivo, null).hash;
    if ((!versao && atual !== null) || (versao && (versao.arquivo !== arquivo || versao.hash !== atual))) {
      throw new Error('Conflito de versão: recarregue o estado antes de salvar.');
    }
    gravarJsonAtomico(arquivo, transformar(dados));
    if (dados && typeof dados === 'object') versoes.set(dados, { arquivo, hash: lerJsonComHash(arquivo, null).hash });
    return arquivo;
  }, [arquivo]);
}
