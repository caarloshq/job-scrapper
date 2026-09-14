---
name: Caça-vagas
description: Sistema visual das superfícies locais do projeto (onboarding e quadro), light mode, acento azul único
colors:
  bg: "#FAFAFA"
  surface: "#FFFFFF"
  surface-2: "#F3F5FB"
  border: "#E5E5E5"
  border-strong: "#C7C7C7"
  text: "#0D0D0D"
  text-2: "#464646"
  text-3: "#707070"
  accent: "#1E3FD1"
  accent-hover: "#1633AB"
  accent-soft: "#CAD6FF"
  accent-deep: "#000766"
  ok: "#0E7A4A"
  ok-soft: "#DCF3E7"
  warn: "#8A5A00"
  warn-soft: "#FFF1CC"
  error: "#B3261E"
  error-soft: "#FBE3E1"
typography:
  fontFamily: "Montserrat, system-ui, -apple-system, 'Segoe UI', sans-serif"
  title:
    fontFamily: "Montserrat, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "24px"
    lineHeight: "32px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Montserrat, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
    lineHeight: "24px"
    fontWeight: 400
  small:
    fontFamily: "Montserrat, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
    lineHeight: "20px"
    fontWeight: 400
  label:
    fontFamily: "Montserrat, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
    lineHeight: "20px"
    fontWeight: 500
  mono:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "14px"
    lineHeight: "20px"
spacing:
  unit: "4px"
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  xxl: "64px"
rounded:
  default: "4px"
  control: "8px"
  card: "16px"
  pill: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    hover: "{colors.accent-hover}"
    rounded: "{rounded.control}"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    border: "{colors.border-strong}"
    rounded: "{rounded.control}"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    border: "{colors.border-strong}"
    focusRing: "{colors.accent}"
    rounded: "{rounded.control}"
    height: "44px"
  tag:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-deep}"
    rounded: "{rounded.pill}"
  step-current:
    textColor: "{colors.accent}"
---

# Design

> Sistema das superfícies locais do Caça-vagas: o formulário de onboarding e o quadro. Escrito em 14 de Setembro de 2026 a partir de duas direções ("light mode" e "botões azuis") e derivado do sistema pessoal do Carlos Henrique (Montserrat, escala neutra de dez degraus, raios por elemento). O azul sai da família que já existia lá como tag (`#CAD6FF` sobre `#000766`), estendida num acento de ação.

## Visual identity

Modo **Operate**: a pessoa está numa tarefa, configurar o sistema uma vez. A interface some no que ela está fazendo. Sóbria, quase monocromática: os neutros fazem a hierarquia, e o azul aparece só onde há ação ou estado (botão primário, passo atual, foco, seleção). Nada de decoração, nada de ilustração, nada de card dentro de card.

## Color

Um acento só, azul `#1E3FD1`, e ele significa "aqui se age": botão primário, anel de foco, passo atual, opção selecionada. Hover escurece pra `#1633AB`. Fundo suave `#CAD6FF` com texto `#000766` pra tag e pra opção marcada; nunca como fundo de seção.

Semânticos existem só pra estado: verde de salvo, âmbar de atenção, vermelho de erro. Cada um com o par de superfície suave. Texto sobre superfície colorida tinge da própria matiz, nunca cinza.

Contrastes medidos: `#1E3FD1` sobre branco 7,8:1 · `#000766` sobre `#CAD6FF` 11,9:1 · `#464646` sobre `#FAFAFA` 9,0:1 · `#707070` sobre `#FAFAFA` 4,7:1 · semânticos sobre a própria superfície suave entre 4,6:1 e 5,3:1.

## Typography

**Montserrat**, uma família só, pesos 400, 500 e 600. Vem do Google Fonts com fallback de sistema declarado: a página roda em `localhost` com internet, e sem ela o sistema cai em `system-ui` sem quebrar a escala.

Escala fixa em px com **três tamanhos só**, simplificada em 14 de Setembro de 2026: 24/32 pra todo título (de página e de passo, sem distinção), 16/24 corpo, 14/20 apoio, rótulo e tag. Mono em 14/20 só pra comando de terminal e caminho de arquivo. Peso faz a hierarquia que o tamanho não faz: 600 título, 500 rótulo e botão, 400 o resto.

Sem caixa alta decorativa, sem kicker acima de título, sem tracking positivo.

## Layout & spacing

Coluna única de leitura, 640px de largura máxima, centrada, com 24px de margem lateral em tela estreita. Passos empilhados: um por vez na tela, com o indicador de progresso no topo. Espaço em múltiplos de 4: 8 entre rótulo e campo, 16 entre campos, 40 entre grupos, 64 acima do título de passo.

Raio por elemento: 4 padrão, 8 controle, 16 card, pílula pra tag.

## Components

- **Botão primário:** azul, texto branco, 44px de altura, raio 8. Hover escurece, foco tem anel de 2px azul afastado 2px, desabilitado a 40% sem mudar cor. Um por tela.
- **Botão secundário:** branco com borda `#C7C7C7`, mesma altura e raio. "Voltar" e "Trocar arquivo".
- **Campo:** 44px, borda `#C7C7C7`, raio 8, foco troca a borda pro azul e ganha anel. Erro troca a borda pro vermelho e ganha mensagem embaixo, nunca só a cor.
- **Opção grande (rádio em card):** borda neutra, selecionada vira borda azul e fundo `#F3F5FB`. Serve a mercado, prioridade e senioridade.
- **Zona de arquivo:** borda tracejada `#C7C7C7`, raio 16, aceita arrastar; arquivo aceito vira linha com nome, tamanho e botão de remover.
- **Tag:** pílula `#CAD6FF` / `#000766` pra "salvo", "presente", "exemplo".
- **Passo:** número e nome, o atual em azul, os feitos com marca, os futuros em `#707070`.
- **Aviso:** superfície semântica suave com texto na matiz, raio 8, sem borda lateral colorida.

## Assets & constraints

Sem logo, sem ilustração. Os únicos assets são os três prints da Apify em `docs/img/apify/`, exibidos no passo do token com legenda. Ícones são do **Lucide** (lucide.dev), embutidos como SVG inline com traço de 1,5px em `currentColor`. Um ícone de 18px por passo, no título, numa caixa de 28px sobre a superfície suave do acento; nos botões, 16 a 18px. **Emoji entra só em opção de escolha** (mercado, nível, remoto ou híbrido), um por opção, como rótulo e não como decoração. Decisão do Carlos, 2026-09-14.

## Motion

Modo Operate: movimento explica estado e dá feedback, nada de coreografia de carga. Um material só, deslizar e desvanecer com `cubic-bezier(0.16, 1, 0.3, 1)`: o passo entra pela direita ao avançar e pela esquerda ao voltar (280ms); a barra de progresso preenche o segmento (300ms); aviso, status "Salvo" e linha de arquivo sobem 6px ao aparecer (220ms); botão e opção afundam 2% ao clicar (120ms); a seta do botão primário anda 2px no hover; a marca de concluído do último passo cresce uma vez (500ms). `prefers-reduced-motion` desliga tudo.

Texto sem travessão. Mês, dia e período com inicial maiúscula.
