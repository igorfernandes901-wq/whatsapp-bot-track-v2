import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Initialize SQLite database
const hasDataVolume = fs.existsSync('/data');
const defaultDbPath = hasDataVolume 
  ? '/data/tracktool.db' 
  : path.resolve(process.cwd(), 'database.db');

const dbPath = process.env.DATABASE_PATH || defaultDbPath;

console.log(`[Database] Persistent volume /data detected: ${hasDataVolume}`);
console.log(`[Database] Connecting SQLite database at: ${dbPath}`);

// Ensure parent directories exist
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  try {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`[Database] Created persistent storage directory: ${dbDir}`);
  } catch (err) {
    console.error(`[Database] Failed to create persistent directory ${dbDir}:`, err);
  }
}

export const db = new Database(dbPath);

// Enable WAL mode for performance
db.pragma('journal_mode = WAL');

// Create tables if they do not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pixel_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    postback_token TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS clicks (
    click_id TEXT PRIMARY KEY,
    campaign TEXT,
    fbclid TEXT,
    utm_source TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS leads (
    phone TEXT PRIMARY KEY,
    first_message TEXT,
    click_id TEXT,
    utm_campaign TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(click_id) REFERENCES clicks(click_id)
  );

  CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    direction TEXT NOT NULL, -- 'incoming' or 'outgoing'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sales_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    postback_token TEXT,
    order_id TEXT,
    status TEXT, -- 'Pagamento Aprovado', 'Pix Gerado', etc.
    value REAL,
    phone TEXT,
    payload TEXT, -- Raw JSON
    lead_phone TEXT, -- Resolved clean phone matching lead
    fbclid TEXT,
    meta_status TEXT, -- 'success', 'failed', 'pending', 'skipped'
    meta_response TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
`);

// Safe migration to add ctwa_clid column to leads table if it doesn't exist
try {
  db.exec("ALTER TABLE leads ADD COLUMN ctwa_clid TEXT");
  console.log("[Database] Successfully added ctwa_clid column to leads table.");
} catch (e) {
  // Column already exists or error is expected if already added
}

// Types
export interface Product {
  id: number;
  name: string;
  pixel_id: string;
  access_token: string;
  postback_token: string;
  created_at: string;
}

export interface Click {
  click_id: string;
  campaign?: string;
  fbclid?: string;
  utm_source?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  ip?: string;
  user_agent?: string;
  created_at: string;
}

export interface Lead {
  phone: string;
  first_message?: string;
  click_id?: string;
  utm_campaign?: string;
  ctwa_clid?: string;
  created_at: string;
}

export interface WhatsAppMessage {
  id: number;
  phone: string;
  message: string;
  timestamp: string;
  direction: string;
  created_at: string;
}

export interface SalesEvent {
  id: number;
  product_id?: number;
  postback_token?: string;
  order_id?: string;
  status?: string;
  value?: number;
  phone?: string;
  payload?: string;
  lead_phone?: string;
  fbclid?: string;
  meta_status?: string;
  meta_response?: string;
  created_at: string;
  product_name?: string;
}

// Database Actions
export const dbActions = {
  // PRODUCTS
  createProduct(name: string, pixel_id: string, access_token: string, postback_token: string): Product {
    const stmt = db.prepare(`
      INSERT INTO products (name, pixel_id, access_token, postback_token)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(name, pixel_id, access_token, postback_token);
    return this.getProductById(Number(result.lastInsertRowid))!;
  },

  getProducts(): Product[] {
    const stmt = db.prepare('SELECT * FROM products ORDER BY id DESC');
    return stmt.all() as Product[];
  },

  getProductById(id: number): Product | null {
    const stmt = db.prepare('SELECT * FROM products WHERE id = ?');
    return (stmt.get(id) as Product) || null;
  },

  getProductByPostbackToken(token: string): Product | null {
    const stmt = db.prepare('SELECT * FROM products WHERE postback_token = ?');
    return (stmt.get(token) as Product) || null;
  },

  deleteProduct(id: number): void {
    const stmt = db.prepare('DELETE FROM products WHERE id = ?');
    stmt.run(id);
  },

  // CLICKS
  saveClick(click: Omit<Click, 'created_at'>): void {
    const stmt = db.prepare(`
      INSERT INTO clicks (click_id, campaign, fbclid, utm_source, utm_campaign, utm_content, utm_term, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      click.click_id,
      click.campaign || null,
      click.fbclid || null,
      click.utm_source || null,
      click.utm_campaign || null,
      click.utm_content || null,
      click.utm_term || null,
      click.ip || null,
      click.user_agent || null
    );
  },

  getClick(click_id: string): Click | null {
    const stmt = db.prepare('SELECT * FROM clicks WHERE click_id = ?');
    return (stmt.get(click_id) as Click) || null;
  },

  // LEADS
  getLeadByPhone(phone: string): Lead | null {
    const digitsOnly = phone.replace(/\D/g, '');
    if (!digitsOnly) return null;

    // 1. Try exact match
    let stmt = db.prepare('SELECT * FROM leads WHERE phone = ?');
    let lead = stmt.get(digitsOnly) as Lead | null;
    if (lead) return lead;

    // 2. Try suffix match (last 8 digits) to match regardless of country code or 9th digit addition
    if (digitsOnly.length >= 8) {
      const suffix = digitsOnly.slice(-8);
      stmt = db.prepare('SELECT * FROM leads WHERE phone LIKE ?');
      lead = stmt.get(`%${suffix}`) as Lead | null;
      if (lead) return lead;
    }

    return null;
  },

  saveLead(phone: string, first_message: string, click_id?: string, ctwa_clid?: string): Lead {
    // If click_id is provided, resolve campaign from the click
    let utm_campaign = '';
    if (click_id) {
      const click = this.getClick(click_id);
      if (click) {
        utm_campaign = click.utm_campaign || click.campaign || '';
      }
    }

    const existing = this.getLeadByPhone(phone);
    if (existing) {
      // Update first_message if not set, update click_id if provided, and update ctwa_clid if provided
      const stmt = db.prepare(`
        UPDATE leads 
        SET first_message = COALESCE(?, first_message),
            click_id = COALESCE(?, click_id),
            utm_campaign = COALESCE(NULLIF(?, ''), utm_campaign),
            ctwa_clid = COALESCE(?, ctwa_clid)
        WHERE phone = ?
      `);
      stmt.run(first_message || null, click_id || null, utm_campaign || null, ctwa_clid || null, phone);
      return this.getLeadByPhone(phone)!;
    } else {
      const stmt = db.prepare(`
        INSERT INTO leads (phone, first_message, click_id, utm_campaign, ctwa_clid)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(phone, first_message, click_id || null, utm_campaign || null, ctwa_clid || null);
      return this.getLeadByPhone(phone)!;
    }
  },

  getLeads(limit = 100): (Lead & { click_fbclid?: string })[] {
    const stmt = db.prepare(`
      SELECT l.*, c.fbclid as click_fbclid
      FROM leads l
      LEFT JOIN clicks c ON l.click_id = c.click_id
      ORDER BY l.created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as (Lead & { click_fbclid?: string })[];
  },

  // MESSAGES
  logMessage(phone: string, message: string, direction: 'incoming' | 'outgoing'): void {
    const stmt = db.prepare(`
      INSERT INTO whatsapp_messages (phone, message, timestamp, direction)
      VALUES (?, ?, datetime('now'), ?)
    `);
    stmt.run(phone, message, direction);
  },

  getMessages(phone: string, limit = 50): WhatsAppMessage[] {
    const stmt = db.prepare(`
      SELECT * FROM whatsapp_messages 
      WHERE phone = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    return stmt.all(phone, limit) as WhatsAppMessage[];
  },

  // SALES EVENTS
  saveSalesEvent(event: Omit<SalesEvent, 'id' | 'created_at'>): number {
    const stmt = db.prepare(`
      INSERT INTO sales_events (product_id, postback_token, order_id, status, value, phone, payload, lead_phone, fbclid, meta_status, meta_response)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      event.product_id || null,
      event.postback_token || null,
      event.order_id || null,
      event.status || null,
      event.value || 0,
      event.phone || null,
      event.payload || null,
      event.lead_phone || null,
      event.fbclid || null,
      event.meta_status || 'pending',
      event.meta_response || null
    );
    return Number(result.lastInsertRowid);
  },

  updateSalesEventMetaStatus(id: number, status: string, response: string): void {
    const stmt = db.prepare(`
      UPDATE sales_events
      SET meta_status = ?, meta_response = ?
      WHERE id = ?
    `);
    stmt.run(status, response, id);
  },

  getSalesEvents(filters?: { product_id?: number; status?: string; utm_campaign?: string }): SalesEvent[] {
    let query = `
      SELECT s.*, p.name as product_name, c.utm_campaign as click_utm_campaign, l.utm_campaign as lead_utm_campaign
      FROM sales_events s
      LEFT JOIN products p ON s.product_id = p.id
      LEFT JOIN leads l ON s.lead_phone = l.phone
      LEFT JOIN clicks c ON l.click_id = c.click_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.product_id) {
      query += ` AND s.product_id = ?`;
      params.push(filters.product_id);
    }
    if (filters?.status) {
      query += ` AND s.status = ?`;
      params.push(filters.status);
    }
    if (filters?.utm_campaign) {
      query += ` AND (c.utm_campaign = ? OR l.utm_campaign = ?)`;
      params.push(filters.utm_campaign, filters.utm_campaign);
    }

    query += ` ORDER BY s.created_at DESC`;

    const stmt = db.prepare(query);
    const results = stmt.all(...params) as any[];

    return results.map(r => ({
      ...r,
      // Normalize utm_campaign from either lead or click
      utm_campaign: r.click_utm_campaign || r.lead_utm_campaign || ''
    }));
  },

  // DASHBOARD STATISTICS
  getDashboardStats() {
    // Total clicks
    const clicksCount = (db.prepare('SELECT COUNT(*) as count FROM clicks').get() as { count: number }).count;

    // Total leads
    const leadsCount = (db.prepare('SELECT COUNT(*) as count FROM leads').get() as { count: number }).count;

    // Total leads with tracking (click_id exists)
    const trackedLeadsCount = (db.prepare('SELECT COUNT(*) as count FROM leads WHERE click_id IS NOT NULL AND click_id != ""').get() as { count: number }).count;

    // Total leads without tracking (click_id is NULL or empty)
    const untrackedLeadsCount = (db.prepare('SELECT COUNT(*) as count FROM leads WHERE click_id IS NULL OR click_id = ""').get() as { count: number }).count;

    // Total CTWA leads (has ctwa_clid but no click_id)
    const ctwaLeadsCount = (db.prepare('SELECT COUNT(*) as count FROM leads WHERE ctwa_clid IS NOT NULL AND ctwa_clid != "" AND (click_id IS NULL OR click_id = "")').get() as { count: number }).count;

    // Total organic/untracked leads (neither click_id nor ctwa_clid exists)
    const organicLeadsCount = (db.prepare('SELECT COUNT(*) as count FROM leads WHERE (click_id IS NULL OR click_id = "") AND (ctwa_clid IS NULL OR ctwa_clid = "")').get() as { count: number }).count;

    // Total approved sales count
    const approvedSalesCount = (db.prepare("SELECT COUNT(*) as count FROM sales_events WHERE status = 'Pagamento Aprovado'").get() as { count: number }).count;

    // Total revenue from approved sales
    const approvedSalesRevenue = (db.prepare("SELECT SUM(value) as total FROM sales_events WHERE status = 'Pagamento Aprovado'").get() as { total: number | null }).total || 0;

    // Calculate Conversion Rate: Approved sales / Leads (conversa iniciada no WhatsApp)
    const conversionRate = leadsCount > 0 ? (approvedSalesCount / leadsCount) * 100 : 0;

    return {
      clicksCount,
      leadsCount,
      trackedLeadsCount,
      untrackedLeadsCount,
      ctwaLeadsCount,
      organicLeadsCount,
      approvedSalesCount,
      approvedSalesRevenue,
      conversionRate
    };
  }
};
