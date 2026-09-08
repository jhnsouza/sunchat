# SunChat — pacote de alterações

## 1. Tela inicial (sol)
- Recriar a cápsula do sol idêntica à referência: fundo azul em camadas de papel, nuvens brancas sobrepostas, sol amarelo fosco com sombra suave, moldura branca com relevo.
- Remover a frase "Arraste o sol".
- Ao arrastar o sol para a direita: céu vira noite estrelada (azul profundo + estrelas) e aparece o nome "SunChat".
- Trava opcional de 4 dígitos: quando ativada no perfil, o teclado de 4 números aparece acima da cápsula do sol e o arraste só libera após a senha correta.

## 2. Identidade visual
- Usar a nuvem amarela/azul enviada como logo e ícone do app (favicon).
- Refinar todo o app no estilo "Glass Feed": vidro fosco, gradientes fluidos, bordas finas luminosas, tipografia clara.

## 3. Login / registro
- Reconstruir a tela no estilo neumórfico da referência: campos em pílula com relevo interno, botão principal em pílula escura, cartão claro com sombra dupla.
- Um número de telefone por conta (bloqueio de duplicidade no cadastro e no perfil).

## 4. Contatos
- Novo campo "Adicionar pessoa" por @ ou telefone.
- A busca passa a mostrar apenas pessoas já adicionadas; encontrar alguém novo só pelo campo de adicionar.

## 5. Conversa
- Nova barra de escrita igual à referência: campo em cima, linha divisória, ícones de câmera, foto e arquivo à esquerda, botão de enviar em azul claro arredondado à direita.
- Corrigir o erro de tipo na tela de conversa (variável sem tipo) que impede o app de abrir.

## 6. Notificações
- Contador de mensagens não lidas por conversa.
- Som ao receber mensagem.
- Chave no perfil para silenciar o som.

## 7. Mensagens temporárias
- Botão no perfil para ativar mensagens efêmeras.
- Com a opção ligada, cada mensagem enviada ou recebida é apagada 10 segundos após ser lida.

## 8. Banco de dados
- `contacts` (dono, contato) com leitura/escrita apenas do próprio dono.
- `messages`: marcação de lida e prazo de expiração; limpeza automática dos expirados.
- `profiles`: telefone único, preferências de som, mensagens efêmeras e senha de 4 dígitos (guardada com hash).

## 9. Teste final
- Abrir o app e testar entrada pelo sol, cadastro/login, adicionar pessoa, conversa, envio de imagem e arquivo, som e não lidas.
