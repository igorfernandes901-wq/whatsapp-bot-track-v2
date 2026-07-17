import crypto from 'crypto';
import { dbActions } from './db.js';

// Helper to calculate SHA-256 hash of a string
export function sha256(text: string): string {
  if (!text) return '';
  // Trim, lower case and hash
  const cleaned = text.trim().toLowerCase();
  return crypto.createHash('sha256').update(cleaned).digest('hex');
}

// Helper to clean and format phone number for Meta (must be digits only with country code, e.g. 5511999999999)
export function cleanPhoneForMeta(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, ''); // Keep only digits
  
  // If the number doesn't have a country code, and looks like a Brazilian phone, prepend '55'
  if (cleaned.length === 11 || cleaned.length === 10) {
    cleaned = '55' + cleaned;
  }
  
  return cleaned;
}

interface MetaEventResult {
  success: boolean;
  message: string;
  responsePayload?: any;
}

/**
 * Send server-side Purchase event to Meta Conversions API
 */
export async function sendMetaPurchaseEvent(
  productId: number,
  salesEventId: number,
  orderId: string,
  value: number,
  phone: string,
  fbclid?: string,
  ip?: string,
  userAgent?: string,
  email?: string,
  name?: string,
  testEventCode?: string
): Promise<MetaEventResult> {
  console.log(`[Meta API] Initiating Purchase event for Product ID: ${productId}, Order: ${orderId}, Value: ${value}${testEventCode ? `, Test Code: ${testEventCode}` : ''}`);

  try {
    const product = dbActions.getProductById(productId);
    if (!product) {
      const errMsg = `Product not found with ID ${productId}`;
      console.error(`[Meta API] ${errMsg}`);
      dbActions.updateSalesEventMetaStatus(salesEventId, 'failed', errMsg);
      return { success: false, message: errMsg };
    }

    const { pixel_id: pixelId, access_token: accessToken } = product;

    if (!pixelId || !accessToken) {
      const errMsg = 'Missing Pixel ID or Access Token in product configuration';
      console.error(`[Meta API] ${errMsg}`);
      dbActions.updateSalesEventMetaStatus(salesEventId, 'failed', errMsg);
      return { success: false, message: errMsg };
    }

    // Clean and hash phone number
    const formattedPhone = cleanPhoneForMeta(phone);
    const hashedPhone = sha256(formattedPhone);

    // Clean and hash email
    const hashedEmail = email ? sha256(email.trim().toLowerCase()) : '';

    // Clean and hash first and last name
    let hashedFirstName = '';
    let hashedLastName = '';
    if (name) {
      const parts = name.trim().split(/\s+/);
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || '';
      if (firstName) {
        hashedFirstName = sha256(firstName);
      }
      if (lastName) {
        hashedLastName = sha256(lastName);
      }
    }

    // Format event_time in seconds (Unix epoch time)
    const eventTime = Math.floor(Date.now() / 1000);

    // Construct fbc parameter (Facebook Click ID) if fbclid is present
    // Complies with Meta's fbc format: fb.1.{unix_time_ms}.{fbclid}
    let fbc: string | undefined = undefined;
    if (fbclid) {
      fbc = `fb.1.${Date.now()}.${fbclid}`;
    }

    // Event Payload
    const eventData = {
      event_name: 'Purchase',
      event_time: eventTime,
      event_id: orderId, // Deduplication ID
      action_source: 'website',
      user_data: {
        ph: [hashedPhone],
        ...(hashedEmail ? { em: [hashedEmail] } : {}),
        ...(hashedFirstName ? { fn: [hashedFirstName] } : {}),
        ...(hashedLastName ? { ln: [hashedLastName] } : {}),
        ...(fbc ? { fbc } : {}),
        ...(ip ? { client_ip_address: ip } : {}),
        ...(userAgent ? { client_user_agent: userAgent } : {})
      },
      custom_data: {
        value: Number(value),
        currency: 'BRL'
      }
    };

    const requestPayload = {
      data: [eventData],
      ...(testEventCode ? { test_event_code: testEventCode } : {})
    };

    console.log(`[Meta API] Dispatching Conversions API request to Pixel: ${pixelId}...`);
    
    const url = `https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${accessToken}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });

    const textResponse = await response.text();
    let jsonResponse: any = null;
    
    try {
      jsonResponse = JSON.parse(textResponse);
    } catch (e) {
      console.warn('[Meta API] Meta API response was not valid JSON:', textResponse);
    }

    if (response.ok && jsonResponse?.events_received > 0) {
      console.log(`[Meta API] Successfully tracked Purchase event for order ${orderId} in Meta!`);
      dbActions.updateSalesEventMetaStatus(
        salesEventId,
        'success',
        JSON.stringify(jsonResponse)
      );
      return { success: true, message: 'Event recorded successfully in Meta', responsePayload: jsonResponse };
    } else {
      console.error(`[Meta API] Meta API returned an error:`, textResponse);
      dbActions.updateSalesEventMetaStatus(
        salesEventId,
        'failed',
        textResponse
      );
      return { success: false, message: `Meta API Error: ${textResponse}`, responsePayload: jsonResponse };
    }

  } catch (err: any) {
    console.error(`[Meta API] Exception during Meta event dispatch:`, err);
    dbActions.updateSalesEventMetaStatus(
      salesEventId,
      'failed',
      err?.message || 'Unknown Exception'
    );
    return { success: false, message: err?.message || 'Unknown Exception' };
  }
}
