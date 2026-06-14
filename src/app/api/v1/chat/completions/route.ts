import { NextRequest } from 'next/server';
import { db } from '@/../lib/firebase';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';

const MASTER_API_URL = 'https://panelnya.online/v1/chat/completions';

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate custom API key
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = authHeader.split('Bearer ')[1].trim();
    
    // For local dev/testing, we might allow a master bypass
    // But for production, we verify against Firestore
    const keyRef = doc(db, 'api_keys', apiKey);
    const keySnap = await getDoc(keyRef);
    
    if (!keySnap.exists() || !keySnap.data().active) {
      return new Response(JSON.stringify({ error: 'Invalid or inactive API key' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse request
    const body = await req.json();
    
    // We only support claude-opus-4.8 for now as per user request
    const model = 'claude-opus-4-8'; 
    const messages = body.messages || [];

    // 3. Proxy to the Master API
    const response = await fetch(MASTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.PANEL_API_KEY || ''}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: body.max_tokens || 4096,
        stream: body.stream !== false, // Default to streaming
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: `Upstream API Error: ${response.status}`, details: errorText }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Update usage stats (fire and forget)
    updateDoc(keyRef, {
      requestCount: increment(1),
      lastUsedAt: new Date().toISOString()
    }).catch(console.error);

    // 4. Return the response stream to the client
    // Copy the response headers but ensure it's an event stream
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'text/event-stream');
    headers.set('Cache-Control', 'no-cache');
    headers.set('Connection', 'keep-alive');

    return new Response(response.body, {
      status: response.status,
      headers,
    });

  } catch (error: any) {
    console.error('Gateway error:', error);
    return new Response(
      JSON.stringify({ error: 'Gateway Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
