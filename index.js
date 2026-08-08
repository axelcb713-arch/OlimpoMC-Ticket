require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
  AttachmentBuilder,
} = require("discord.js");
const { ticketCategories, transferCategories, REPORTS_STAFF_ROLE_ID, OWNER_ROLE_ID } = require("./config");
 
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
 
// --- Configuración por variables de entorno ---
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID;
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || null;
const PANEL_IMAGE_URL = process.env.PANEL_IMAGE_URL || null;
const TRANSCRIPT_CHANNEL_ID = process.env.TRANSCRIPT_CHANNEL_ID || null;
const MANAGEMENT_CHANNEL_ID = process.env.MANAGEMENT_CHANNEL_ID || null;
const MANAGEMENT_ROLE_ID = process.env.MANAGEMENT_ROLE_ID || null;
const STATS_LOG_CHANNEL_ID = process.env.STATS_LOG_CHANNEL_ID || null;
const NOTES_CHANNEL_ID = process.env.NOTES_CHANNEL_ID || null;
const HEAD_STAFF_ROLE_ID = process.env.HEAD_STAFF_ROLE_ID || null;
const BLACKLIST_ROLE_ID = process.env.BLACKLIST_ROLE_ID || null;
const FOUNDER_ROLE_ID = process.env.FOUNDER_ROLE_ID || null;
const CO_OWNER_ROLE_ID = process.env.CO_OWNER_ROLE_ID || null;
const BLACKLIST_MANAGER_ROLE_IDS = [HEAD_STAFF_ROLE_ID, FOUNDER_ROLE_ID, OWNER_ROLE_ID, CO_OWNER_ROLE_ID].filter(
  Boolean
);
 
const STAFF_REMINDER_MINUTES = 25;
const MANAGEMENT_ALERT_MINUTES = 30;
const INACTIVITY_HOURS = 10;
const INACTIVITY_CHECK_INTERVAL_MINUTES = 15;
const TICKET_COOLDOWN_SECONDS = 60;
 
// --- Estado en memoria ---
const ticketReminders = new Map(); // channelId -> { staffTimeout, managementTimeout, roleId }
const ticketLastOwnerActivity = new Map(); // channelId -> timestamp del último mensaje del dueño
const ticketCooldowns = new Map(); // userId -> timestamp hasta el que debe esperar
const ticketClaims = new Map(); // channelId -> { id, tag }
const ticketNumbers = new Map(); // channelId -> número de ticket
const processingLocks = new Set(); // claves "accion:channelId" en proceso
let ticketCounter = 0;
 
function tryLock(key) {
  if (processingLocks.has(key)) return false;
  processingLocks.add(key);
  return true;
}
function unlock(key) {
  processingLocks.delete(key);
}
 
function padNum(n) {
  return String(n).padStart(4, "0");
}
 
// --- Recordatorios de "sin respuesta" (staff + escalado a management) ---
 
function clearTicketReminder(channelId) {
  const info = ticketReminders.get(channelId);
  if (info) {
    clearTimeout(info.staffTimeout);
    if (info.managementTimeout) clearTimeout(info.managementTimeout);
  }
  ticketReminders.delete(channelId);
}
 
function scheduleTicketReminder(channel, roleId) {
  clearTicketReminder(channel.id);
 
  const staffTimeout = setTimeout(async () => {
    try {
      const ch = await client.channels.fetch(channel.id).catch(() => null);
      if (!ch) return;
      await ch.send(
        `⏰ <@&${roleId}> este ticket lleva más de ${STAFF_REMINDER_MINUTES} minutos sin respuesta del staff.`
      );
    } catch (err) {
      console.error("No se pudo enviar el recordatorio del ticket:", err);
    }
  }, STAFF_REMINDER_MINUTES * 60 * 1000);
 
  let managementTimeout = null;
  if (MANAGEMENT_CHANNEL_ID) {
    managementTimeout = setTimeout(async () => {
      try {
        const ch = await client.channels.fetch(channel.id).catch(() => null);
        if (!ch) return;
        const mgmtChannel = await client.channels.fetch(MANAGEMENT_CHANNEL_ID).catch(() => null);
        if (!mgmtChannel) return;
        await mgmtChannel.send(
          `🚨 ${MANAGEMENT_ROLE_ID ? `<@&${MANAGEMENT_ROLE_ID}> ` : ""}el ticket ${ch} lleva más de ${MANAGEMENT_ALERT_MINUTES} minutos sin respuesta del staff.`
        );
      } catch (err) {
        console.error("No se pudo enviar la alerta a management:", err);
      } finally {
        ticketReminders.delete(channel.id);
      }
    }, MANAGEMENT_ALERT_MINUTES * 60 * 1000);
  }
 
  ticketReminders.set(channel.id, { staffTimeout, managementTimeout, roleId });
}
 
// --- Helpers de tickets ---
 
function isTicketChannel(channel) {
  return Boolean(channel && channel.topic && channel.topic.includes(":"));
}
 
function isStaffInChannel(interaction) {
  return interaction.member
    .permissionsIn(interaction.channel)
    .has(PermissionFlagsBits.ManageChannels);
}
 
function isTicketOwner(interaction) {
  const topic = interaction.channel.topic || "";
  return topic.split(":")[0] === interaction.user.id;
}
 
function isBlacklisted(member) {
  return Boolean(BLACKLIST_ROLE_ID && member.roles.cache.has(BLACKLIST_ROLE_ID));
}
 
function sanitizeName(str) {
  return str.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");
}
 
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
 
async function generateTranscript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = Array.from(messages.values()).reverse();
 
  const rows = sorted
    .map((msg) => {
      const time = msg.createdAt.toLocaleString("es-CO");
      const author = escapeHtml(msg.author.tag);
      const avatarLetter = escapeHtml(msg.author.username.charAt(0).toUpperCase());
      const content = msg.content
        ? escapeHtml(msg.content).replace(/\n/g, "<br>")
        : "<i>[sin texto — embed/adjunto]</i>";
      const attachmentsHtml = msg.attachments.size
        ? `<div class="attachments">📎 ${msg.attachments.size} adjunto(s)</div>`
        : "";
      return `<div class="message">
        <div class="avatar">${avatarLetter}</div>
        <div class="message-body">
          <div class="message-header">
            <span class="author">${author}</span>
            <span class="timestamp">${time}</span>
          </div>
          <div class="content">${content}</div>
          ${attachmentsHtml}
        </div>
      </div>`;
    })
    .join("\n");
 
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Transcript de #${escapeHtml(channel.name)}</title>
<style>
  body { background:#313338; color:#dbdee1; font-family: 'gg sans', 'Helvetica Neue', Arial, sans-serif; margin:0; padding:24px; }
  h1 { color:#fff; font-size:20px; border-bottom:1px solid #3f4147; padding-bottom:12px; }
  .message { display:flex; gap:16px; padding:10px 0; border-bottom:1px solid #2b2d31; }
  .avatar { width:40px; height:40px; border-radius:50%; background:#5865f2; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold; flex-shrink:0; }
  .message-header { display:flex; align-items:baseline; gap:8px; }
  .author { color:#fff; font-weight:600; }
  .timestamp { color:#949ba4; font-size:12px; }
  .content { margin-top:2px; white-space:pre-wrap; word-break:break-word; }
  .attachments { color:#949ba4; font-size:13px; margin-top:4px; }
</style>
</head>
<body>
  <h1>📄 Transcript de #${escapeHtml(channel.name)} — ${sorted.length} mensajes</h1>
  ${rows}
</body>
</html>`;
 
  const attachment = new AttachmentBuilder(Buffer.from(html, "utf-8"), {
    name: `transcript-${channel.name}.html`,
  });
 
  return { attachment, count: sorted.length };
}
 
// --- Log de estadísticas (usa un canal de Discord como "base de datos" simple) ---
 
const STAT_USER_FIELDS = ["owner", "staff", "closedBy"];
const STAT_CHANNEL_FIELDS = ["channel"];
 
async function logStat(type, fields) {
  if (!STATS_LOG_CHANNEL_ID) return;
  try {
    const channel = await client.channels.fetch(STATS_LOG_CHANNEL_ID).catch(() => null);
    if (!channel) return;
    const parts = [
      type,
      ...Object.entries(fields).map(([k, v]) => {
        if (STAT_USER_FIELDS.includes(k) && v && v !== "none" && v !== "auto") return `${k}=<@${v}>`;
        if (STAT_CHANNEL_FIELDS.includes(k) && v) return `${k}=<#${v}>`;
        return `${k}=${v}`;
      }),
    ];
    await channel.send(parts.join("|"));
  } catch (err) {
    console.error("No se pudo escribir en el log de stats:", err);
  }
}
 
function parseLogLine(content) {
  const parts = content.split("|");
  const type = parts[0];
  if (!["CREATE", "CLAIM", "CLOSE", "RATING"].includes(type)) return null;
  const obj = { type };
  for (let i = 1; i < parts.length; i++) {
    const eqIdx = parts[i].indexOf("=");
    if (eqIdx === -1) continue;
    const k = parts[i].slice(0, eqIdx);
    const rawValue = parts[i].slice(eqIdx + 1);
    const v = rawValue.replace(/^<[@#]!?/, "").replace(/>$/, "");
    if (k) obj[k] = v;
  }
  return obj;
}
 
async function fetchAllLogEntries(channel, maxMessages = 2000) {
  const entries = [];
  let lastId;
  while (entries.length < maxMessages) {
    const batch = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
    if (!batch || batch.size === 0) break;
    for (const msg of batch.values()) {
      const parsed = parseLogLine(msg.content);
      if (parsed) entries.push(parsed);
    }
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }
  return entries;
}
 
async function initTicketCounter() {
  if (!STATS_LOG_CHANNEL_ID) return;
  try {
    const channel = await client.channels.fetch(STATS_LOG_CHANNEL_ID).catch(() => null);
    if (!channel) return;
    const entries = await fetchAllLogEntries(channel);
    ticketCounter = entries.filter((e) => e.type === "CREATE").length;
    console.log(`Contador de tickets inicializado en ${ticketCounter}`);
  } catch (err) {
    console.error("No se pudo inicializar el contador de tickets:", err);
  }
}
 
// --- Calificación al cerrar ---
 
async function sendRatingRequest(user, channel, claim) {
  const row = new ActionRowBuilder().addComponents(
    [1, 2, 3, 4, 5].map((n) =>
      new ButtonBuilder()
        .setCustomId(`rate_${n}_${channel.id}_${claim ? claim.id : "none"}`)
        .setLabel("⭐".repeat(n))
        .setStyle(ButtonStyle.Secondary)
    )
  );
  await user.send({
    content: `¿Cómo calificarías la atención en tu ticket **#${channel.name}** de OlimpoMC?`,
    components: [row],
  });
}
 
// --- Cierre de tickets (compartido entre /close, botón Delete y auto-cierre) ---
 
async function closeTicketChannel(channel, { closedById, outcome }) {
  clearTicketReminder(channel.id);
  ticketLastOwnerActivity.delete(channel.id);
 
  const claim = ticketClaims.get(channel.id) || null;
  const ownerId = channel.topic ? channel.topic.split(":")[0] : null;
 
  let transcript = null;
  if (TRANSCRIPT_CHANNEL_ID || ownerId) {
    try {
      transcript = await generateTranscript(channel);
    } catch (err) {
      console.error("No se pudo generar el transcript:", err);
    }
  }
 
  if (transcript && TRANSCRIPT_CHANNEL_ID) {
    try {
      const logChannel = await client.channels.fetch(TRANSCRIPT_CHANNEL_ID).catch(() => null);
      if (logChannel) {
        await logChannel.send({
          content: `📄 Transcript de **#${channel.name}** — cerrado por ${
            closedById ? `<@${closedById}>` : "inactividad"
          }${ownerId ? ` | dueño: <@${ownerId}>` : ""}`,
          files: [transcript.attachment],
        });
      }
    } catch (err) {
      console.error("No se pudo enviar el transcript al canal de logs:", err);
    }
  }
 
  if (transcript && ownerId) {
    try {
      const ownerUser = await client.users.fetch(ownerId);
      await ownerUser.send({
        content: `📄 Aquí está el transcript de tu ticket **#${channel.name}** en OlimpoMC.`,
        files: [transcript.attachment],
      });
    } catch (err) {
      console.error("No se pudo enviar el transcript por DM al usuario:", err);
    }
  }
 
  if (transcript) {
    await channel.send(`✅ Exported ${transcript.count} messages.`).catch(() => {});
  }
 
  await logStat("CLOSE", {
    channel: channel.id,
    closedBy: closedById || "auto",
    staff: claim ? claim.id : "none",
    outcome,
  });
 
  if (ownerId) {
    try {
      const ownerUser = await client.users.fetch(ownerId);
      await sendRatingRequest(ownerUser, channel, claim);
    } catch (err) {
      console.error("No se pudo enviar la solicitud de calificación:", err);
    }
  }
 
  ticketClaims.delete(channel.id);
  ticketNumbers.delete(channel.id);
 
  setTimeout(() => {
    channel.delete().catch(() => {});
  }, 10000);
}
 
async function handleTicketClose(interaction) {
  const lockKey = `close:${interaction.channel.id}`;
  if (!tryLock(lockKey)) {
    await interaction.reply({ content: "Ya se está procesando el cierre de este ticket.", ephemeral: true });
    return;
  }
  try {
    const embed = new EmbedBuilder()
      .setTitle("🗄️ Guardando logs...")
      .setDescription(
        "El ticket se cerrará en menos de 10 segundos. Activa tus mensajes privados para poder recibir los logs."
      )
      .setColor(0xed4245)
      .setFooter({ text: interaction.user.tag });
    await interaction.reply({ embeds: [embed] });
    await closeTicketChannel(interaction.channel, { closedById: interaction.user.id, outcome: "success" });
  } finally {
    unlock(lockKey);
  }
}
 
// --- Auto-cierre por inactividad del usuario ---
 
setInterval(async () => {
  const now = Date.now();
  for (const [channelId, lastTime] of ticketLastOwnerActivity.entries()) {
    if (now - lastTime < INACTIVITY_HOURS * 60 * 60 * 1000) continue;
    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        ticketLastOwnerActivity.delete(channelId);
        continue;
      }
      const embed = new EmbedBuilder()
        .setTitle("🗄️ Guardando logs...")
        .setDescription(
          `Este ticket se cierra automáticamente por llevar más de ${INACTIVITY_HOURS} horas sin respuesta del usuario. El ticket se cerrará en menos de 10 segundos.`
        )
        .setColor(0xed4245);
      await channel.send({ embeds: [embed] });
      await closeTicketChannel(channel, { closedById: null, outcome: "abandoned" });
    } catch (err) {
      console.error("Error en el auto-cierre por inactividad:", err);
    }
  }
}, INACTIVITY_CHECK_INTERVAL_MINUTES * 60 * 1000);
 
// --- Eventos ---
 
client.once("ready", async () => {
  console.log(`Bot conectado como ${client.user.tag} ✅`);
  await initTicketCounter();
});
 
// Si el DUEÑO del ticket escribe, se resetea el reloj de inactividad.
// Si un STAFF escribe, se cancelan los recordatorios de "sin respuesta".
client.on("messageCreate", (message) => {
  if (!message.guild || message.author.bot) return;
  if (!isTicketChannel(message.channel)) return;
 
  const ownerId = message.channel.topic.split(":")[0];
  if (message.author.id === ownerId) {
    ticketLastOwnerActivity.set(message.channel.id, Date.now());
  }
 
  if (!ticketReminders.has(message.channel.id)) return;
  const isStaff = message.member?.permissionsIn(message.channel).has(PermissionFlagsBits.ManageChannels);
  if (isStaff) clearTicketReminder(message.channel.id);
});
 
client.on("interactionCreate", async (interaction) => {
  try {
    // ---------- Comando /panel ----------
    if (interaction.isChatInputCommand() && interaction.commandName === "panel") {
      const embed = new EmbedBuilder()
        .setTitle("Soporte — OlimpoMC")
        .setDescription("Pide ahora mismo soporte.\nDale clic al botón de abajo para crear tu ticket.")
        .setColor(0x2b6cb0);
      if (PANEL_IMAGE_URL) embed.setImage(PANEL_IMAGE_URL);
 
      const openButton = new ButtonBuilder()
        .setCustomId("open_ticket_menu")
        .setLabel("Crear Ticket")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🎫");
 
      const row = new ActionRowBuilder().addComponents(openButton);
      await interaction.reply({ embeds: [embed], components: [row] });
      return;
    }
 
    // ---------- Botón "Crear Ticket" -> muestra el menú de categorías (solo para quien le dio clic) ----------
    if (interaction.isButton() && interaction.customId === "open_ticket_menu") {
      const embed = new EmbedBuilder()
        .setTitle("🎫 Sistema de Tickets — OlimpoMC")
        .setDescription("Selecciona abajo la categoría que corresponda a tu ticket.")
        .setColor(0x2b6cb0);
 
      const buttons = ticketCategories.map((cat) =>
        new ButtonBuilder()
          .setCustomId(`ticket_open_${cat.value}`)
          .setLabel(cat.label)
          .setEmoji(cat.emoji)
          .setStyle(ButtonStyle.Danger)
      );
 
      const row = new ActionRowBuilder().addComponents(buttons);
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      return;
    }
 
    // ---------- Botón de categoría -> abre el formulario correspondiente ----------
    if (interaction.isButton() && interaction.customId.startsWith("ticket_open_")) {
      if (isBlacklisted(interaction.member)) {
        await interaction.reply({ content: "Estás bloqueado para abrir tickets.", ephemeral: true });
        return;
      }
 
      const cooldownUntil = ticketCooldowns.get(interaction.user.id);
      if (cooldownUntil && Date.now() < cooldownUntil) {
        const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
        await interaction.reply({
          content: `Espera ${secondsLeft}s antes de abrir otro ticket.`,
          ephemeral: true,
        });
        return;
      }
 
      const categoryValue = interaction.customId.replace("ticket_open_", "");
      const category = ticketCategories.find((c) => c.value === categoryValue);
      if (!category) return;
 
      const modal = new ModalBuilder()
        .setCustomId(`ticket_modal_${categoryValue}`)
        .setTitle(category.label.slice(0, 45));
 
      const rows = category.fields.map((field) => {
        const input = new TextInputBuilder()
          .setCustomId(field.id)
          .setLabel(field.label.slice(0, 45))
          .setStyle(field.style === "Paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(field.required !== false)
          .setMaxLength(field.maxLength || 500);
        return new ActionRowBuilder().addComponents(input);
      });
 
      modal.addComponents(...rows);
      await interaction.showModal(modal);
      return;
    }
 
    // ---------- Comando /close ----------
    if (interaction.isChatInputCommand() && interaction.commandName === "close") {
      if (!isTicketChannel(interaction.channel)) {
        await interaction.reply({ content: "Este comando solo se puede usar dentro de un ticket.", ephemeral: true });
        return;
      }
      if (!isStaffInChannel(interaction) && !isTicketOwner(interaction)) {
        await interaction.reply({ content: "No tienes permiso para cerrar este ticket.", ephemeral: true });
        return;
      }
      await handleTicketClose(interaction);
      return;
    }
 
    // ---------- Comando /rename ----------
    if (interaction.isChatInputCommand() && interaction.commandName === "rename") {
      if (!isTicketChannel(interaction.channel)) {
        await interaction.reply({ content: "Este comando solo se puede usar dentro de un ticket.", ephemeral: true });
        return;
      }
      if (!isStaffInChannel(interaction)) {
        await interaction.reply({ content: "No tienes permiso para renombrar este ticket.", ephemeral: true });
        return;
      }
      const rawName = interaction.options.getString("nombre");
      const safeName = sanitizeName(rawName);
      await interaction.channel.setName(`ticket-${safeName}`);
      await interaction.reply({ content: `Ticket renombrado a **ticket-${safeName}**` });
      return;
    }
 
    // ---------- Comando /tagstaff ----------
    if (interaction.isChatInputCommand() && interaction.commandName === "tagstaff") {
      if (!isTicketChannel(interaction.channel)) {
        await interaction.reply({ content: "Este comando solo se puede usar dentro de un ticket.", ephemeral: true });
        return;
      }
      if (!isStaffInChannel(interaction)) {
        await interaction.reply({ content: "No tienes permiso para usar este comando.", ephemeral: true });
        return;
      }
 
      const lockKey = `tagstaff:${interaction.channel.id}`;
      if (!tryLock(lockKey)) {
        await interaction.reply({ content: "Ya se está procesando una acción en este ticket, espera un momento.", ephemeral: true });
        return;
      }
 
      try {
        await interaction.deferReply();
 
        const staffUser = interaction.options.getUser("staff");
        const ownerId = interaction.channel.topic ? interaction.channel.topic.split(":")[0] : null;
        const guild = interaction.guild;
 
        const overwrites = [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ManageRoles,
            ],
          },
          {
            id: staffUser.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
            ],
          },
        ];
        if (ownerId) {
          overwrites.push({
            id: ownerId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          });
        }
 
        await interaction.channel.permissionOverwrites.set(overwrites);
        clearTicketReminder(interaction.channel.id);
 
        const embed = new EmbedBuilder()
          .setDescription(`🙋 ${staffUser} te necesitan en este ticket. Ahora solo tú tienes acceso.`)
          .setColor(0x2b6cb0);
 
        await interaction.editReply({ content: `${staffUser}`, embeds: [embed] });
      } finally {
        unlock(lockKey);
      }
      return;
    }
 
    // ---------- Comando /tagrole ----------
    if (interaction.isChatInputCommand() && interaction.commandName === "tagrole") {
      if (!isTicketChannel(interaction.channel)) {
        await interaction.reply({ content: "Este comando solo se puede usar dentro de un ticket.", ephemeral: true });
        return;
      }
      if (!isStaffInChannel(interaction)) {
        await interaction.reply({ content: "No tienes permiso para usar este comando.", ephemeral: true });
        return;
      }
 
      const lockKey = `tagrole:${interaction.channel.id}`;
      if (!tryLock(lockKey)) {
        await interaction.reply({ content: "Ya se está procesando una acción en este ticket, espera un momento.", ephemeral: true });
        return;
      }
 
      try {
        await interaction.deferReply();
 
        const role = interaction.options.getRole("rol");
        const ownerId = interaction.channel.topic ? interaction.channel.topic.split(":")[0] : null;
        const guild = interaction.guild;
 
        const overwrites = [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ManageRoles,
            ],
          },
          {
            id: role.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
            ],
          },
        ];
        if (ownerId) {
          overwrites.push({
            id: ownerId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          });
        }
 
        await interaction.channel.permissionOverwrites.set(overwrites);
        clearTicketReminder(interaction.channel.id);
 
        const embed = new EmbedBuilder()
          .setDescription(`🙋 <@&${role.id}> los necesitan en este ticket. Ahora solo ese rol tiene acceso.`)
          .setColor(0x2b6cb0);
 
        await interaction.editReply({ content: `<@&${role.id}>`, embeds: [embed] });
      } finally {
        unlock(lockKey);
      }
      return;
    }
 
    // ---------- Comando /transfer ----------
    if (interaction.isChatInputCommand() && interaction.commandName === "transfer") {
      if (!isTicketChannel(interaction.channel)) {
        await interaction.reply({ content: "Este comando solo se puede usar dentro de un ticket.", ephemeral: true });
        return;
      }
      if (!isStaffInChannel(interaction)) {
        await interaction.reply({ content: "No tienes permiso para transferir este ticket.", ephemeral: true });
        return;
      }
 
      const lockKey = `transfer:${interaction.channel.id}`;
      if (!tryLock(lockKey)) {
        await interaction.reply({ content: "Ya se está procesando una transferencia en este ticket, espera un momento.", ephemeral: true });
        return;
      }
 
      try {
        await interaction.deferReply();
 
        const categoryValue = interaction.options.getString("categoria");
        const category = transferCategories.find((c) => c.value === categoryValue);
        const guild = interaction.guild;
        const ownerId = interaction.channel.topic ? interaction.channel.topic.split(":")[0] : null;
 
        const overwrites = [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ManageRoles,
            ],
          },
          {
            id: category.roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
            ],
          },
        ];
 
        if (ownerId) {
          overwrites.push({
            id: ownerId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          });
        }
 
        await interaction.channel.permissionOverwrites.set(overwrites);
        await interaction.channel.setName(`ver-${sanitizeName(category.value.replace(/_/g, "-"))}`);
        clearTicketReminder(interaction.channel.id);
 
        const embed = new EmbedBuilder()
          .setDescription(`🔀 Ticket transferido a **${category.label}** por ${interaction.user}.`)
          .setColor(0xf6ad55);
 
        await interaction.editReply({ content: `<@&${category.roleId}>`, embeds: [embed] });
      } finally {
        unlock(lockKey);
      }
      return;
    }
 
    // ---------- Comando /blacklist ----------
    if (interaction.isChatInputCommand() && interaction.commandName === "blacklist") {
      const canManageBlacklist = BLACKLIST_MANAGER_ROLE_IDS.some((id) =>
        interaction.member.roles.cache.has(id)
      );
      if (!canManageBlacklist) {
        await interaction.reply({ content: "No tienes permiso para usar este comando.", ephemeral: true });
        return;
      }
      if (!BLACKLIST_ROLE_ID) {
        await interaction.reply({ content: "Falta configurar BLACKLIST_ROLE_ID.", ephemeral: true });
        return;
      }
 
      const sub = interaction.options.getSubcommand();
      const target = interaction.options.getUser("usuario");
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (!member) {
        await interaction.reply({ content: "No encontré a ese usuario en el servidor.", ephemeral: true });
        return;
      }
 
      if (sub === "add") {
        await member.roles.add(BLACKLIST_ROLE_ID);
        await interaction.reply(`🚫 ${target} fue bloqueado para abrir tickets.`);
      } else {
        await member.roles.remove(BLACKLIST_ROLE_ID);
        await interaction.reply(`✅ ${target} fue desbloqueado y ya puede abrir tickets.`);
      }
      return;
    }
 
    // ---------- Comando /note ----------
    if (interaction.isChatInputCommand() && interaction.commandName === "note") {
      if (!isTicketChannel(interaction.channel)) {
        await interaction.reply({ content: "Este comando solo se puede usar dentro de un ticket.", ephemeral: true });
        return;
      }
      if (!isStaffInChannel(interaction)) {
        await interaction.reply({ content: "No tienes permiso para usar este comando.", ephemeral: true });
        return;
      }
      if (!NOTES_CHANNEL_ID) {
        await interaction.reply({ content: "Falta configurar NOTES_CHANNEL_ID.", ephemeral: true });
        return;
      }
 
      const text = interaction.options.getString("texto");
      const notesChannel = await client.channels.fetch(NOTES_CHANNEL_ID).catch(() => null);
      if (!notesChannel) {
        await interaction.reply({ content: "No pude encontrar el canal de notas.", ephemeral: true });
        return;
      }
 
      const embed = new EmbedBuilder()
        .setDescription(`📝 **Nota en** ${interaction.channel}\n${text}`)
        .setFooter({ text: `Por ${interaction.user.tag}` })
        .setColor(0x718096)
        .setTimestamp();
 
      await notesChannel.send({ embeds: [embed] });
      await interaction.reply({ content: "Nota guardada — solo la ve el staff.", ephemeral: true });
      return;
    }
 
    // ---------- Comando /ticketinfo ----------
    if (interaction.isChatInputCommand() && interaction.commandName === "ticketinfo") {
      if (!isTicketChannel(interaction.channel)) {
        await interaction.reply({ content: "Este comando solo se puede usar dentro de un ticket.", ephemeral: true });
        return;
      }
 
      const [ownerId, categoryValue] = interaction.channel.topic.split(":");
      const category =
        ticketCategories.find((c) => c.value === categoryValue) ||
        transferCategories.find((c) => c.value === categoryValue);
      const claim = ticketClaims.get(interaction.channel.id);
      const number = ticketNumbers.get(interaction.channel.id);
 
      const embed = new EmbedBuilder()
        .setTitle(`Info del ticket ${number ? `#${padNum(number)}` : ""}`)
        .addFields(
          { name: "Dueño", value: ownerId ? `<@${ownerId}>` : "Desconocido", inline: true },
          { name: "Categoría", value: category ? category.label : categoryValue || "Desconocida", inline: true },
          { name: "Reclamado por", value: claim ? `<@${claim.id}>` : "Nadie todavía", inline: true },
          {
            name: "Canal creado",
            value: `<t:${Math.floor(interaction.channel.createdTimestamp / 1000)}:R>`,
            inline: true,
          }
        )
        .setColor(0x2b6cb0);
 
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
 
    // ---------- Comando /stats ----------
    if (interaction.isChatInputCommand() && interaction.commandName === "stats") {
      if (!STATS_LOG_CHANNEL_ID) {
        await interaction.reply({ content: "Falta configurar STATS_LOG_CHANNEL_ID.", ephemeral: true });
        return;
      }
 
      await interaction.deferReply();
 
      const logChannel = await client.channels.fetch(STATS_LOG_CHANNEL_ID).catch(() => null);
      if (!logChannel) {
        await interaction.editReply("No pude leer el canal de estadísticas.");
        return;
      }
 
      const filterUser = interaction.options.getUser("staff");
      const entries = await fetchAllLogEntries(logChannel);
 
      const tally = new Map();
      function getEntry(id) {
        if (!tally.has(id)) tally.set(id, { claims: 0, closes: 0, abandoned: 0, ratingsSum: 0, ratingsCount: 0 });
        return tally.get(id);
      }
      for (const e of entries) {
        if (e.type === "CLAIM" && e.staff) getEntry(e.staff).claims++;
        if (e.type === "CLOSE" && e.staff && e.staff !== "none") {
          if (e.outcome === "success") getEntry(e.staff).closes++;
          else getEntry(e.staff).abandoned++;
        }
        if (e.type === "RATING" && e.staff && e.staff !== "none") {
          const t = getEntry(e.staff);
          t.ratingsSum += Number(e.stars) || 0;
          t.ratingsCount += 1;
        }
      }
 
      if (filterUser) {
        const t = tally.get(filterUser.id) || { claims: 0, closes: 0, abandoned: 0, ratingsSum: 0, ratingsCount: 0 };
        const avg = t.ratingsCount ? (t.ratingsSum / t.ratingsCount).toFixed(1) : "sin calificar";
        const embed = new EmbedBuilder()
          .setTitle(`Estadísticas de ${filterUser.username}`)
          .addFields(
            { name: "Tickets reclamados", value: `${t.claims}`, inline: true },
            { name: "Cerrados con éxito", value: `${t.closes}`, inline: true },
            { name: "Abandonados/inactividad", value: `${t.abandoned}`, inline: true },
            {
              name: "Calificación promedio",
              value: `${avg}${t.ratingsCount ? ` (${t.ratingsCount} calificaciones)` : ""}`,
              inline: true,
            }
          )
          .setColor(0x2b6cb0);
        await interaction.editReply({ embeds: [embed] });
        return;
      }
 
      const sorted = Array.from(tally.entries())
        .sort((a, b) => b[1].closes - a[1].closes)
        .slice(0, 15);
      const lines = sorted.map(([id, t], i) => {
        const avg = t.ratingsCount ? (t.ratingsSum / t.ratingsCount).toFixed(1) : "—";
        return `**${i + 1}.** <@${id}> — reclamados: ${t.claims} | cerrados: ${t.closes} | abandonados: ${t.abandoned} | calif: ${avg}`;
      });
      const embed = new EmbedBuilder()
        .setTitle("📊 Estadísticas de staff")
        .setDescription(lines.length ? lines.join("\n") : "Todavía no hay datos.")
        .setColor(0x2b6cb0);
      await interaction.editReply({ embeds: [embed] });
      return;
    }
 
    // ---------- Envío del formulario -> crea el canal del ticket ----------
    if (interaction.isModalSubmit() && interaction.customId.startsWith("ticket_modal_")) {
      await interaction.deferReply({ ephemeral: true });
 
      const categoryValue = interaction.customId.replace("ticket_modal_", "");
      const category = ticketCategories.find((c) => c.value === categoryValue);
      const guild = interaction.guild;
 
      const existing = guild.channels.cache.find(
        (ch) => ch.topic === `${interaction.user.id}:${category.value}`
      );
      if (existing) {
        await interaction.editReply({ content: `Ya tienes un ticket abierto de esa categoría: ${existing}` });
        return;
      }
 
      // "Reportes de staff" y "Buycraft" son exclusivos: no los ve el @Soporte general
      const primaryRoleId =
        category.value === "reportes_staff"
          ? REPORTS_STAFF_ROLE_ID
          : category.value === "buycraft"
          ? OWNER_ROLE_ID
          : SUPPORT_ROLE_ID;
 
      const channel = await guild.channels.create({
        name: `ticket-${sanitizeName(interaction.user.username)}`,
        type: ChannelType.GuildText,
        parent: TICKET_CATEGORY_ID || undefined,
        topic: `${interaction.user.id}:${category.value}`, // guarda dueño y categoría del ticket
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          {
            id: primaryRoleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
            ],
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ManageRoles,
            ],
          },
        ],
      });
 
      ticketCounter += 1;
      const ticketNumber = ticketCounter;
      ticketNumbers.set(channel.id, ticketNumber);
      ticketLastOwnerActivity.set(channel.id, Date.now());
      ticketCooldowns.set(interaction.user.id, Date.now() + TICKET_COOLDOWN_SECONDS * 1000);
 
      const embed = new EmbedBuilder()
        .setTitle(`${interaction.user.username} Support`)
        .setDescription(
          `Gracias por contactar soporte, un miembro del staff te atenderá.\nCategoría: ${category.label}`
        )
        .addFields(
          category.fields.map((field) => ({
            name: field.label,
            value: interaction.fields.getTextInputValue(field.id) || "-",
            inline: false,
          }))
        )
        .setColor(0x2b6cb0)
        .setFooter({
          text: `#${padNum(ticketNumber)} • ${interaction.user.username} • Sin reclamar`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();
 
      const claimButton = new ButtonBuilder()
        .setCustomId("ticket_claim")
        .setLabel("Claim")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🎫");
 
      const closeButton = new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Delete")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🗑️");
 
      const row = new ActionRowBuilder().addComponents(claimButton, closeButton);
 
      await channel.send({
        content: `<@&${primaryRoleId}> | ${interaction.user}`,
        embeds: [embed],
        components: [row],
      });
 
      await interaction.editReply({ content: `Tu ticket fue creado: ${channel}` });
      scheduleTicketReminder(channel, primaryRoleId);
      await logStat("CREATE", {
        channel: channel.id,
        owner: interaction.user.id,
        category: category.value,
        number: ticketNumber,
      });
      return;
    }
 
    // ---------- Botón Claim ----------
    if (interaction.isButton() && interaction.customId === "ticket_claim") {
      if (!isStaffInChannel(interaction)) {
        await interaction.reply({ content: "Solo el staff puede reclamar tickets.", ephemeral: true });
        return;
      }
 
      const lockKey = `claim:${interaction.channel.id}`;
      if (!tryLock(lockKey)) {
        await interaction.reply({ content: "Ya se está procesando el reclamo de este ticket.", ephemeral: true });
        return;
      }
 
      try {
        const number = ticketNumbers.get(interaction.channel.id);
        const oldEmbed = interaction.message.embeds[0];
        const newEmbed = EmbedBuilder.from(oldEmbed).setFooter({
          text: `${number ? `#${padNum(number)} • ` : ""}Reclamado por ${interaction.user.username}`,
          iconURL: interaction.user.displayAvatarURL(),
        });
 
        const claimButton = new ButtonBuilder()
          .setCustomId("ticket_claim")
          .setLabel(`Reclamado por ${interaction.user.username}`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("🎫")
          .setDisabled(true);
 
        const closeButton = new ButtonBuilder()
          .setCustomId("ticket_close")
          .setLabel("Delete")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🗑️");
 
        const row = new ActionRowBuilder().addComponents(claimButton, closeButton);
        await interaction.update({ embeds: [newEmbed], components: [row] });
        await interaction.channel.setName(`ticket-${sanitizeName(interaction.user.username)}`);
        clearTicketReminder(interaction.channel.id);
 
        ticketClaims.set(interaction.channel.id, { id: interaction.user.id, tag: interaction.user.tag });
        await logStat("CLAIM", { channel: interaction.channel.id, staff: interaction.user.id });
 
        const ownerId = interaction.channel.topic;
        const ownerMention = ownerId ? `<@${ownerId.split(":")[0]}>` : "usuario";
        await interaction.channel.send(
          `Hola, ${ownerMention}! tu ticket será atendido por ${interaction.user}, del equipo de soporte.`
        );
      } finally {
        unlock(lockKey);
      }
      return;
    }
 
    // ---------- Botón Eliminar ----------
    if (interaction.isButton() && interaction.customId === "ticket_close") {
      if (!isStaffInChannel(interaction) && !isTicketOwner(interaction)) {
        await interaction.reply({ content: "No tienes permiso para eliminar este ticket.", ephemeral: true });
        return;
      }
      await handleTicketClose(interaction);
      return;
    }
 
    // ---------- Botones de calificación (llegan por DM) ----------
    if (interaction.isButton() && interaction.customId.startsWith("rate_")) {
      const [, stars, channelId, staffId] = interaction.customId.split("_");
      await logStat("RATING", { channel: channelId, staff: staffId, stars });
      await interaction.update({
        content: `¡Gracias por calificar con ${"⭐".repeat(Number(stars))}!`,
        components: [],
      });
      return;
    }
  } catch (error) {
    console.error(error);
    const errorMessage = "Ocurrió un error, intenta de nuevo.";
    if (interaction.deferred || interaction.replied) {
      interaction.editReply({ content: errorMessage }).catch(() => {});
    } else if (interaction.isRepliable()) {
      interaction.reply({ content: errorMessage, ephemeral: true }).catch(() => {});
    }
  }
});
 
