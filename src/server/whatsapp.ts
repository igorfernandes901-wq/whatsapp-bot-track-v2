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

    // Protection against duplicate active sockets
    if (sock) {
      console.log('[WhatsApp Warning] Socket already exists during initialization. Closing previous socket first to prevent duplicate active connections...');
      try {
        sock.end(undefined);
      } catch (e) {
        console.error('[WhatsApp] Error closing old socket:', e);
      }
      sock = null;
    }

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['Igor Track Teste', 'Chrome', '1.0.0']
    });

    console.log('[WhatsApp] Socket successfully created using makeWASocket.');

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      // Diagnostic log showing the full raw ConnectionState update object
      try {
        console.log('[WhatsApp Connection Update RAW]:', JSON.stringify(update, (key, value) => {
          if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
            return `[Buffer/Uint8Array length=${value.length}]`;
          }
          if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'Boom') {
            return { message: value.message, statusCode: value.output?.statusCode, data: value.data };
          }
          return value;
        }, 2));
      } catch (e) {
        console.log('[WhatsApp Connection Update RAW - fallback error serializing]:', update);
      }
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

    // Helper function to recursively find Facebook click ID (ctwa_clid) or other tracking parameters
    const extractCtwaClid = (obj: any): string | null => {
      if (!obj) return null;

      // Handle Buffer/Uint8Array values commonly used in Baileys contextInfo.conversionData
      if (Buffer.isBuffer(obj) || obj instanceof Uint8Array) {
        try {
          const str = Buffer.from(obj).toString('utf-8');
          if (str) {
            // Try to match ctwa_clid pattern or any 15+ alphanumeric characters
            const match = str.match(/ctwa_clid[":\s]+([a-zA-Z0-9_-]+)/i) || str.match(/\b([a-zA-Z0-9_-]{15,})\b/);
            if (match) return match[1];
            return str; // Return raw string as fallback
          }
        } catch (_) {}
      }

      if (typeof obj === 'object') {
        // Check standard fields
        if (obj.ctwa_clid && typeof obj.ctwa_clid === 'string') return obj.ctwa_clid;
        if (obj.ctwaClid && typeof obj.ctwaClid === 'string') return obj.ctwaClid;
        if (obj.conversion_data && typeof obj.conversion_data === 'string') return obj.conversion_data;
        if (obj.conversionData) {
          const res = extractCtwaClid(obj.conversionData);
          if (res) return res;
        }

        // Recursively check all properties
        for (const key of Object.keys(obj)) {
          try {
            const val = obj[key];
            if (typeof val === 'object' && val !== null) {
              const res = extractCtwaClid(val);
              if (res) return res;
            } else if (typeof val === 'string') {
              if (key.toLowerCase().includes('clid') || key.toLowerCase() === 'referral') {
                if (val.length > 10) return val;
              }
            }
          } catch (_) {}
        }
      }

      return null;
    };

    sock.ev.on('messages.upsert', async (m) => {
      try {
        console.log('[RAW EVENT] messages.upsert disparou! Tipo:', m.type, '- Quantidade de mensagens:', m.messages?.length);

        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
          const isFromMe = msg.key.fromMe;
          const remoteJid = msg.key.remoteJid;
          console.log('[JID Debug] remoteJid recebido:', remoteJid, '| fromMe:', isFromMe);
          
          // Debugging logs for contextInfo and externalAdReply
          if (msg.message) {
            const contextInfo = 
              msg.message.extendedTextMessage?.contextInfo ||
              msg.message.imageMessage?.contextInfo ||
              msg.message.videoMessage?.contextInfo ||
              msg.message.buttonsResponseMessage?.contextInfo;

            if (contextInfo) {
              if (contextInfo.externalAdReply) {
                console.log('=== EXTERNAL AD REPLY (RAW) ===');
                console.log(JSON.stringify(contextInfo.externalAdReply, null, 2));
              }
              console.log('=== CONTEXT INFO COMPLETO (RAW) ===');
              console.log(JSON.stringify(contextInfo, null, 2));
            }
          }

          if (!remoteJid || (!remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.endsWith('@lid'))) continue;

          // Clean phone number (extract digits before @)
          const cleanPhone = remoteJid.split('@')[0];
          
          // Extract message content
          let messageText = 
            msg.message?.conversation || 
            msg.message?.extendedTextMessage?.text || 
            msg.message?.imageMessage?.caption || 
            '';

          const direction = isFromMe ? 'outgoing' : 'incoming';

          // Log complete payload of received message for CTWA Click-to-WhatsApp debugging
          if (!isFromMe) {
            console.log(`[WhatsApp CTWA Debug] FULL MESSAGE PAYLOAD from ${cleanPhone}:`, JSON.stringify(msg, null, 2));
            
            if (!messageText) {
              messageText = '[Mensagem de Mídia/Botão/Meta Click-to-WhatsApp]';
            }
          }

          if (!messageText && isFromMe) continue;

          console.log(`[WhatsApp] Message received from ${cleanPhone} (${direction}): "${messageText}"`);

          // Always log message in the db
          dbActions.logMessage(cleanPhone, messageText, direction);

          if (!isFromMe) {
            // 1. Look for click_id with 'cl_' prefix in the message (Site campaigns)
            const clickIdMatch = messageText.match(/\bcl_[a-zA-Z0-9]{8,15}\b/);
            let matchedClickId: string | undefined = undefined;

            if (clickIdMatch) {
              matchedClickId = clickIdMatch[0];
              console.log(`[WhatsApp] Matched Click ID: ${matchedClickId} in message from ${cleanPhone}`);
            }

            // 2. Look for ctwa_clid (Meta Click-to-WhatsApp Ad conversion data)
            const matchedCtwaClid = extractCtwaClid(msg);
            if (matchedCtwaClid) {
              console.log(`[WhatsApp CTWA Debug] Successfully extracted ctwa_clid: ${matchedCtwaClid} from incoming message of ${cleanPhone}`);
            }

            // Save/Update lead (with optional cl_xxx and ctwa_clid in parallel)
            dbActions.saveLead(cleanPhone, messageText, matchedClickId, matchedCtwaClid || undefined);
          }
        }
      } catch (upsertError: any) {
        console.error('[WhatsApp Critical] Error inside messages.upsert handler:', upsertError, upsertError?.stack);
      }
    });

    // Count and log the messages.upsert listeners safely to guarantee registration
    let listenerCount = 'N/A';
    try {
      if (sock.ev && typeof (sock.ev as any).listenerCount === 'function') {
        listenerCount = (sock.ev as any).listenerCount('messages.upsert').toString();
      } else if (sock.ev && (sock.ev as any).emitter && typeof (sock.ev as any).emitter.listenerCount === 'function') {
        listenerCount = (sock.ev as any).emitter.listenerCount('messages.upsert').toString();
      } else if (sock.ev && (sock.ev as any).listeners) {
        const l = (sock.ev as any).listeners('messages.upsert');
        if (Array.isArray(l)) listenerCount = l.length.toString();
      }
    } catch (_) {}
    console.log(`[WhatsApp Listener Diagnostic] Registered messages.upsert. Total active listenerCount: ${listenerCount}`);

  } catch (err: any) {
    console.error('[WhatsApp] Critical error during WhatsApp connection setup:', err);
    whatsappStatus.status = 'disconnected';
    whatsappStatus.error = err?.message || 'Erro crítico na conexão';
    isInitializing = false;
  }
}

// Global process error catchers to prevent silent crashes and log details
if (!(process as any)._whatsappLoggingRegistered) {
  (process as any)._whatsappLoggingRegistered = true;
  process.on('uncaughtException', (err) => {
    console.error('[CRITICAL - PROCESS] Uncaught Exception detected in Node process:', err);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL - PROCESS] Unhandled Rejection detected at:', promise, 'reason:', reason);
  });
}
