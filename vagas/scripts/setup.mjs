// Setup de maquina nova. Objetivo: `git pull && npm run setup` e nada mais.
// Nao instala dependencia Node porque nao ha nenhuma: fetch e nativo e o cache e JSON.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ, DIR_DADOS, perfil } from '../src/config.js';

console.log('\nCaca-vagas — setup\n' + '='.repeat(52) + '\n');

const maior = Number(process.versions.node.split('.')[0]);
if (maior < 20) {
  console.error(`Node v${process.versions.node} e antigo. Precisa de 20+ pelo fetch nativo.`);
  process.exit(1);
}
console.log(`Node v${process.versions.node} ok`);

mkdirSync(DIR_DADOS, { recursive: true });
console.log(`data/ criado em ${DIR_DADOS}`);

// Dependencias Python: usadas pelo generate_resume.py do adapt-resume (PDF) e pelo DOCX.
// Nao estavam instaladas nesta maquina em 2026-07-29.
function temPy(mod) {
  return spawnSync('python3', ['-c', `import ${mod}`], { stdio: 'ignore' }).status === 0;
}

for (const [mod, pacote] of [['reportlab', 'reportlab'], ['docx', 'python-docx']]) {
  if (temPy(mod)) {
    console.log(`${pacote} ja instalado`);
    continue;
  }
  console.log(`instalando ${pacote}...`);
  const r = spawnSync('pip3', ['install', '--user', '--quiet', pacote], { stdio: 'inherit' });
  if (r.status !== 0 || !temPy(mod)) {
    console.log(`  nao consegui instalar ${pacote} automaticamente. Rode a mao:`);
    console.log(`    pip3 install --user ${pacote}`);
  } else {
    console.log(`  ${pacote} ok`);
  }
}

console.log('\nrodando doctor...\n');
try {
  execFileSync(process.execPath, [join(RAIZ, 'scripts', 'doctor.mjs')], { stdio: 'inherit' });
} catch {
  process.exit(1);
}

// Primeiro uso: o perfil ainda e o de exemplo, entao o formulario de onboarding
// abre sozinho no navegador. Quem ja configurou nao ve isto.
if (perfil._configurado !== true && !process.argv.includes('--sem-navegador')) {
  console.log('\nPerfil ainda nao configurado: abrindo o formulario de onboarding no navegador...\n');
  execFileSync(process.execPath, [join(RAIZ, 'scripts', 'onboarding.mjs'), '--abrir'], { stdio: 'inherit' });
}
