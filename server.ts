import express from 'express';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { dbActions, db } from './src/server/db.js';
import { 
  connectToWhatsApp, 
  disconnectWhatsApp, 
  whatsappStatus, 
  getWhatsAppSock 
} from './src/server/whatsapp.js';
import { sendMetaPurchaseEvent, cleanPhoneForMeta } from './src/server/meta.js';

// Helper to generate a clean click_id with 'cl_' prefix
function generateClickId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 10; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `cl_${rand}`;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middlewares
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // AUTO-CONNECT WHATSAPP ON BOOT IF SESSION EXIST
  try {
    console.log('[Server] Checking for pre-existing WhatsApp session...');
    const authFolder = process.env.WHATSAPP_SESSION_PATH || path.resolve(process.cwd(), 'auth_session');
    if (fs.existsSync(authFolder)) {
      connectToWhatsApp();
    }
  } catch (err) {
    console.error('[Server] WhatsApp auto-connect failed or skipped:', err);
  }

  // === 1. CAPTURA DE CLIQUE / ORIGEM DO LEAD ===
  app.get('/r/:campanha', (req, res) => {
    const { campanha } = req.params;
    const { fbclid, utm_source, utm_campaign, utm_content, utm_term, to, phone } = req.query;

    const click_id = generateClickId();
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
    const user_agent = req.headers['user-agent'] || '';

    console.log(`[Click Tracker] Captured Click ID: ${click_id} for campaign: ${campanha}`);

    // Save click to database
    dbActions.saveClick({
      click_id,
      campaign: campanha,
      fbclid: fbclid ? String(fbclid) : undefined,
      utm_source: utm_source ? String(utm_source) : undefined,
      utm_campaign: utm_campaign ? String(utm_campaign) : undefined,
      utm_content: utm_content ? String(utm_content) : undefined,
      utm_term: utm_term ? String(utm_term) : undefined,
      ip,
      user_agent
    });

    // Determine target WhatsApp number
    let targetPhone = '';
    
    // 1. Check query parameter 'to' or 'phone'
    if (to || phone) {
      targetPhone = String(to || phone).replace(/\D/g, '');
    }
    
    // 2. Fallback to connected account phone
    if (!targetPhone && whatsappStatus.me?.id) {
      targetPhone = whatsappStatus.me.id.split('@')[0].split(':')[0];
    }

    // 3. Absolute fallback (fake or example warning number) if no WhatsApp is connected yet
    if (!targetPhone) {
      // We will redirect to a placeholder, or we can instruct user to connect first.
      // Let's use a standard test number or ask the user to connect WhatsApp in the UI.
      // For a better experience, we can redirect to a page warning, or wa.me with a dummy
      targetPhone = '5511999999999'; 
    }

    // Standard Portuguese template message including the click ID for automatic linking
    const message = `Olá, vim do anúncio e gostaria de mais informações! (ID: ${click_id})`;
    const encodedMessage = encodeURIComponent(message);
    const redirectUrl = `https://wa.me/${targetPhone}?text=${encodedMessage}`;

    return res.redirect(redirectUrl);
  });

  // === 2. PROCESSADOR E RECEPTOR DE POSTBACK / WEBHOOK AUTOMÁTICO ===
  async function handlePostback(payload: any, source: { token?: string; campanha?: string; headers?: any; reqIp?: string }) {
    console.log(`[Postback Processor] Processing webhook. Source:`, JSON.stringify(source));
    console.log(`[Postback Processor] Payload:`, JSON.stringify(payload));

    const products = dbActions.getProducts();
    let product: any = null;

    // 1. Tentar encontrar produto por Token de postback
    if (source.token && source.token !== 'auto' && source.token !== 'braip') {
      product = products.find(p => p.postback_token === source.token);
    }

    // 2. Tentar encontrar produto pelo Nome do produto enviado no Payload
    if (!product) {
      const prodName = String(
        payload.prod_nome || 
        payload.prod_name || 
        payload.produto_nome || 
        payload.product_name || 
        payload.product || 
        payload.produto ||
        payload.nome_produto ||
        payload.productName ||
        ''
      ).trim();

      if (prodName) {
        console.log(`[Postback Processor] Searching match for product name in payload: "${prodName}"`);
        product = products.find(p => {
          const nameA = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          const nameB = prodName.toLowerCase().replace(/[^a-z0-9]/g, '');
          return nameA.includes(nameB) || nameB.includes(nameA);
        });
      }
    }

    // 3. Tentar encontrar produto pela campanha informada na URL (ex: /r/rosa-orietal)
    if (!product && source.campanha) {
      console.log(`[Postback Processor] Searching match for campaign slug: "${source.campanha}"`);
      const slug = source.campanha.toLowerCase().replace(/[^a-z0-9]/g, '');
      product = products.find(p => {
        const nameClean = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return nameClean.includes(slug) || slug.includes(nameClean);
      });
    }

    // 4. Fallback: se nenhum produto bater e houver produtos cadastrados, associamos ao primeiro produto
    if (!product && products.length > 0) {
      console.log(`[Postback Processor] No specific match found. Defaulting to first configured product: "${products[0].name}"`);
      product = products[0];
    }

    if (!product) {
      console.error(`[Postback Processor] Error: No product configured in the database to receive this event.`);
      return { success: false, error: 'Nenhum produto cadastrado no painel para vincular esta venda' };
    }

    // Extrair ID da transação / pedido
    const order_id = String(
      payload.order_id || 
      payload.id || 
      payload.trans_cod || 
      payload.trans_id || 
      payload.purchase?.transaction || 
      payload.transaction_id || 
      payload.checkout_id ||
      `ord_${Date.now()}`
    );

    // Mapeamento flexível de status de pagamento
    const rawStatus = String(
      payload.status || 
      payload.event || 
      payload.event_type || 
      payload.order_status || 
      payload.trans_status ||
      ''
    ).toLowerCase();

    let status = 'Outro';
    if (['approved', 'paid', 'pago', 'aprovado', 'sucesso', '2', 'active', 'completo'].includes(rawStatus) || rawStatus.includes('pago') || rawStatus.includes('aprovado')) {
      status = 'Pagamento Aprovado';
    } else if (['pix', 'pix_generated', 'waiting_payment', 'aguardando_pagamento', '1'].includes(rawStatus) || rawStatus.includes('pix')) {
      status = 'Pix Gerado';
    } else if (['boleto', 'boleto_generated', '3'].includes(rawStatus) || rawStatus.includes('boleto')) {
      status = 'Boleto Gerado';
    } else if (['refunded', 'reembolsado', 'reembolso', '6', 'devolvido'].includes(rawStatus)) {
      status = 'Reembolso';
    } else if (['chargeback', '7', 'disputa'].includes(rawStatus)) {
      status = 'Chargeback';
    }

    // Extrair telefone do comprador
    const rawPhone = 
      payload.phone || 
      payload.client_phone || 
      payload.cliente_telefone || 
      payload.customer?.phone || 
      payload.customer?.mobile || 
      payload.buyer?.phone || 
      payload.client?.phone || 
      payload.telefone ||
      '';

    const cleanPhone = cleanPhoneForMeta(String(rawPhone));

    // Extrair email do comprador
    const rawEmail = 
      payload.client_email || 
      payload.cliente_email || 
      payload.customer?.email || 
      payload.buyer?.email || 
      payload.client?.email || 
      payload.email || 
      '';

    // Extrair nome do comprador
    const rawName = 
      payload.client_name || 
      payload.cliente_nome || 
      payload.customer?.name || 
      payload.buyer?.name || 
      payload.client?.name || 
      payload.nome || 
      payload.name || 
      '';

    // Extrair valor da venda
    let rawValue = 
      payload.value || 
      payload.price || 
      payload.amount || 
      payload.trans_valor || 
      payload.valor ||
      payload.purchase?.price?.value || 
      0;

    let value = Number(rawValue);
    // Tratar envio em centavos se aplicável (Kiwify ou outros)
    if (value > 200 && !String(rawValue).includes('.') && !String(rawValue).includes(',')) {
      if (payload.amount || rawStatus.includes('kiwify') || (source.token && source.token.includes('kiwify'))) {
        value = value / 100;
      }
    }

    // Captura robusta de IP e User-Agent do comprador do payload da Braip/Payt ou dos cabeçalhos do webhook
    let webhookIp = '';
    if (payload) {
      webhookIp = payload.client_ip ||
                  payload.cliente_ip ||
                  payload.ip ||
                  payload.ip_compra ||
                  payload.ip_address ||
                  payload.user_ip ||
                  payload.customer?.ip_address ||
                  payload.customer?.ip ||
                  payload.buyer?.ip_address ||
                  payload.buyer?.ip ||
                  payload.client?.ip ||
                  payload.client?.ip_address ||
                  payload.purchase?.client_ip ||
                  payload.purchase?.ip ||
                  '';
    }
    if (!webhookIp && source.headers) {
      const forwardedFor = source.headers['x-forwarded-for'];
      if (forwardedFor) {
        const ipList = String(forwardedFor).split(',');
        webhookIp = ipList[0].trim();
      }
      if (!webhookIp) {
        webhookIp = source.headers['x-real-ip'] || source.headers['cf-connecting-ip'] || source.headers['client-ip'] || '';
      }
    }
    if (!webhookIp && source.reqIp) {
      webhookIp = source.reqIp;
    }

    // Strip IPv6 loopback or mapped address wrappers if present
    if (webhookIp.startsWith('::ffff:')) {
      webhookIp = webhookIp.substring(7);
    }

    let webhookUserAgent = '';
    if (payload) {
      webhookUserAgent = payload.client_user_agent ||
                        payload.user_agent ||
                        payload.cliente_user_agent ||
                        payload.buyer_user_agent ||
                        payload.customer_user_agent ||
                        payload.customer?.user_agent ||
                        payload.customer?.useragent ||
                        payload.buyer?.user_agent ||
                        payload.buyer?.useragent ||
                        payload.client?.user_agent ||
                        payload.client?.useragent ||
                        payload.purchase?.client_user_agent ||
                        payload.purchase?.user_agent ||
                        payload.useragent ||
                        payload.browser_user_agent ||
                        '';
    }

    // Vincular lead por telefone no banco de dados para recuperar fbclid, ip, userAgent
    const lead = dbActions.getLeadByPhone(cleanPhone);
    let fbclid = '';
    let click_id = '';
    let ip = '';
    let userAgent = '';

    if (lead) {
      console.log(`[Postback Processor] Lead matched for phone ${cleanPhone}. Retrieving source details...`);
      click_id = lead.click_id || '';
      if (click_id) {
        const click = dbActions.getClick(click_id);
        if (click) {
          fbclid = click.fbclid || '';
          ip = click.ip || '';
          userAgent = click.user_agent || '';
        } else {
          // Robust fallback: if click record is missing but click_id was set (like in simulators or manual imports),
          // we treat the click_id itself as the fbclid
          fbclid = click_id;
          console.log(`[Postback Processor] Click record not found for click_id "${click_id}". Using click_id directly as FBCLID.`);
        }
      }
    } else {
      console.log(`[Postback Processor] No existing lead found for phone ${cleanPhone}. Saving standalone event.`);
    }

    // Se IP ou User-Agent não foram encontrados a partir do clique redirecionado, use os capturados do webhook (Braip/Payt)
    if (!ip && webhookIp) {
      ip = webhookIp;
      console.log(`[Postback Processor] Using captured Webhook IP: "${ip}"`);
    }
    if (!userAgent && webhookUserAgent) {
      userAgent = webhookUserAgent;
      console.log(`[Postback Processor] Using captured Webhook User Agent: "${userAgent}"`);
    }

    // Salvar evento de venda
    const salesEventId = dbActions.saveSalesEvent({
      product_id: product.id,
      postback_token: product.postback_token,
      order_id,
      status,
      value,
      phone: cleanPhone,
      payload: JSON.stringify(payload),
      lead_phone: lead ? cleanPhone : undefined,
      fbclid: fbclid || undefined,
      meta_status: 'pending',
      meta_response: undefined
    });

    // Disparar evento para API de Conversões do Meta se Pago/Aprovado
    if (status === 'Pagamento Aprovado') {
      console.log(`[Postback Processor] Sale APPROVED. Dispatched Meta Purchase event for sales event ID: ${salesEventId}`);
      sendMetaPurchaseEvent(
        product.id,
        salesEventId,
        order_id,
        value,
        cleanPhone,
        fbclid || undefined,
        ip || undefined,
        userAgent || undefined,
        String(rawEmail) || undefined,
        String(rawName) || undefined
      ).catch(err => {
        console.error('[Postback Processor] Meta dispatch failed async:', err);
      });
    } else {
      console.log(`[Postback Processor] Event status is '${status}', skipping Meta Conversions API.`);
      dbActions.updateSalesEventMetaStatus(salesEventId, 'skipped', 'Evento não qualifica para Conversão (apenas Pagamento Aprovado)');
    }

    return { success: true, message: 'Postback processado com sucesso', order_id, status, product_name: product.name };
  }

  // Endpoint 2.1: Endpoint tradicional com Token
  app.post('/webhook/postback/:token', async (req, res) => {
    try {
      const result = await handlePostback(req.body, { 
        token: req.params.token,
        headers: req.headers,
        reqIp: req.ip
      });
      if (!result.success) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (err: any) {
      console.error('[Postback Token Route Error]:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Endpoint 2.2: Endpoint universal sem token (/webhook)
  app.post('/webhook', async (req, res) => {
    try {
      const result = await handlePostback(req.body, {
        headers: req.headers,
        reqIp: req.ip
      });
      if (!result.success) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (err: any) {
      console.error('[Webhook Universal Route Error]:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Endpoint 2.3: Endpoint alternativo sem token (/webhook/postback)
  app.post('/webhook/postback', async (req, res) => {
    try {
      const result = await handlePostback(req.body, {
        headers: req.headers,
        reqIp: req.ip
      });
      if (!result.success) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (err: any) {
      console.error('[Webhook Postback Generic Route Error]:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Endpoint 2.4: Interceptar POST enviado por engano à URL de redirecionamento (/r/:campanha)
  app.post('/r/:campanha', async (req, res) => {
    try {
      const result = await handlePostback(req.body, { 
        campanha: req.params.campanha,
        headers: req.headers,
        reqIp: req.ip
      });
      if (!result.success) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (err: any) {
      console.error('[Redirect Link Postback Interceptor Error]:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // === 4. DASHBOARD API ENDPOINTS ===

  const activeSessions = new Set<string>();

  // Middleware to authenticate API requests
  function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Não autorizado. Faça login.' });
    }
    const token = authHeader.substring(7);
    if (!activeSessions.has(token)) {
      return res.status(401).json({ error: 'Sessão expirada ou inválida. Faça login novamente.' });
    }
    next();
  }

  // Auth endpoints (Public)
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const expectedUsername = (process.env.DASHBOARD_USERNAME || 'igorfernandes').trim().toLowerCase();
    const expectedPassword = (process.env.DASHBOARD_PASSWORD || '12345678').trim();

    const inputUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
    const inputPassword = typeof password === 'string' ? password.trim() : '';

    if (inputUsername === expectedUsername && inputPassword === expectedPassword) {
      const token = crypto.randomBytes(32).toString('hex');
      activeSessions.add(token);
      return res.json({ success: true, token });
    }

    return res.status(401).json({ error: 'Usuário ou senha incorretos' });
  });

  app.post('/api/logout', (req, res) => {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      activeSessions.delete(token);
    }
    return res.json({ success: true });
  });

  app.get('/api/auth/verify', (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({ authenticated: false });
    }
    const token = authHeader.substring(7);
    if (activeSessions.has(token)) {
      return res.json({ authenticated: true });
    }
    return res.json({ authenticated: false });
  });

  // Stats summary
  app.get('/api/config/domain', (req, res) => {
    try {
      let appUrl = process.env.APP_URL || '';
      
      // If the appUrl contains "ais-dev-", map it to the stable production "ais-pre-" URL
      if (appUrl.includes('ais-dev-')) {
        appUrl = appUrl.replace('ais-dev-', 'ais-pre-');
      }
      
      // Fallback to the stable shared app URL of this workspace
      if (!appUrl) {
        appUrl = 'https://ais-pre-azhebk2u6vw5537f4tx7sp-760093882049.us-east1.run.app';
      }
      
      console.log(`[Domain Check] Derived appUrl: ${appUrl}`);
      
      return res.json({
        appUrl
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Stats summary
  app.get('/api/stats', authMiddleware, (req, res) => {
    try {
      const stats = dbActions.getDashboardStats();
      return res.json(stats);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Sales events table
  app.get('/api/events', authMiddleware, (req, res) => {
    try {
      const { product_id, status, utm_campaign } = req.query;
      const events = dbActions.getSalesEvents({
        product_id: product_id ? Number(product_id) : undefined,
        status: status ? String(status) : undefined,
        utm_campaign: utm_campaign ? String(utm_campaign) : undefined
      });
      return res.json(events);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Leads list
  app.get('/api/leads', authMiddleware, (req, res) => {
    try {
      const leads = dbActions.getLeads();
      return res.json(leads);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Products CRUD
  app.get('/api/products', authMiddleware, (req, res) => {
    try {
      const products = dbActions.getProducts();
      return res.json(products);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/products', authMiddleware, (req, res) => {
    try {
      const { name, pixel_id, access_token } = req.body;
      if (!name || !pixel_id || !access_token) {
        return res.status(400).json({ error: 'Preencha todos os campos obrigatórios' });
      }

      // Generate a unique token for this product postback
      const token = 'tok_' + crypto.randomBytes(16).toString('hex');
      const newProduct = dbActions.createProduct(name, pixel_id, access_token, token);
      
      return res.status(201).json(newProduct);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/products/:id', authMiddleware, (req, res) => {
    try {
      const { id } = req.params;
      dbActions.deleteProduct(Number(id));
      return res.json({ success: true, message: 'Produto deletado' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // WhatsApp connection API
  app.get('/api/whatsapp/status', authMiddleware, (req, res) => {
    let cleanPhone = null;
    if (whatsappStatus.me?.id) {
      cleanPhone = whatsappStatus.me.id.split('@')[0].split(':')[0];
    }
    return res.json({
      ...whatsappStatus,
      mePhone: cleanPhone
    });
  });

  app.post('/api/whatsapp/connect', authMiddleware, async (req, res) => {
    try {
      connectToWhatsApp();
      return res.json({ success: true, message: 'Iniciando conexão...' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/whatsapp/disconnect', authMiddleware, async (req, res) => {
    try {
      await disconnectWhatsApp();
      return res.json({ success: true, message: 'WhatsApp desconectado com sucesso' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Chat message history
  app.get('/api/whatsapp/chat/:phone', authMiddleware, (req, res) => {
    try {
      const { phone } = req.params;
      const messages = dbActions.getMessages(phone.replace(/\D/g, ''));
      return res.json(messages);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Send manual WhatsApp message
  app.post('/api/whatsapp/send', authMiddleware, async (req, res) => {
    try {
      const { phone, message } = req.body;
      if (!phone || !message) {
        return res.status(400).json({ error: 'Telefone e mensagem são obrigatórios' });
      }

      const sock = getWhatsAppSock();
      if (!sock || whatsappStatus.status !== 'connected') {
        return res.status(400).json({ error: 'WhatsApp não está conectado' });
      }

      const formattedJid = `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
      await sock.sendMessage(formattedJid, { text: message });

      // Save message in local log
      dbActions.logMessage(phone.replace(/\D/g, ''), message, 'outgoing');

      return res.json({ success: true, message: 'Mensagem enviada!' });
    } catch (err: any) {
      console.error('[WhatsApp Send Message] Error:', err);
      return res.status(500).json({ error: err.message || 'Erro ao enviar mensagem' });
    }
  });

  // === 3. CENTRO DE DIAGNÓSTICO E SIMULAÇÃO DE WEBHOOKS/POSTBACKS ===
  app.post('/api/test/create-lead', authMiddleware, (req, res) => {
    try {
      const { phone, first_message, campaign, click_id } = req.body;
      if (!phone) {
        return res.status(400).json({ error: 'Telefone é obrigatório' });
      }
      
      const cleanPhone = phone.replace(/\D/g, '');
      const lead = dbActions.saveLead(
        cleanPhone, 
        first_message || 'Lead cadastrado via Centro de Testes', 
        click_id || undefined
      );
      
      if (campaign) {
        const stmt = db.prepare('UPDATE leads SET utm_campaign = ? WHERE phone = ?');
        stmt.run(campaign, cleanPhone);
      }
      
      return res.json({
        success: true,
        message: 'Lead de teste cadastrado com sucesso!',
        lead: dbActions.getLeadByPhone(cleanPhone)
      });
    } catch (err: any) {
      console.error('[Create Test Lead Error]:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/test/simulate-postback', authMiddleware, async (req, res) => {
    try {
      const { product_id, phone, status, value, order_id, email, name, test_event_code } = req.body;
      
      const logs: string[] = [];
      logs.push(`[Simulador] Iniciando postback de teste para o Produto ID: ${product_id}`);
      if (test_event_code) {
        logs.push(`[Simulador] Código de Teste da Meta ativado: "${test_event_code}"`);
      }
      
      const product = dbActions.getProductById(Number(product_id));
      if (!product) {
        return res.status(400).json({ error: 'Produto não encontrado' });
      }
      
      logs.push(`[Simulador] Produto encontrado: "${product.name}"`);
      
      const rawPhone = phone || '';
      const { cleanPhoneForMeta } = await import('./src/server/meta.js');
      const cleanPhone = cleanPhoneForMeta(String(rawPhone));
      logs.push(`[Simulador] Telefone recebido: "${rawPhone}" -> Tratado para formato CAPI: "${cleanPhone}"`);
      
      logs.push(`[Simulador] Executando correspondência de lead por telefone no banco de dados...`);
      const lead = dbActions.getLeadByPhone(cleanPhone);
      
      let matchedLeadPhone = '';
      let fbclid = '';
      let click_id = '';
      let ip = '';
      let userAgent = '';
      
      if (lead) {
        matchedLeadPhone = lead.phone;
        click_id = lead.click_id || '';
        logs.push(`[Simulador] ✅ LEAD CORRESPONDIDO COM SUCESSO!`);
        logs.push(`[Simulador] Telefone do Lead no Banco: "${lead.phone}" (Combinação por sufixo dos últimos 8 dígitos)`);
        if (click_id) {
          logs.push(`[Simulador] Click ID / FBCLID herdado do lead: "${click_id}"`);
          const click = dbActions.getClick(click_id);
          if (click) {
            fbclid = click.fbclid || '';
            ip = click.ip || '';
            userAgent = click.user_agent || '';
            logs.push(`[Simulador] Dados recuperados do clique: FBCLID: "${fbclid}", IP: "${ip}", User-Agent: "${userAgent ? 'Sim (presente)' : 'Não'}"`);
          } else {
            fbclid = click_id;
            logs.push(`[Simulador] ⚠️ Registro detalhado do clique não encontrado no banco para ID "${click_id}". Usando o próprio ID como FBCLID de contingência (Fallback de Simulação).`);
          }
        } else {
          logs.push(`[Simulador] Lead sem ID de clique associado (capturado por contato direto).`);
        }
      } else {
        logs.push(`[Simulador] ❌ NENHUM LEAD CORRESPONDIDO. A venda será registrada de forma isolada.`);
      }
      
      const targetOrderId = order_id || `sim_${Math.floor(100000 + Math.random() * 900000)}`;
      const targetStatus = status || 'Pagamento Aprovado';
      const targetValue = Number(value) || 97.00;
      
      logs.push(`[Simulador] Gravando evento de venda na tabela sales_events...`);
      const salesEventId = dbActions.saveSalesEvent({
        product_id: product.id,
        postback_token: product.postback_token,
        order_id: targetOrderId,
        status: targetStatus,
        value: targetValue,
        phone: cleanPhone,
        payload: JSON.stringify({
          order_id: targetOrderId,
          status: targetStatus,
          value: targetValue,
          phone: rawPhone,
          email: email || 'comprador_teste@gmail.com',
          name: name || 'Igor Fernandes Teste',
          product_name: product.name,
          simulation: true
        }),
        lead_phone: lead ? lead.phone : undefined,
        fbclid: fbclid || undefined,
        meta_status: 'pending',
        meta_response: undefined
      });
      
      logs.push(`[Simulador] Venda gravada com ID local: ${salesEventId}`);
      
      let metaResult: any = null;
      if (targetStatus === 'Pagamento Aprovado') {
        logs.push(`[Simulador] Status é "Pagamento Aprovado". Disparando evento de Purchase para a API de Conversões da Meta de forma síncrona para capturar resposta...`);
        
        const { sendMetaPurchaseEvent: sendEvent } = await import('./src/server/meta.js');
        metaResult = await sendEvent(
          product.id,
          salesEventId,
          targetOrderId,
          targetValue,
          cleanPhone,
          fbclid || undefined,
          ip || undefined,
          userAgent || undefined,
          email || undefined,
          name || undefined,
          test_event_code || undefined
        );
        
        if (metaResult.success) {
          logs.push(`[Simulador] ✅ META API ENVIOU COM SUCESSO!`);
          logs.push(`[Simulador] Resposta da Meta: ${JSON.stringify(metaResult.responsePayload)}`);
        } else {
          logs.push(`[Simulador] ❌ FALHA NO ENVIO DA META API!`);
          logs.push(`[Simulador] Detalhe do Erro: ${metaResult.message}`);
        }
      } else {
        logs.push(`[Simulador] Status "${targetStatus}" não é aprovado, pulando disparo da Meta.`);
        dbActions.updateSalesEventMetaStatus(salesEventId, 'skipped', 'Evento de teste não qualifica para Conversão (apenas Pagamento Aprovado)');
      }
      
      return res.json({
        success: true,
        salesEventId,
        matched: !!lead,
        lead_phone: matchedLeadPhone,
        meta_status: metaResult ? (metaResult.success ? 'success' : 'failed') : 'skipped',
        meta_response: metaResult ? metaResult.responsePayload || metaResult.message : null,
        logs
      });
      
    } catch (err: any) {
      console.error('[Simulate Postback Error]:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Vite Integration / Production Static Assets
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Igor Track Teste server booted on http://0.0.0.0:${PORT}`);
  });
}

startServer();
