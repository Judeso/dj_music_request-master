// netlify/functions/events.js
import { sql } from './db.js';
import { randomUUID } from 'node:crypto';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

async function ensureTables() {
  // Create tables if they don't exist (idempotent)
  // Quick connectivity probe
  await sql`SELECT 1 as ok`;
  await sql`
    CREATE TABLE IF NOT EXISTS events (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      date timestamptz NOT NULL,
      status text DEFAULT 'preparation',
      location text,
      expected_guests int,
      description text,
      short_code text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS requests (
      id uuid PRIMARY KEY,
      event_id uuid REFERENCES events(id) ON DELETE CASCADE,
      song_title text NOT NULL,
      artist text NOT NULL,
      user_name text NOT NULL,
      user_id uuid,
      status text DEFAULT 'pending',
      timestamp timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `;
}

export default async (request, context) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  try {
    // Ensure DB config exists
    const dbUrl = (typeof process !== 'undefined') && (process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL);
    if (!dbUrl) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Database not configured. Set DATABASE_URL (or NETLIFY_DATABASE_URL) in Netlify environment variables.'
      }), { status: 503, headers });
    }

    // Auto-migrate tables
    try {
      await ensureTables();
    } catch (e) {
      console.error('ensureTables failed:', e);
      return new Response(JSON.stringify({
        success: false,
        error: 'Database init failed',
        details: e && (e.message || String(e))
      }), { status: 500, headers });
    }

    if (request.method === "GET") {
      // Récupère tous les events
      const rows = await sql`SELECT * FROM events ORDER BY date DESC`;
      return new Response(JSON.stringify({ success: true, data: rows }), { 
        status: 200, 
        headers 
      });
    }

    if (request.method === "POST") {
      const body = await request.json();
      
      // Validation des données
      if (!body.name || !body.date) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Nom et date de l'événement requis" 
        }), { status: 400, headers });
      }

      const id = randomUUID();
      const now = new Date().toISOString();
      const status = body.status ?? 'preparation';
      const [newEvent] = await sql`
        INSERT INTO events (
          id, name, date, status, location, expected_guests, description, short_code, created_at, updated_at
        ) VALUES (
          ${id}, ${body.name}, ${body.date}, ${status}, ${body.location ?? null}, ${body.expectedGuests ?? null},
          ${body.description ?? null}, ${body.shortCode ?? null}, ${now}, ${body.updatedAt ?? now}
        )
        RETURNING *;
      `;
      return new Response(JSON.stringify({ success: true, data: newEvent }), { 
        status: 201, 
        headers 
      });
    }

    if (request.method === "PUT") {
      const body = await request.json();
      const url = new URL(request.url);
      const eventId = url.pathname.split('/').pop();

      if (!eventId) {
        return new Response(JSON.stringify({ success: false, error: "ID d'événement manquant" }), { status: 400, headers });
      }

      // Construire dynamiquement les champs à mettre à jour selon les colonnes probables
      // Nous mettons à jour prudemment: name, date, status, location, expected_guests, description, updated_at, short_code
      const fields = [];
      const values = [];

      if (body.name != null) { fields.push(sql`name = ${body.name}`); }
      if (body.date != null) { fields.push(sql`date = ${body.date}`); }
      if (body.status != null) { fields.push(sql`status = ${body.status}`); }
      if (body.location != null) { fields.push(sql`location = ${body.location}`); }
      if (body.expectedGuests != null) { fields.push(sql`expected_guests = ${body.expectedGuests}`); }
      if (body.description != null) { fields.push(sql`description = ${body.description}`); }
      if (body.shortCode != null) { fields.push(sql`short_code = ${body.shortCode}`); }
      // Toujours mettre à jour updated_at si possible
      fields.push(sql`updated_at = ${body.updatedAt || new Date().toISOString()}`);

      if (fields.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'Aucune donnée à mettre à jour' }), { status: 400, headers });
      }

      const [updated] = await sql`
        UPDATE events
        SET ${sql.join(fields, sql`, `)}
        WHERE id = ${eventId}
        RETURNING *;
      `;

      return new Response(JSON.stringify({ success: true, data: updated }), { status: 200, headers });
    }

    if (request.method === "DELETE") {
      const url = new URL(request.url);
      const eventId = url.pathname.split('/').pop();

      if (!eventId) {
        return new Response(JSON.stringify({ success: false, error: "ID d'événement manquant" }), { status: 400, headers });
      }

      // Supprimer d'abord les demandes liées (si pas de cascade en base)
      try {
        await sql`DELETE FROM requests WHERE event_id = ${eventId}`;
      } catch (e) {
        // Ignorer si la table/contrainte n'existe pas
      }

      const result = await sql`DELETE FROM events WHERE id = ${eventId} RETURNING id`;
      if (result.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'Événement introuvable' }), { status: 404, headers });
      }

      return new Response(JSON.stringify({ success: true, data: { id: eventId } }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ 
      success: false, 
      error: "Méthode non supportée" 
    }), { status: 405, headers });

  } catch (err) {
    console.error('Events API Error:', err);
    return new Response(JSON.stringify({ 
      success: false, 
      error: err && (err.message || String(err)),
      stack: err && err.stack ? err.stack : undefined
    }), { status: 500, headers });
  }
};
