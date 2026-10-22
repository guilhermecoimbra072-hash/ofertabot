# Primeiro teste do OfertaBot

**Painel publicado:** https://ofertabot-central.lovable.app — backend e armazenamento privado implantados no Lovable Cloud. O primeiro cadastro válido e o teste com seu WhatsApp ainda precisam ser feitos por você. Veja [docs/ENTREGA.md](docs/ENTREGA.md).

Use uma conta e grupos sob seu controle, com participantes que esperem receber esse teste. Nenhum WhatsApp foi vinculado pelo desenvolvimento.

## 1. Abrir o painel

Abra **https://ofertabot-central.lovable.app** no notebook ou no celular. Esse é o painel publicado; não precisa abrir o editor Lovable nem executar o frontend no notebook.

Para editar o projeto, use https://lovable.dev/projects/6b91e5a7-7773-40fe-95df-8db9622278c5. O preview do editor não é a URL do motor.

## 2. Criar sua conta e empresa

Clique em **Criar minha conta**, use seu e-mail e uma senha de pelo menos 6 caracteres. Se receber confirmação por e-mail, confirme antes de entrar. Use **Esqueci a senha** para recuperação. Após entrar, informe nome da loja e fuso horário (por exemplo, `America/Sao_Paulo`).

O backend do site publicado já está configurado. Não é necessário criar outro Supabase. Cadastro válido, confirmação por e-mail e recuperação aguardam seu primeiro teste; a publicação já rejeitou um login inexistente corretamente. Se o e-mail não chegar, confira spam e as configurações de Auth no Lovable Cloud. Não informe sua senha ou token no chat.

## 3. Instalar no notebook

Instale Node.js 24 LTS pelo site oficial https://nodejs.org. Baixe e extraia **ofertabot-motor.zip** para uma pasta só deste projeto. Esse pacote contém apenas o motor e seu lockfile. Abra o terminal nessa pasta.

Windows PowerShell:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run setup
notepad .env
```

macOS Terminal:

```sh
npm ci
npm run build
npm run setup
open -e .env
```

Há também `scripts/instalar-windows.ps1` e `scripts/instalar-macos.sh`. Eles instalam, compilam e criam o `.env`; não vinculam WhatsApp. Se o PowerShell bloquear scripts npm, use `npm.cmd` como acima, sem alterar a política global do computador.

## 4. Conectar o motor à empresa

No painel, abra **Motor e IA → Emitir credencial do motor**. Copie a credencial exibida uma única vez. No arquivo `.env` local:

- `ENGINE_URL`: o instalador já preenche `https://ofertabot-central.lovable.app/api/public/engine-api` a partir de `deployment.json`. Confira com o painel.
- `ENGINE_TOKEN`: cole a credencial.
- `ENGINE_SESSION_KEY`: mantenha a chave aleatória criada por `npm run setup`.
- `ENGINE_TRANSPORT=baileys`: selecione explicitamente o transporte real.
- `ENGINE_EXPECTED_PHONE`: informe o número que você vai vincular, com DDI e somente dígitos. O arquivo privado `ofertabot-configuracao-teste.txt` entregue separadamente contém a linha para a conta que você escolheu. O motor bloqueia a operação se outra conta for vinculada. Esse campo não é um destinatário nem conecta a conta sozinho.

Salve o arquivo. Não publique `.env` nem `.engine-data`. Execute:

```sh
npm run engine
```

No Windows pode usar `npm.cmd run engine`. Mantenha esse terminal aberto e evite que o notebook entre em suspensão. A tela deve mostrar motor online em alguns segundos. **A vinculação ainda não ocorreu.**

## 5. Vincular o WhatsApp

Abra **WhatsApp → Mostrar QR Code privado**. No celular, WhatsApp → Aparelhos conectados → Conectar aparelho. Leia o QR. Espere o estado Conectado. Não compartilhe esse QR. Se ele vencer, o motor envia outro; se as tentativas de reconexão se esgotarem, reinicie o motor.

Se o WhatsApp tiver encerrado a sessão, pare o motor e siga a reinicialização de sessão em `docs/OPERACAO.md`; não apague arquivos indiscriminadamente.

## 6. Escolher origem e destino de teste

Em **Grupos**, aguarde até um minuto pela sincronização. Marque um grupo como **Origem** e outro como **Destino**. Use um grupo de destino controlado por você. Um grupo não pode ser origem e destino ao mesmo tempo.

Em **Motor e IA**, habilite explicitamente os envios e salve. Isso não envia nada por si só: permite executar publicações aprovadas que você criar. A automação por captura continua desligada.

## 7. Capturar, editar, aprovar e publicar

1. Peça a outro participante da origem que envie uma mensagem com texto e uma foto. Mensagens da própria conta conectada são ignoradas para impedir ciclos.
2. Abra **Caixa de entrada**. O original permanece preservado.
3. Abra a oferta. Edite texto e preço, escolhendo a moeda. BRL/USD/EUR usam vírgula decimal; PYG não tem casas decimais.
4. Em **Minha marca**, você pode salvar logo, telefone, Instagram, CTA e marca d’água.
5. No editor de imagem, arraste sobre a região do preço, informe a etiqueta e salve a imagem final. OCR apenas sugere regiões: confira sempre. Depois clique em **Salvar alterações** para persistir a oferta.
6. Clique em **Aprovar versão**. Qualquer edição posterior exige nova aprovação.
7. Marque o grupo de teste e clique **Publicar agora**, ou escolha data, hora e fuso para agendar.
8. Veja **Histórico**. Aguarde **Enviada**, que indica confirmação do servidor WhatsApp. Confira a mensagem no grupo; o sistema não promete que todos os integrantes leram.

Publicações da mesma versão no mesmo grupo são deduplicadas, mesmo com cliques repetidos. Não tente contornar essa proteção durante o teste.

## 8. Erros e encerramento

- **Motor offline:** confira terminal, rede, suspensão do notebook e credencial. Após 90 segundos sem heartbeat, o painel considera offline.
- **Agendamento retido:** não será despejado ao reconectar. Libere individualmente para um minuto adiante ou cancele.
- **Resultado incerto:** confira o grupo real. Registre manualmente o resultado e a nota no histórico. Não há reenvio automático.
- **IA indisponível:** continue manualmente. Configurar API externa é opcional e pode consumir créditos próprios.
- **Captura incompleta:** consulte o original no grupo; mídia acima de 10 MB ou falha de download não é apresentada como pronta.
- Para pausar, desabilite os envios no painel. Para parar o motor, pressione **Ctrl+C** no terminal. A sessão é preservada criptografada.
- Para desautorizar um notebook, revogue a credencial no painel e remova o aparelho em WhatsApp → Aparelhos conectados. Um envio que já começou pode ter sido aceito; confira o histórico.

Não execute duas instâncias para a mesma credencial. Para migrar de notebook para VPS, pare a antiga, preserve o cofre e aguarde a lease de 90 segundos; consulte `docs/OPERACAO.md`.

## Código para desenvolvimento

`ofertabot-entrega.zip` inclui painel React/Vite portável, motor, regras SQL, testes, Docker e documentação. `ofertabot-lovable.zip` é uma exportação separada do projeto TanStack no Lovable, com seu lockfile Bun; as adaptações da plataforma não são uma cópia literal do painel Vite. Use o site publicado no primeiro teste. O frontend local exige variáveis públicas do mesmo backend, conforme `docs/IMPLANTACAO.md`. Nunca aplique ambas as migrações iniciais sobre o banco existente.
