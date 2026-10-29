# Steam Atlas — NestJS

API REST em NestJS + TypeScript com interface responsiva em português, servida pelo próprio NestJS. Consulta perfis e organiza os três últimos jogos exibidos na atividade pública, com miniatura à esquerda, conquistas à direita e capturas do próprio jogo abaixo. Não exige banco de dados nem login do visitante.

## Executar

Requisito: Node.js 22 ou superior e npm.

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

Sem a chave, perfil, atividade recente, resumo público das conquistas e capturas continuam disponíveis. A lista completa de conquistas e a biblioteca via API exigem a chave. Não há dados fictícios ou modo de demonstração substituindo as respostas reais.

Para executar a versão compilada:

```powershell
npm run build
npm start
```

Para encerrar um servidor iniciado no terminal, use Ctrl+C. Se a porta estiver ocupada, encerre a instância anterior ou altere `PORT` no `.env`. `HOST=127.0.0.1` restringe o acesso ao computador local.

## Usar

1. Digite o nome do jogador (por exemplo, `GhostTl` ou `GhostTl鬼`) e escolha um dos perfis encontrados. Nomes podem se repetir: confira o avatar e o identificador. A lista possui paginação de até 100 páginas. Ao digitar um SteamID64 de 17 dígitos, a consulta abre diretamente; links de perfil continuam aceitos. O botão de exemplo pesquisa `GhostTl`.
2. A consulta mostra até três jogos, preservando a ordem exibida na atividade recente da Steam, sem ordenar por horas jogadas e sem filtrar apenas as últimas duas semanas. Aplicativos que a Steam inclui nessa atividade também aparecem.
3. Cada bloco traz a miniatura do jogo à esquerda e o progresso e os ícones de conquistas à direita. A faixa abaixo contém exclusivamente as capturas públicas daquele AppID, com navegação independente por jogo.
4. Sem chave, os ícones são uma prévia (não a lista completa) publicada no perfil; o progresso é o total informado pela Steam. Há um link para consultar as conquistas na Steam.
5. Com chave, o bloco é atualizado automaticamente com conquistas completas e datas, acessíveis em “Ver todas”. Uma falha na API preserva o resumo público. Falhas em capturas não impedem os demais jogos de aparecer.

Qualquer perfil pode ser consultado pelo identificador; só os dados publicados pela Steam ficam disponíveis. Perfil público não implica detalhes de jogos públicos. Uma biblioteca vazia, dados privados e falha da Steam são apresentados como situações diferentes quando o serviço permite distingui-las.

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
| GET | `/api/profiles/:steamId/screenshots?page=1&appId=230410` | Capturas por jogo (AppID opcional), página atual, aviso e `hasNext` |
| GET | `/api/profiles/:steamId/games` | Biblioteca pública com AppID, nome e horas |
| GET | `/api/profiles/:steamId/achievements/:appId` | Conquistas e progresso de um jogo |

Erros seguem o formato NestJS `{ "message": "...", "error": "...", "statusCode": 400 }`. Códigos relevantes: 400 entrada inválida, 403 acesso negado/privacidade, 404 perfil não encontrado, 422 conquistas indisponíveis, 429 limite de consultas, 502 falha na Steam e 503 chave ausente.

## Fontes e limites

- Perfil: XML público da Steam Community (`?xml=1`).
- Busca por nome: pesquisa pública Steam Community, com sessão anônima criada pelo servidor, sem autenticação do visitante. Aceita espaços e Unicode (2 a 64 caracteres). Os resultados e sua ordem dependem do índice da Steam e podem corresponder a aliases; nomes não são únicos. A busca depende do HTML da comunidade e pode ficar indisponível independentemente da consulta por SteamID64. A resolução direta por identificador personalizado continua disponível na API.
- Atividade recente: HTML público do perfil (`.recent_game`), incluindo progresso e ícones publicados. O resumo retorna `partial: true`; ausência de resumo retorna totais nulos, não zero. Perfis com menos de três jogos públicos mostram somente os disponíveis. Mudanças no HTML podem exigir atualizar `parseRecentGames`.
- Capturas: HTML público da página `/screenshots/`, interpretado com Cheerio; esta integração depende da estrutura da página, não é uma API oficial estável de screenshots. Apenas capturas compartilhadas, nunca arquivos locais ou privados. Uma alteração no HTML pode exigir atualizar `parseScreenshots`.
- Biblioteca: `IPlayerService/GetOwnedGames/v1`.
- Conquistas: `ISteamUserStats/GetPlayerAchievements/v1`, complementado por `GetSchemaForGame/v2`. Tradução brasileira é solicitada, mas depende de cada jogo.
- A ausência de capturas não permite sempre distinguir perfil privado de galeria vazia; a interface deixa essa limitação explícita.
- Cache em memória por 2 minutos, limitado a 300 entradas; dados podem refletir esse atraso. Limite de 60 requisições por minuto por IP no processo atual; timeout de 12 segundos por chamada Steam. Para múltiplas instâncias, substitua cache/limitação por armazenamento compartilhado.
- A chave é lida apenas no servidor; URLs externas são construídas em hosts fixos. HTML externo nunca é inserido na interface. Não há rota de proxy arbitrário.

Documentação oficial: [NestJS](https://docs.nestjs.com/), [biblioteca](https://partner.steamgames.com/doc/webapi/IPlayerService), [conquistas](https://partner.steamgames.com/doc/webapi/ISteamUserStats).

## Testar e continuar

```powershell
npm test
```

Os testes usam respostas controladas para verificar ordem/limite dos jogos recentes, isolamento de capturas por AppID, entradas maliciosas, parser de capturas, privacidade, chave ausente, combinação de conquistas, falha parcial, limites e cache. Não precisam de uma chave real. Para validar conquistas ao vivo, configure uma chave válida e use um perfil com detalhes de jogos públicos; os testes controlados não substituem essa validação.

- `src/main.ts`: inicialização, proteção HTTP, Swagger e arquivos estáticos.
- `src/app.module.ts`: módulo NestJS, injeção de dependências e limitação de consultas.
- `src/steam.controller.ts`: rotas e validação de parâmetros.
- `src/steam.service.ts`: integrações com a Steam, parser, cache e normalização.
- `public/`: interface HTML/CSS/JavaScript, sem etapa de compilação própria.
- `test/`: testes executados pelo runner nativo do Node.js.

Para continuar: comece pelo serviço para novas fontes de dados, adicione a rota no controller e consuma em `public/app.js`. Preserve o tratamento de privacidade e mantenha a chave fora da interface. Em uma publicação futura, use HTTPS, configuração segura dos segredos e ajuste de proxy/limitação conforme a infraestrutura.
