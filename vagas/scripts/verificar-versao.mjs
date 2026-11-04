// Execução consultiva: não altera o repositório e não bloqueia o primeiro uso.
import { fileURLToPath } from 'node:url';
import { verificarVersaoGit, formatarVersaoGit } from '../src/versao-git.js';

const cwd = fileURLToPath(new URL('..', import.meta.url));
console.log(formatarVersaoGit(await verificarVersaoGit({ cwd })));
