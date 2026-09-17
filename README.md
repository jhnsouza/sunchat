# SunChat

Crie um aplicativo de mensagens minimalista, rápido, responsivo e mobile-first, com apenas 3 telas principais.

1. HOME
Tela extremamente limpa, fundo branco/cinza muito claro com efeito glassmorphism.
No centro existe um botão grande em formato de cápsula mostrando um céu azul com nuvens e um sol amarelo, seguindo fielmente a referência enviada.
O usuário deve ARRASTAR o sol da esquerda para a direita dentro da cápsula. Ao completar o movimento, abrir a tela de CHAT.
Não colocar menus ou outras funções na Home.

2. CHAT
Interface inspirada fielmente na segunda imagem enviada: fundo claro, painéis translúcidos, sombras suaves, bordas arredondadas e efeito de vidro 3D/glossy.
Mensagens em balões grandes e arredondados:
- mensagens enviadas: azul com leve efeito de profundidade;
- mensagens recebidas: branco/cinza translúcido com sombra e efeito de vidro.
No topo mostrar foto, nome/@ do contato e status online.
Adicionar campo de mensagem, botão enviar e botão para enviar imagem/arquivo.
Adicionar pesquisa de contato por número de telefone ou @username.
A busca deve permitir iniciar uma conversa diretamente.

3. PERFIL / LOGIN
O perfil só aparece quando o usuário tocar na foto/perfil dentro do Chat.
Permitir LOGIN ou REGISTRO usando número de telefone ou @username e senha.
Depois de autenticado, salvar a sessão.
Quando o usuário abrir o aplicativo novamente, mostrar diretamente a HOME com o botão do sol, sem exigir login novamente.
Dentro do perfil permitir apenas informações básicas e sair da conta.

FUNCIONALIDADES
- cadastro e login;
- adicionar/pesquisar usuário por número de telefone ou @;
- enviar e receber mensagens em tempo real;
- enviar imagens e arquivos;
- foto de perfil;
- status online;
- sessão persistente;
- interface leve e rápida.

DESIGN
Seguir o estilo visual das imagens de referência: minimalismo, glassmorphism, 3D suave, transparência, blur, sombras difusas, bordas arredondadas e aparência premium.
Não adicionar feed, stories, grupos, chamadas, pagamentos ou funções desnecessárias.
Priorizar velocidade, simplicidade e responsividade.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://sunchat.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/030f9a81-3d15-4906-9139-5bed0f72c793).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
