const fs = require('fs-extra');
const path = require('path');
const { db } = require('./database');

class TranscriptManager {
  constructor() {
    this.transcriptDir = './transcripts';
    this.ensureDirectory();
  }

  ensureDirectory() {
    if (!fs.existsSync(this.transcriptDir)) {
      fs.mkdirSync(this.transcriptDir, { recursive: true });
    }
  }

  async generateTranscript(channel, ticketData) {
    const messages = await db.getMessages(ticketData.id);
    const ticketId = ticketData.id;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `transcript-${ticketId}-${timestamp}.html`;
    const filepath = path.join(this.transcriptDir, filename);

    const channelMessages = await channel.messages.fetch({ limit: 100 });
    const sortedMessages = Array.from(channelMessages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    let html = this.generateHTML(sortedMessages, ticketData, channel);
    
    await fs.writeFile(filepath, html);
    
    const textContent = this.generateText(sortedMessages, ticketData);
    const textFilename = `transcript-${ticketId}-${timestamp}.txt`;
    const textFilepath = path.join(this.transcriptDir, textFilename);
    await fs.writeFile(textFilepath, textContent);

    return { html: filepath, text: textFilepath, filename, textFilename };
  }

  generateHTML(messages, ticketData, channel) {
    const header = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ticket Transcript #${ticketData.id} - Kōve</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #36393f; color: #dcddde; margin: 0; padding: 20px; }
        .header { background: #2f3136; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #5865f2; }
        .message { background: #2f3136; margin: 10px 0; padding: 15px; border-radius: 8px; border-left: 3px solid #5865f2; }
        .message-header { display: flex; align-items: center; margin-bottom: 8px; }
        .avatar { width: 40px; height: 40px; border-radius: 50%; margin-right: 12px; }
        .author { font-weight: bold; color: #fff; margin-right: 10px; }
        .timestamp { color: #72767d; font-size: 0.85em; }
        .content { margin-left: 52px; line-height: 1.5; }
        .attachment { margin-top: 8px; margin-left: 52px; }
        .attachment img { max-width: 400px; border-radius: 4px; }
        .embed { background: #2f3136; border-left: 4px solid #5865f2; padding: 10px; margin: 8px 0; margin-left: 52px; border-radius: 4px; }
        .system { color: #72767d; font-style: italic; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎫 Ticket Transcript #${ticketData.id}</h1>
        <p><strong>Channel:</strong> #${channel.name}</p>
        <p><strong>Created by:</strong> <@${ticketData.user_id}> (${ticketData.user_id})</p>
        <p><strong>Category:</strong> ${ticketData.category}</p>
        <p><strong>Claimed by:</strong> ${ticketData.claimed_by ? `<@${ticketData.claimed_by}>` : 'Unclaimed'}</p>
        <p><strong>Created at:</strong> ${new Date(ticketData.created_at).toLocaleString()}</p>
        <p><strong>Closed at:</strong> ${ticketData.closed_at ? new Date(ticketData.closed_at).toLocaleString() : 'N/A'}</p>
    </div>
    <div class="messages">
`;

    const messageHtml = messages.map(msg => {
      const time = new Date(msg.createdTimestamp).toLocaleString();
      const attachments = msg.attachments.map(att => 
        att.contentType?.startsWith('image/') 
          ? `<div class="attachment"><img src="${att.url}" alt="${att.name}"></div>`
          : `<div class="attachment"><a href="${att.url}" style="color: #00b0f4;">📎 ${att.name}</a></div>`
      ).join('');

      const embeds = msg.embeds.map(embed => {
        let embedHtml = `<div class="embed" style="border-color: #${embed.color?.toString(16) || '5865f2'}">`;
        if (embed.title) embedHtml += `<div style="font-weight: bold; margin-bottom: 5px;">${embed.title}</div>`;
        if (embed.description) embedHtml += `<div>${embed.description}</div>`;
        embedHtml += '</div>';
        return embedHtml;
      }).join('');

      return `
        <div class="message">
            <div class="message-header">
                <img src="${msg.author.displayAvatarURL()}" alt="" class="avatar">
                <span class="author" style="color: ${msg.member?.roles.highest.color ? '#' + msg.member.roles.highest.color.toString(16) : '#fff'}">${msg.author.tag}</span>
                <span class="timestamp">${time}</span>
            </div>
            <div class="content">${msg.content || '<span class="system">[No text content]</span>'}</div>
            ${attachments}
            ${embeds}
        </div>
`;
    }).join('');

    const footer = `
    </div>
</body>
</html>`;

    return header + messageHtml + footer;
  }

  generateText(messages, ticketData) {
    let text = `=== TICKET TRANSCRIPT #${ticketData.id} ===\n`;
    text += `Created by: ${ticketData.user_id}\n`;
    text += `Category: ${ticketData.category}\n`;
    text += `Created at: ${ticketData.created_at}\n`;
    text += `=====================================\n\n`;

    messages.forEach(msg => {
      const time = new Date(msg.createdTimestamp).toLocaleString();
      text += `[${time}] ${msg.author.tag}: ${msg.content}\n`;
      if (msg.attachments.size > 0) {
        msg.attachments.forEach(att => {
          text += `  [Attachment: ${
