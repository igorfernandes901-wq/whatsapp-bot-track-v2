import * as baileys from '@whiskeysockets/baileys';
import type { WASocket, ConnectionState } from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import qrCodeGenerator from 'qrcode';
import { dbActions } from './db.js';

// Safely extract members from baileys namespace/module/exports regardless of how it's bundled
const getBaileysMember = (key: string): any => {
  if ((baileys as any)[key] !== undefined) {
    return (baileys as any)[key];
  }
  if (baileys.default && (baileys.default as any)[key] !== undefined) {
    return (baileys.default as any)[key];
  }
  return undefined;
};

const useMultiFileAuthState = getBaileysMember('useMultiFileAuthState');
const DisconnectReason = getBaileysMember('DisconnectReason');

// To resolve makeWASocket, we look for 'makeWASocket' or the default export if it is a function
const getMakeWASocket = (): any => {
  const named = getBaileysMember('makeWASocket');
  if (typeof named === 'function') return named;

  const def = getBaileysMember('default');
  if (typeof def === 'function') return def;

  if (typeof baileys === 'function') return baileys;
  
  if (baileys.default && typeof baileys.default === 'function') return baileys.default;

  throw new Error('Could not find makeWASocket function in @whiskeysockets/baileys');
};

const makeWASocket = getMakeWASocket();

// Connection status state
export interface WhatsAppStatus {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
  qrCodeBase64: string | null;
  error: string | null;
  me: { id: string; name?: string } | null;
}

export let whatsappStatus: WhatsAppStatus = {
  status: 'disconnected',
  qrCodeBase64: null,
  error: null,
  me: null
};

let sock: WASocket | null = null;
let isInitializing = false;

export function getWhatsAppSock(): WASocket | null {
  return sock;
}

export async function disconnectWhatsApp(): Promise<void> {
  console.log('[WhatsApp] Disconnecting WhatsApp session...');
  if (sock) {
    try {
      sock.logout();
      sock.end(undefined);
    } catch (e) {
      console.error('[WhatsApp] Error during socket closure:', e);
    }
    sock = null;
  }
  
  whatsappStatus = {
    status: 'disconnected',
    qrCodeBase64: null,
    error: null,
    me: null
  };

  // Remove the auth directory to clean up
  const hasDataVolume = fs.existsSync('/data');
  const defaultSessionPath = hasDataVolume 
    ? '/data/whatsapp_session' 
    : path.resolve(process.cwd(), 'auth_session');
  const authDir = process.env.WHATSAPP_SESSION_PATH || defaultSessionPath;
  if (fs.existsSync(authDir)) {
    try {
      fs.rmSync(authDir, { recursive: true, force: true });
      console.log('[WhatsApp] Session auth folder cleared successfully.');
    } catch (e) {
      console.error('[WhatsApp] Failed to delete auth folder:', e);
    }
  }
}

export async function connectToWhatsApp(): Promise<void> {
  if (isInitializing) {
    console.log('[WhatsApp] WhatsApp is already initializing, skipping duplicate call.');
    return;
  }

  isInitializing = true;
  console.log('[WhatsApp] Initializing WhatsApp Connection...');
  whatsappStatus.status = 'connecting';
  whatsappStatus.error = null;

  try {
    const hasDataVolume = fs.existsSync('/data');
    const defaultSessionPath = hasDataVolume 
      ? '/data/whatsapp_session' 
      : path.resolve(process.cwd(), 'auth_session');
    const authFolder = process.env.WHATSAPP_SESSION_PATH || defaultSessionPath;
    
    console.log(`[WhatsApp] Using session path: ${authFolder}`);
    
    // Ensure the auth directory exists
    if (!fs.existsSync(authFolder)) {
      fs.mkdirSync(authFolder, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authFolder);

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['Igor Track Teste', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('[WhatsApp] New QR Code received, generating base64...');
        try {
          const qrBase64 = await qrCodeGenerator.toDataURL(qr);
          whatsappStatus.status = 'qr_ready';
          whatsappStatus.qrCodeBase64 = qrBase64;
          whatsappStatus.error = null;
        } catch (err: any) {
          console.error('[WhatsApp] Error generating QR base64 image:', err);
          whatsappStatus.error = 'Erro ao gerar imagem do QR Code';
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        console.log(`[WhatsApp] Connection closed. Status Code: ${statusCode}. Should reconnect: ${shouldReconnect}`);
        
        whatsappStatus.status = 'disconnected';
        whatsappStatus.qrCodeBase64 = null;
        whatsappStatus.me = null;
        sock = null;

        if (shouldReconnect) {
          isInitializing = false;
          // Wait a short duration and attempt reconnection
          setTimeout(() => {
            connectToWhatsApp();
          }, 5000);
        } else {
          console.log('[WhatsApp] Logged out from WhatsApp. Session credentials cleared.');
          whatsappStatus.error = 'Sessão encerrada ou desconectada pelo celular.';
          isInitializing = false;
        }
      } else if (connection === 'open') {
        console.log('[WhatsApp] WhatsApp Connection Successfully Opened!');
        const userMe = sock?.user;
        whatsappStatus.status = 'connected';
        whatsappStatus.qrCodeBase64 = null;
        whatsappStatus.error = null;
        whatsappStatus.me = userMe ? { id: userMe.id, name: userMe.name } : null;
        isInitializing = false;
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;

      for (const msg of m.messages) {
        // Skip messages sent by me (outgoing handled differently if needed, let's capture incoming)
        const isFromMe = msg.key.fromMe;
        const remoteJid = msg.key.remoteJid;
        
        if (!remoteJid || !remoteJid.endsWith('@s.whatsapp.net')) continue;

        // Clean phone number (extract digits before @)
        const cleanPhone = remoteJid.split('@')[0];
        
        // Extract message content
        const messageText = 
          msg.message?.conversation || 
          msg.message?.extendedTextMessage?.text || 
          msg.message?.imageMessage?.caption || 
          '';

        if (!messageText) continue;

        const direction = isFromMe ? 'outgoing' : 'incoming';
        console.log(`[WhatsApp] Message received from ${cleanPhone} (${direction}): "${messageText}"`);

        // Always log message in the db
        dbActions.logMessage(cleanPhone, messageText, direction);

        if (!isFromMe) {
          // Look for click_id with 'cl_' prefix in the message
          const clickIdMatch = messageText.match(/\bcl_[a-zA-Z0-9]{8,15}\b/);
          let matchedClickId: string | undefined = undefined;

          if (clickIdMatch) {
            matchedClickId = clickIdMatch[0];
            console.log(`[WhatsApp] Matched Click ID: ${matchedClickId} in message from ${cleanPhone}`);
          }

          // Save/Update lead
          dbActions.saveLead(cleanPhone, messageText, matchedClickId);
        }
      }
    });

  } catch (err: any) {
    console.error('[WhatsApp] Critical error during WhatsApp connection setup:', err);
    whatsappStatus.status = 'disconnected';
    whatsappStatus.error = err?.message || 'Erro crítico na conexão';
    isInitializing = false;
  }
}
