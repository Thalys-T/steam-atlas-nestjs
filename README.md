# Steam Atlas — NestJS

Aplicação publicada: [steam-atlas-nestjs.vercel.app](https://steam-atlas-nestjs.vercel.app/).

API REST em NestJS + TypeScript com interface responsiva em português. Mostra o jogo com mais horas acumuladas e dois jogos recentes distintos, com miniatura à esquerda, conquistas à direita e capturas do próprio jogo abaixo. Ao lado do perfil, compara as conquistas desbloqueadas em toda a biblioteca pública e apresenta as dez mais raras. Não exige banco de dados nem login do visitante.

## Executar

Requisito: Node.js 24.x e npm.

```powershell
git clone https://github.com/Thalys-T/steam-atlas-nestjs.git
cd steam-atlas-nestjs
npm ci
Copy-Item .env.example .env
```

No Linux/macOS, use `cp .env.example .env`. Se já tiver o projeto no computador, entre na pasta existente e pule o clone. Só copie o exemplo se ainda não tiver um `.env`, para preservar sua configuração.

Edite `.env` e preencha `STEAM_API_KEY` com sua chave obtida em https://steamcommunity.com/dev/apikey. Não compartilhe esse arquivo nem coloque a chave em `public/`. O `.gitignore` já o exclui. Reinicie o servidor após alterar a configuração.

```powershell
npm run start:dev
```

- Interface: http://localhost:3000
- Documentação interativa (Swagger): http://localhost:3000/api/docs
- Saúde e disponibilidade da chave: http://localhost:3000/api/health

Sem a chave, perfil, dois jogos recentes, resumo público das conquistas e capturas continuam disponíveis. O jogo com mais horas, o ranking das conquistas raras e a lista completa de conquistas exigem uma chave válida. A interface informa essa limitação e não inventa dados.

Para executar a versão compilada:

```powershell
npm run build
npm start
```

Para encerrar um servidor iniciado no terminal, use Ctrl+C. Se a porta estiver ocupada, encerre a instância anterior ou altere `PORT` no `.env`. `HOST=127.0.0.1` restringe o acesso ao computador local.

## Usar

1. Digite o nome do jogador (por exemplo, `GhostTl` ou `GhostTl鬼`) e escolha um dos perfis encontrados. Nomes podem se repetir: confira o avatar e o identificador. A lista possui paginação de até 100 páginas. Ao digitar um SteamID64 de 17 dígitos, a consulta abre diretamente; links de perfil continuam aceitos. O botão de exemplo pesquisa `GhostTl`.
2. O primeiro jogo é o de maior `playtime_forever` da biblioteca (minutos acumulados, sem arredondar antes de comparar). Em empate, o menor AppID vem primeiro. Em seguida aparecem os dois jogos mais recentes da atividade pública que sejam diferentes do primeiro, preservando a ordem da Steam. Se houver menos jogos ou dados privados, aparecem apenas os disponíveis, com aviso. Aplicativos incluídos pela Steam também podem aparecer.
3. Cada bloco traz a miniatura do jogo à esquerda e o progresso e os ícones de conquistas à direita. A faixa abaixo contém exclusivamente as capturas públicas daquele AppID, com navegação independente por jogo.
4. Sem chave, os ícones são uma prévia (não a lista completa) publicada no perfil; o progresso é o total informado pela Steam. Há um link para consultar as conquistas na Steam.
5. Com chave, o bloco é atualizado automaticamente com conquistas completas e datas, acessíveis em “Ver todas”. Uma falha na API preserva o resumo público. Falhas em capturas não impedem os demais jogos de aparecer.
6. Ao lado do perfil (abaixo dele no celular), o ranking mostra **somente conquistas desbloqueadas**. A raridade usa o percentual global de jogadores de cada jogo que desbloquearam aquela conquista, em ordem crescente. O painel informa nome, jogo, ícone e percentual, com link para a Steam.
7. A análise percorre todos os jogos retornados pela biblioteca pública, não só os três destaques, em lotes de quatro. É possível pausar/continuar. Até o fim da análise, o ranking é provisório; falhas e percentuais ausentes são listados, sem apresentar um top 10 parcial como definitivo. Se existirem menos de dez conquistas verificadas, mostra somente essas.

Qualquer perfil pode ser consultado pelo identificador; só os dados publicados pela Steam ficam disponíveis. Perfil público não implica detalhes de jogos públicos. Uma biblioteca vazia, dados privados e falha da Steam são apresentados como situações diferentes quando o serviço permite distingui-las.

## Hospedar pelo GitHub para testar no celular

O GitHub Pages hospeda arquivos estáticos e não executa NestJS. O projeto está preparado para importar o repositório na **Vercel**, usando o suporte nativo a NestJS. Interface e API ficam juntas no mesmo endereço HTTPS. O plano **Hobby** atende a projetos pessoais, sem uso comercial, dentro das cotas gratuitas.

[Importar um projeto na Vercel](https://vercel.com/new)

1. Abra o link e entre na sua conta Vercel (ou crie uma conta Hobby).
2. Importe `Thalys-T/steam-atlas-nestjs` do GitHub. Se precisar conectar o GitHub, limite o acesso ao repositório deste projeto.
3. Confira o framework **NestJS**, diretório raiz `./` e Node.js **24.x**. Preserve a saída padrão do framework, sem definir `dist` como site estático. Clique em **Deploy** e aguarde **Ready**. Abra o endereço HTTPS de produção informado pela Vercel no celular; não use `localhost`.
4. Busque `GhostTl` ou um SteamID64. Para instalar, siga as instruções de Android/iPhone abaixo.

O arquivo `vercel.json` seleciona o framework NestJS, que detecta a entrada `src/main.ts`. Os arquivos de `public/` são servidos pela Vercel. Não envie seu `.env`. Adicione `STEAM_API_KEY` nas variáveis de ambiente de produção do projeto e publique novamente para habilitar o jogo mais jogado, as conquistas completas e o ranking de raridade. Nunca salve a chave no GitHub.

O NestJS executa como uma função na Vercel. Cache e limite de consultas em memória pertencem a cada instância, não são persistentes nem compartilhados entre instâncias. Para uso amplo, adote armazenamento compartilhado e revise a identificação de IP atrás do proxy. A primeira consulta pode levar mais tempo para iniciar o servidor, e a disponibilidade das consultas depende de a Steam aceitar as requisições da hospedagem.

Após vincular o repositório, commits na branch de produção podem gerar novas publicações. Confira no painel o plano Hobby e os limites de uso antes de publicar. Documentação: [NestJS na Vercel](https://vercel.com/docs/frameworks/backend/nestjs) e [plano Hobby](https://vercel.com/docs/plans/hobby). Preparar estes arquivos não cria a hospedagem: é necessário concluir a importação na conta e verificar o endereço publicado.

## Android e iPhone

A versão mobile é uma PWA: o mesmo site pode ser adicionado à tela inicial, com ícone próprio e abertura em uma janela de aplicativo. Mantém a API NestJS e a busca por nome ou SteamID64. O layout adapta os controles ao toque e permite deslizar as capturas horizontalmente.

Para instalar em um celular, publique o servidor NestJS em um endereço **HTTPS** e abra esse endereço no aparelho:

- **Android:** no Chrome, toque em **Instalar app** ou use o menu ⋮ → **Instalar aplicativo / Adicionar à tela inicial**.
- **iPhone:** no Safari, toque em **Compartilhar → Adicionar à Tela de Início**. Se disponível, ative **Abrir como App da Web**.

O botão também mostra essas instruções quando o navegador não oferece a instalação automática. A aplicação publicada na Vercel usa HTTPS. A PWA não inclui pacotes nativos APK/IPA ou publicação nas lojas. O endereço `localhost` aberto no celular se refere ao próprio celular, não ao computador. O GitHub armazena o código; GitHub Pages não executa o servidor NestJS.

O service worker guarda apenas os arquivos da interface após uma primeira visita online bem-sucedida. Consultas, conquistas, avatares e capturas da Steam continuam dependendo de internet; as respostas da API não são armazenadas por ele. Sem conexão, a interface exibe um aviso. Em produção, configure `HOST` conforme a plataforma e mantenha a chave Steam nas variáveis do servidor.

## Como o NestJS participa

O NestJS é o framework do servidor, escrito em TypeScript. Ele recebe as consultas do navegador, organiza o código em módulos, controllers e services e devolve os resultados em JSON. A interface em HTML, CSS e JavaScript também é servida pelo mesmo servidor.

1. `main.ts` inicia a aplicação NestJS, configura os arquivos da interface e disponibiliza a documentação Swagger.
2. `AppModule` registra o controller e o serviço, além do limite de requisições.
3. `SteamController` declara as rotas com decorators como `@Controller()` e `@Get()`, valida os parâmetros e encaminha a consulta ao serviço.
4. `SteamService`, registrado com `@Injectable()`, consulta a Steam, interpreta as respostas, mantém o cache e trata as falhas. O NestJS cria essa instância e a injeta no controller.
5. O navegador recebe JSON e monta os três blocos de jogos. Cada galeria e consulta de conquistas carrega de forma independente.

O fluxo principal é **navegador → controller → service → Steam → JSON → interface**. A chave Steam fica no servidor. O backend usa o adaptador Express do NestJS; a interface não depende de React ou Angular.

## Rotas da API

| Método | Rota | Resultado |
|---|---|---|
| GET | `/api/health` | Status e indicação de chave configurada (não valida a chave) |
| GET | `/api/profiles/search?name=GhostTl&page=1` | Busca pública por nome, avatar, URL, total e paginação |
| GET | `/api/profiles/resolve?profile=robin` | SteamID64, nome, avatar, visibilidade e link |
| GET | `/api/profiles/:steamId/recent-games` | Até três jogos em ordem de atividade, miniaturas e resumo público de conquistas |
| GET | `/api/profiles/:steamId/featured-games` | Mais jogado + dois recentes distintos, horas, miniaturas, resumos e avisos de dados indisponíveis |
| GET | `/api/profiles/:steamId/rarest-achievements?page=1` | Lote do ranking: `items`, `snapshot`, `processed`, `totalGames`, `nextPage`, `failedGames` |
| GET | `/api/profiles/:steamId/screenshots?page=1&appId=230410` | Capturas por jogo (AppID opcional), página atual, aviso e `hasNext` |
| GET | `/api/profiles/:steamId/games` | Biblioteca pública com AppID, nome e horas |
| GET | `/api/profiles/:steamId/achievements/:appId` | Conquistas e progresso de um jogo |

Erros seguem o formato NestJS `{ "message": "...", "error": "...", "statusCode": 400 }`. Códigos relevantes: 400 entrada inválida, 403 acesso negado/privacidade, 404 perfil não encontrado, 409 biblioteca alterada durante a análise, 422 conquistas indisponíveis, 429 limite de consultas, 502 falha na Steam e 503 chave ausente.

Para consumir o ranking pela API, comece na página 1, encaminhe o `snapshot` nas páginas seguintes e siga `nextPage` até `null`. Combine os itens de **todas** as páginas, remova duplicatas por AppID + ID e retenha os dez menores percentuais (desempate por AppID e ID). Cada resposta contém apenas o top 10 daquele lote. Some os `failedGames`; se houver falhas, o resultado agregado permanece parcial. O token identifica os AppIDs da biblioteca e rejeita páginas de uma biblioteca alterada, sem depender da memória da instância. Ele não congela conquistas/percentuais no tempo.

## Fontes e limites

- Perfil: XML público da Steam Community (`?xml=1`).
- Busca por nome: pesquisa pública Steam Community, com sessão anônima criada pelo servidor, sem autenticação do visitante. Aceita espaços e Unicode (2 a 64 caracteres). Os resultados e sua ordem dependem do índice da Steam e podem corresponder a aliases; nomes não são únicos. A busca depende do HTML da comunidade e pode ficar indisponível independentemente da consulta por SteamID64. A resolução direta por identificador personalizado continua disponível na API.
- Atividade recente: HTML público do perfil (`.recent_game`), incluindo progresso e ícones publicados. O resumo retorna `partial: true`; ausência de resumo retorna totais nulos, não zero. Perfis com menos de três jogos públicos mostram somente os disponíveis. Mudanças no HTML podem exigir atualizar `parseRecentGames`.
- Capturas: HTML público da página `/screenshots/`, interpretado com Cheerio; esta integração depende da estrutura da página, não é uma API oficial estável de screenshots. Apenas capturas compartilhadas, nunca arquivos locais ou privados. Uma alteração no HTML pode exigir atualizar `parseScreenshots`.
- Biblioteca: `IPlayerService/GetOwnedGames/v1`.
- Conquistas: `ISteamUserStats/GetPlayerAchievements/v1`, complementado por `GetSchemaForGame/v2`. Tradução brasileira é solicitada, mas depende de cada jogo.
- Raridade: `ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2`, combinada por identificador da conquista, nunca pelo nome traduzido. Valores ausentes não são convertidos em zero. O escopo é a biblioteca retornada por `GetOwnedGames`, incluindo jogos gratuitos jogados; jogos removidos da conta ou ocultos pela Steam podem não ser enumerados. Não existe nesta integração uma lista garantida de todos os jogos já possuídos na vida da conta.
- Bibliotecas grandes exigem muitas consultas e podem levar minutos. A interface aguarda entre lotes e permite pausar; a Steam ainda pode limitar o acesso. Falhas são explícitas. Não há tarefas persistentes: ao trocar de perfil ou fechar a página, a análise do navegador termina.
- A ausência de capturas não permite sempre distinguir perfil privado de galeria vazia; a interface deixa essa limitação explícita.
- Cache em memória por 2 minutos, limitado a 300 entradas; dados podem refletir esse atraso. Limite de 60 requisições por minuto por IP no processo atual; timeout de 12 segundos por chamada Steam. Para múltiplas instâncias, substitua cache/limitação por armazenamento compartilhado.
- A chave é lida apenas no servidor; URLs externas são construídas em hosts fixos. HTML externo nunca é inserido na interface. Não há rota de proxy arbitrário.

Documentação oficial: [NestJS](https://docs.nestjs.com/), [biblioteca](https://partner.steamgames.com/doc/webapi/IPlayerService), [conquistas](https://partner.steamgames.com/doc/webapi/ISteamUserStats).

## Testar e continuar

```powershell
npm test
```

Os testes usam respostas controladas para verificar seleção por minutos, exclusão de duplicatas, ranking além dos jogos destacados, ordem e empates de raridade, conquistas bloqueadas, percentuais ausentes/zero, paginação e biblioteca alterada, isolamento de capturas, privacidade, chave ausente, falhas parciais e cache. Não precisam de uma chave real. Para validar conquistas ao vivo, configure uma chave válida e use um perfil com detalhes de jogos públicos; os testes controlados não substituem essa validação.

- `src/main.ts`: inicialização, proteção HTTP, Swagger e arquivos estáticos.
- `src/app.module.ts`: módulo NestJS, injeção de dependências e limitação de consultas.
- `src/steam.controller.ts`: rotas e validação de parâmetros.
- `src/steam.service.ts`: integrações com a Steam, parser, cache e normalização.
- `public/`: interface HTML/CSS/JavaScript, sem etapa de compilação própria.
- `public/mobile.js`, `manifest.webmanifest` e `sw.js`: instalação, identidade e cache da interface mobile. Ao alterar os arquivos da interface em uma publicação, atualize a versão `CACHE_NAME` do service worker.
- `scripts/generate-icons.py`: recria os ícones da PWA com Python 3, sem bibliotecas externas.
- `test/`: testes executados pelo runner nativo do Node.js.

Os testes mobile verificam manifesto, dimensões dos ícones, disponibilidade dos arquivos, fallback offline da interface e exclusão das consultas da API do cache. A validação visual em larguras de celular no navegador não substitui testes de instalação em aparelhos Android e iPhone reais.

Para testar visualmente a análise completa sem uma chave real, compile e execute `node test/ui-server.cjs`. Esse servidor exclusivo de testes usa a porta 3001 e identifica o perfil como **dados simulados**. Ele substitui as respostas externas somente nesse processo; `npm start` continua consultando a Steam real. Encerre com Ctrl+C depois da conferência.

Para continuar: comece pelo serviço para novas fontes de dados, adicione a rota no controller e consuma em `public/app.js`. Preserve o tratamento de privacidade e mantenha a chave fora da interface. Em uma publicação futura, use HTTPS, configuração segura dos segredos e ajuste de proxy/limitação conforme a infraestrutura.
