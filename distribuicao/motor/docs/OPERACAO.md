# Operação, saúde, backup e restauração

## Segurança do notebook

`npm run setup` cria uma chave AES-256 de 32 bytes. Sessão e fila do motor usam AES-256-GCM, IV aleatório e autenticação de conteúdo. Arquivos são gravados por substituição atômica, modo 0600; diretório 0700 no macOS/Linux. No Windows, permissões POSIX não substituem ACL: mantenha a pasta em seu perfil e use criptografia do disco (BitLocker/FileVault quando disponível). Não sincronize `.env` e `.engine-data` para pastas públicas.

Se `ENGINE_EXPECTED_PHONE` estiver preenchido, o motor só opera quando o número da conta vinculada corresponde à configuração. Uma identidade não verificável ou diferente mantém a conexão bloqueada (`account_mismatch`), sem captura nem envio; pare o processo e revise a sessão. Não há logout automático nem exclusão de arquivos.

Uma instância por credencial. Ctrl+C preserva a sessão. Se o processo reiniciar enquanto a lease de 90s ainda pertence à instância anterior, ele espera e tenta de novo em vez de encerrar. Lease vencida (por exemplo, notebook suspenso por mais de 90s) também não encerra: o próximo heartbeat a renova. O motor só encerra por credencial quando o backend a recusa de forma contínua por 2 minutos (ou imediatamente para token malformado), para que uma falha momentânea do backend não pare a operação; o painel recebe o estado real (inclusive desconectado) no próximo heartbeat aceito. A reconexão do WhatsApp continua indefinidamente, com atraso de 1s dobrando até o teto de 5s, mais até 1s de jitter. O código 515 (restartRequired, depois do pareamento) reconecta na hora. Um logout no WhatsApp interrompe a reconexão automática e o console explica como gerar outro QR; a sessão não é apagada.

Para vincular novamente após logout: pare o processo, renomeie apenas `.engine-data/session.enc` para um backup local protegido e reinicie. Preserve `inbox.enc`, recibos e a chave AES; sem ela não é possível restaurar a fila. Revogar a credencial no painel exige emitir outra e atualizar `.env`.

## Saúde e logs

`node --env-file=.env scripts/health.mjs` retorna código 0 se houve comunicação nos últimos 90s. `.engine-data/health.json` contém somente horário, estado e quantidade de capturas pendentes. Cada conexão, queda (com código), tentativa de reconexão e resultado de envio sai em uma linha, sem QR, token, texto da oferta ou telefone completo. Credencial rejeitada encerra com `credential_rejected`, sem stack. No painel, Histórico contém auditoria de capturas, revisões, aprovações, agendamentos e tentativas/resultados.

Não execute o motor com log de depuração do Baileys em produção; ele está configurado como silencioso. Capturas pendentes no cofre são limitadas a 1.000 para evitar crescimento indefinido; cada imagem pendente fica em um arquivo criptografado próprio (`media-<hash>.enc`), apagado após sincronizar. Só rejeição permanente do backend envia a captura para quarentena; falha momentânea do banco ou de lease é repetida, e uma rejeição sem motivo conhecido só vai à quarentena se persistir por 10 minutos. Se atingir esse limite, o console indica falha; confira o grupo original. O sistema não promete recuperar todas as mensagens ocorridas durante um desligamento prolongado.

## Backup

1. Desabilite envios; aguarde o processamento terminar ou identifique resultados incertos.
2. Pare o motor. Copie `.engine-data` e `.env` para um arquivo criptografado em armazenamento controlado por você. Guarde a chave AES separadamente de cópias públicas.
3. No backend, exporte o PostgreSQL incluindo `public`, `private` e metadados de Auth necessários, usando o mecanismo de backup do provedor/`pg_dump` autorizado. Não exponha a string de conexão em logs ou shell history. Mantenha versões de esquema e `package-lock.json` com o backup.
4. Exporte também os objetos do bucket privado `offer-media`, preservando os caminhos. Backup do banco não contém o binário dos arquivos.
5. Registre data, contagem de ofertas/publicações e hashes dos arquivos; confira periodicamente uma restauração em ambiente separado de teste.

Não foi contratado backup pago. Retenção, disponibilidade e restauração do Auth dependem do provedor escolhido.

## Restauração

1. Crie/prepare um ambiente exclusivo de restauração, com envio desabilitado e sem motor ativo.
2. Restaure banco, Auth e bucket com os mesmos UUIDs e paths; aplique o esquema/versões compatíveis.
3. Force publicações `processing` sem confirmação para `uncertain`; nunca restaure uma fila antiga liberando envios automaticamente.
4. Revogue as credenciais de motor restauradas e emita uma nova. Atualize URLs e token no `.env`; preserve a chave AES ao restaurar o cofre.
5. Confira isolamento, contagem de registros, imagens privadas e histórico. Vincule novamente se a sessão não for aceita.
6. Libere individualmente agendamentos retidos e confira resultados incertos antes de habilitar envios.

## VPS com Docker

Arquivos `Dockerfile` e `compose.yaml` estão preparados. O serviço não publica portas. Copie `.env` por canal seguro e mantenha volume privado persistente. Pare o notebook antes de iniciar a VPS. Se a lease de 90s ainda estiver ativa, o novo processo espera e publica o estado real, em vez de encerrar com “Outro motor está ativo”.

```sh
docker compose build
docker compose up -d
docker compose logs --tail=50 engine
docker compose ps
docker compose stop
```

Para primeira migração, preserve a chave AES e copie o cofre para o volume, com proprietário adequado ao usuário `node` do contêiner. Não execute `docker compose down -v` se quiser manter a sessão/fila. Uma VPS não elimina a dependência não oficial do Baileys.

## Planos sem cobrança fictícia

Só o administrador da implantação pode executar no banco OfertaBot:

```sql
select public.admin_set_plan('UUID-DA-EMPRESA', 'professional', null);
select public.admin_set_plan('UUID-DA-EMPRESA', 'enterprise', 100);
```

Básico fixa 10, Profissional fixa 50. Empresarial exige limite explícito. A redução é recusada se há mais grupos ativos que o novo limite. Não há Stripe ou outro pagamento configurado.

## Verificações opcionais de integração

`npm run test:postgres` baixa/usa `postgres:17.6-alpine`, cria um contêiner isolado sem rede e o remove ao final. Testa duas sessões concorrentes; usa substitutos mínimos dos schemas Auth/Storage, não o serviço Auth completo.

`npm run test:local` exige antes a stack Supabase local deste projeto (`npx supabase start`) com a migração aplicada e as funções servidas (`npx supabase functions serve`). Ele recusa URLs remotas, cria usuários e empresas claramente identificados como teste e usa somente transporte simulado. Pode exigir vários GB de espaço para as imagens. Esse roteiro foi preparado; o ambiente da entrega não comportou a stack completa. Não executá-lo apontando a uma instalação de produção.

Para builds atrás de proxy com CA própria, sem desligar TLS:

```sh
docker build --secret id=npm-ca,src=/caminho/ca-da-sua-rede.crt -t ofertabot-engine:0.1.0 .
```

O certificado é montado temporariamente apenas durante `npm ci`; não fica gravado na imagem. A CA deve vir do administrador da sua rede.
