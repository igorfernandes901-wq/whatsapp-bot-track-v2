# Igor Track Teste 🚀

Central pessoal de tracking de conversões e atribuição de vendas server-side para funis do WhatsApp integrados à **Meta Conversions API (CAPI)**.

Desenvolvido para afiliados, coprodutores e produtores que desejam marcar conversões exatas e otimizar campanhas de tráfego pago (Maximizar Conversões, Advantage+) sem perdas de cookies, de forma automática.

---

## 🛠️ Detalhes do Projeto e Resoluções Técnicas

### 1. Correção do Erro de Inicialização (Deploy)
* **Resolução do Erro `TypeError [ERR_INVALID_ARG_TYPE]`**: O erro ocorria porque a compilação do servidor de produção (`npm run build`) empacota o backend como um arquivo CommonJS (`dist/server.cjs`). O arquivo `src/server/db.ts` continha uma chamada para `fileURLToPath(import.meta.url)`, que é uma propriedade do padrão ES Modules (ESM) e resulta em `undefined` quando executada em ambiente CommonJS. 
* **Ajuste Efetuado**: Como as definições de `__filename` e `__dirname` eram totalmente não utilizadas em `src/server/db.ts` (uma vez que a base de caminhos utiliza caminhos de ambiente ou relativos ao processo via `process.cwd()`), removemos as importações e variáveis obsoletas. Isso solucionou 100% o problema de inicialização, permitindo que a build CommonJS execute perfeitamente em qualquer ambiente Node.js.

### 2. Preparação do Ambiente e Dockerfile (Suporte a Puppeteer & Baileys)
* **Arquitetura Otimizada (Baileys)**: O projeto atualmente utiliza a biblioteca `@whiskeysockets/baileys` para gerenciar a conexão do WhatsApp. O Baileys conecta-se diretamente através de WebSockets na API do WhatsApp Web, eliminando a necessidade de iniciar um navegador Chromium em background. Isso resulta em até 90% de economia de memória e processamento.
* **Dockerfile com Dependências do Chromium/Puppeteer**: Caso você decida migrar para bibliotecas baseadas em Puppeteer/Chromium (como `whatsapp-web.js`), criamos um **Dockerfile** de produção completo e otimizado na raiz do projeto. Ele instala todas as bibliotecas e dependências Linux necessárias para rodar o Chromium headless (`libnss3`, `libatk-bridge2.0-0`, `libx11-xcb1`, `libgbm1`, etc.) de forma robusta e transparente.
* **Argumentos de Execução Segura**: Caso use Puppeteer, garanta que a inicialização contenha os seguintes argumentos necessários para contornar restrições de sandbox em containers Linux:
  ```js
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  ```

### 3. Persistência Absoluta de Dados (Prevenindo Perda de Sessão)
* **Evite o Cloud Run para o WhatsApp**: O Cloud Run escala instâncias para zero automaticamente quando não há tráfego de requisições web. Como a sessão do WhatsApp exige um processo com conexão persistente (mecanismo de keep-alive de WebSockets), o desligamento do container desconecta o celular e exige reescanear o QR Code a cada nova requisição.
* **Hospedagem Recomendada (Railway, Render ou VPS)**: Recomenda-se rodar este projeto em plataformas de processos contínuos que permitam acoplar **Volumes de Disco Persistente** montados na pasta `/data`.
  * **Banco de Dados SQLite**: Configurado por padrão em `/data/tracktool.db` (evitando perda de cliques, leads e eventos).
  * **Sessão do WhatsApp**: Salva de forma permanente em `/data/whatsapp_session`, garantindo que a conexão permaneça ativa indefinidamente através de deploys e restarts de containers.

---

## ⚙️ Configuração das Variáveis de Ambiente

As configurações estão expostas no arquivo `.env.example`. Configure as seguintes variáveis no painel da sua hospedagem:

* `PORT`: Porta do servidor web (Padrão: `3000`).
* `NODE_ENV`: Modo do ambiente (Defina como `production`).
* `DASHBOARD_USERNAME`: Usuário para acessar o painel administrativo (Padrão: `admin`).
* `DASHBOARD_PASSWORD`: Senha exclusiva para seu login administrativo do painel.
* `DATABASE_PATH`: Caminho absoluto no disco persistente (Defina como `/data/tracktool.db`).
* `WHATSAPP_SESSION_PATH`: Pasta da sessão no disco persistente (Defina como `/data/whatsapp_session`).

---

## 🚀 Guia de Deploy Passo a Passo

### Opção A: Deploy no Railway (Recomendado & Mais Rápido)
O Railway detectará o `Dockerfile` automaticamente, manterá o processo ativo 24/7 e fornecerá montagem de disco persistente simples.

1. **Criar Novo Serviço**: No Railway, clique em **New Project** -> **Deploy from GitHub repo** e selecione este repositório.
2. **Configurar as Variáveis de Ambiente**: Vá na aba **Variables** do serviço e insira as chaves listadas acima (especialmente `DATABASE_PATH="/data/tracktool.db"` e `WHATSAPP_SESSION_PATH="/data/whatsapp_session"`).
3. **Adicionar Volume de Disco Persistente**:
   * Vá nas configurações do seu serviço no Railway, role até a seção **Volumes** e clique em **Add Volume**.
   * Defina o nome do volume como quiser (ex: `dados-tracker`) e configure o **Mount Path** (Caminho de Montagem) estritamente como `/data`.
   * Clique em salvar.
4. **Pronto!** O Railway irá compilar a imagem usando o Dockerfile e executará o sistema. Suas sessões de WhatsApp e dados do banco de dados estarão totalmente seguros e persistentes no volume `/data`.

### Opção B: Deploy no Render
No Render, certifique-se de escolher o serviço do tipo **Web Service** (plano pago, pois os planos gratuitos hibernam e perdem conexões ativas).

1. **Criar Web Service**: Crie um novo Web Service apontando para o seu repositório no GitHub.
2. **Configuração do Ambiente**:
   * **Runtime**: Escolha `Docker` (ele usará o `Dockerfile` presente na raiz).
3. **Adicionar Volume de Disco (Disk)**:
   * Nas configurações avançadas do Web Service, role até a seção **Disks**.
   * Clique em **Add Disk**.
   * **Name**: `dados-tracker`
   * **Mount Path**: `/data`
   * **Size**: 1 GB (mais do que suficiente).
4. **Configurar Variáveis de Ambiente**:
   * Adicione as variáveis listadas na seção anterior, garantindo que `DATABASE_PATH` aponte para `/data/tracktool.db` e `WHATSAPP_SESSION_PATH` para `/data/whatsapp_session`.
5. **Aguardar Build**: O Render baixará as dependências de sistema do Dockerfile e colocará a aplicação no ar com segurança.

---

## 🧪 Guia de Teste de Ponta a Ponta (Step-by-Step)

Siga estes passos exatos após o deploy para confirmar que tudo está funcionando perfeitamente:

1. **Acessar o Painel**: Entre no domínio fornecido pela sua hospedagem e faça login com as credenciais definidas (`DASHBOARD_USERNAME` e `DASHBOARD_PASSWORD`).
2. **Conectar o WhatsApp**: Vá na aba **Conexão WhatsApp**, gere o QR Code e escaneie com o celular de disparos. Verifique se o status altera para **Conectado**.
3. **Simular Clique**: Crie um produto no painel com um Pixel ID de testes da Meta. Acesse o link de redirecionamento gerado (ex: `/r/campanha-teste`) simulando o lead clicando no anúncio.
4. **Envio da Mensagem**: Complete o redirecionamento para o WhatsApp e envie a mensagem contendo o ID do clique (`cl_xxxxxxxxx`). O lead deve ser capturado no painel instantaneamente.
5. **Postback de Venda**: Faça uma requisição de teste para a URL de webhook do produto para simular a compra e verifique se o evento é processado e enviado para a Meta Conversions API perfeitamente!
