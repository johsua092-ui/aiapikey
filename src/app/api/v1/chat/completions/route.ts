import { NextRequest } from 'next/server';
import { db } from '@/../lib/firebase';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';

export const maxDuration = 60; // Allow up to 60 seconds for Vercel Hobby

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
    
    // Support custom model names dari request user (misal: gpt-5, claude-opus-4.7)
    // Kalo kosong, default ke claude-opus-4-8
    const model = body.model || 'claude-opus-4-8'; 
    const messages = body.messages || [];

    // Update usage stats early (fire and forget)
    updateDoc(keyRef, {
      requestCount: increment(1),
      lastUsedAt: new Date().toISOString()
    }).catch(console.error);

    const encoder = new TextEncoder();
    
    // 3. Create a custom ReadableStream to bypass Vercel timeouts
    // This stream sends an invisible space every 5 seconds while waiting for the upstream API
    const stream = new ReadableStream({
      async start(controller) {
        // Ping immediately so Vercel knows the response has started
        controller.enqueue(encoder.encode(' '));
        
        // Keep pinging every 5 seconds
        const pingInterval = setInterval(() => {
          controller.enqueue(encoder.encode(' '));
        }, 5000);

        try {
          const fetchResponse = await fetch(MASTER_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.PANEL_API_KEY || ''}`,
            },
            body: JSON.stringify({
              model,
              messages,
              max_tokens: body.max_tokens || 4096,
              stream: body.stream !== false,
            }),
          });

          clearInterval(pingInterval);

          if (!fetchResponse.ok) {
            const errorText = await fetchResponse.text();
            controller.enqueue(encoder.encode(JSON.stringify({ error: `Upstream API Error: ${fetchResponse.status}`, details: errorText })));
            controller.close();
            return;
          }

          if (fetchResponse.body) {
            const reader = fetchResponse.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          }
          controller.close();
        } catch (error: any) {
          clearInterval(pingInterval);
          controller.enqueue(encoder.encode(JSON.stringify({ error: 'Gateway Fetch Error', details: error.message })));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('Gateway error:', error);
    return new Response(
      JSON.stringify({ error: 'Gateway Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
