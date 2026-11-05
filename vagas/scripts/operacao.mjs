#!/usr/bin/env node
import { operar } from '../src/operacao.js';

const argv = process.argv.slice(2);
const acao = argv.shift();
function opcao(nome) {
  const indice = argv.indexOf(nome);
  if (indice < 0) return null;
  const valor = argv[indice + 1];
  if (!valor || valor.startsWith('--')) throw new Error(`ARGUMENTO_AUSENTE: ${nome}`);
  argv.splice(indice, 2);
  return valor;
}

try {
  if (!acao) throw new Error('USO: node scripts/operacao.mjs <diagnostico|manutencao_guard|status|planejar|iniciar|retomar|conceder|revogar|reservar|fixar_fontes|entregar|revisar|pronta|bloquear|retomar_tarefa|intencao|confirmar|reconciliar|encerrar|validar> --dados <diretorio> --json <objeto>');
  const dados = opcao('--dados') || process.env.VAGAS_DIR_DADOS;
  if (!dados) throw new Error('DADOS_OBRIGATORIOS: informe --dados ou VAGAS_DIR_DADOS');
  const json = opcao('--json');
  if (argv.length) throw new Error(`ARGUMENTO_DESCONHECIDO: ${argv.join(' ')}`);
  let args = {};
  if (json) {
    try { args = JSON.parse(json); } catch { throw new Error('JSON_ARGUMENTO_INVALIDO'); }
    if (!args || Array.isArray(args) || typeof args !== 'object') throw new Error('JSON_ARGUMENTO_INVALIDO');
  }
  const resultado = await operar(dados, acao, args);
  process.stdout.write(`${JSON.stringify({ ok: true, resultado })}\n`);
} catch (erro) {
  process.stderr.write(`${JSON.stringify({ ok: false, erro: erro.message })}\n`);
  process.exitCode = 1;
}
