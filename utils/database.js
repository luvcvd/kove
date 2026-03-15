const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Standard hosting - use local data directory
const dataDir = './data';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'tickets.db'));

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT UNIQUE,
    guild_id TEXT,
    user_id TEXT,
    category TEXT,
    status TEXT DEFAULT 'open',
    claimed_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    closed_by TEXT,
    transcript_url TEXT
  );

  CREATE TABLE IF NOT EXISTS ticket_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER,
    message_id TEXT,
    author_id TEXT,
    author_tag TEXT,
    content TEXT,
    attachments TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    guild_id TEXT PRIMARY KEY,
    ticket_category TEXT,
    transcript_channel TEXT,
    staff_role TEXT,
    max_tickets INTEGER DEFAULT 3,
    welcome_message TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
`);

module.exports = {
  db,
  
  createTicket: (channelId, guildId, userId, category) => {
    const stmt = db.prepare('INSERT INTO tickets (channel_id, guild_id, user_id, category) VALUES (?, ?, ?, ?)');
    return stmt.run(channelId, guildId, userId, category);
  },

  getTicket: (channelId) => {
    return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
  },

  getUserTickets: (userId, status = 'open') => {
    return db.prepare('SELECT * FROM tickets WHERE user_id = ? AND status = ?').all(userId, status);
  },

  claimTicket: (channelId, staffId) => {
    const stmt = db.prepare('UPDATE tickets SET claimed_by = ? WHERE channel_id = ?');
    return stmt.run(staffId, channelId);
  },

  closeTicket: (channelId, closedBy, transcriptUrl = null) => {
    const stmt = db.prepare('UPDATE tickets SET status = ?, closed_at = CURRENT_TIMESTAMP, closed_by = ?, transcript_url = ? WHERE channel_id = ?');
    return stmt.run('closed', closedBy, transcriptUrl, channelId);
  },

  deleteTicket: (channelId) => {
    const stmt = db.prepare('DELETE FROM tickets WHERE channel_id = ?');
    return stmt.run(channelId);
  },

  logMessage: (ticketId, messageId, authorId, authorTag, content, attachments) => {
    const stmt = db.prepare('INSERT INTO ticket_messages (ticket_id, message_id, author_id, author_tag, content, attachments) VALUES (?, ?, ?, ?, ?, ?)');
    return stmt.run(ticketId, messageId, authorId, authorTag, content, JSON.stringify(attachments));
  },

  getMessages: (ticketId) => {
    return db.prepare('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC').all(ticketId);
  },

  setSettings: (guildId, settings) => {
    const stmt = db.prepare(`
      INSERT INTO settings (guild_id, ticket_category, transcript_channel, staff_role, max_tickets, welcome_message)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        ticket_category = excluded.ticket_category,
        transcript_channel = excluded.transcript_channel,
        staff_role = excluded.staff_role,
        max_tickets = excluded.max_tickets,
        welcome_message = excluded.welcome_message
    `);
    return stmt.run(guildId, settings.category, settings.transcript, settings.staff, settings.max, settings.welcome);
  },

  getSettings: (guildId) => {
    return db.prepare('SELECT * FROM settings WHERE guild_id = ?').get(guildId);
  }
};
