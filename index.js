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
const { ticketCategories, transferCategories, REPORTS_STAFF_ROLE_ID } = require("./config");
 
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});
 
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID;
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || null;
const TRANSCRIPT_CHANNEL_ID = process.env.TRANSCRIPT_CHANNEL_ID || null;
const MANAGEMENT_CHANNEL_ID = process.env.MANAGEMENT_CHANNEL_ID || null;
const MANAGEMENT_ROLE_ID = process.env.MANAGEMENT_ROLE_ID || null;
const STAFF_REMINDER_MINUTES = 25;
const MANAGEMENT_ALERT_MINUTES = 30;
 
// Guarda, por canal de ticket, los temporizadores activos de "sin respuesta"
const ticketReminders = new Map();
 
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
      const ch = await channel.guild.channels.fetch(channel.id).catch(() => null);
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
        const ch = await channel.guild.channels.fetch(channel.id).catch(() => null);
        if (!ch) return;
        const mgmtChannel = await channel.guild.channels.fetch(MANAGEMENT_CHANNEL_ID).catch(() => null);
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
 
client.once("ready", () => {
  console.log(`Bot conectado como ${client.user.tag} ✅`);
});
 
// Si un staff responde en el ticket, se cancelan ambos recordatorios pendientes
client.on("messageCreate", (message) => {
  if (!message.guild || message.author.bot) return;
  if (!isTicketChannel(message.channel)) return;
  if (!ticketReminders.has(message.channel.id)) return;
 
  const isStaff = message.member?.permissionsIn(message.channel).has(PermissionFlagsBits.ManageChannels);
  if (isStaff) clearTicketReminder(message.channel.id);
});
 
// --- Helpers ---
 
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
 
function sanitizeName(str) {
  return str.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");
}
 
async function generateTranscript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = Array.from(messages.values()).reverse();
 
  const lines = sorted.map((msg) => {
    const time = msg.createdAt.toLocaleString("es-CO");
    const author = msg.author.tag;
    const content = msg.content || "[sin texto — embed/adjunto]";
    return `[${time}] ${author}: ${content}`;
  });
 
  const text = `Transcript de #${channel.name}\n${"=".repeat(40)}\n\n${lines.join("\n")}`;
  return new AttachmentBuilder(Buffer.from(text, "utf-8"), {
    name: `transcript-${channel.name}.txt`,
  });
}
 
async function deleteTicketChannel(interaction, replyText) {
  await interaction.reply(replyText);
  clearTicketReminder(interaction.channel.id);
 
  const ownerId = interaction.channel.topic ? interaction.channel.topic.split(":")[0] : null;
  let transcript = null;
 
  if (TRANSCRIPT_CHANNEL_ID || ownerId) {
    try {
      transcript = await generateTranscript(interaction.channel);
    } catch (err) {
      console.error("No se pudo generar el transcript:", err);
    }
  }
 
  if (transcript && TRANSCRIPT_CHANNEL_ID) {
    try {
      const logChannel = await interaction.guild.channels.fetch(TRANSCRIPT_CHANNEL_ID);
      await logChannel.send({
        content: `📄 Transcript de **#${interaction.channel.name}** — cerrado por ${interaction.user}${
          ownerId ? ` | dueño: <@${ownerId}>` : ""
        }`,
        files: [transcript],
      });
    } catch (err) {
      console.error("No se pudo enviar el transcript al canal de logs:", err);
    }
  }
 
  if (transcript && ownerId) {
    try {
      const ownerUser = await client.users.fetch(ownerId);
      await ownerUser.send({
        content: `📄 Aquí está el transcript de tu ticket **#${interaction.channel.name}** en OlimpoMC.`,
        files: [transcript],
      });
    } catch (err) {
      console.error("No se pudo enviar el transcript por DM al usuario (puede tener los DMs cerrados):", err);
    }
  }
 
  setTimeout(() => {
    interaction.channel.delete().catch(() => {});
  }, 5000);
}
 
// --- Bot ---
 
client.on("interactionCreate", async (interaction) => {
  try {
    // ---------- Comando /panel ----------
    if (interaction.isChatInputCommand() && interaction.commandName === "panel") {
      const embed = new EmbedBuilder()
        .setTitle("🎫 Sistema de Tickets — OlimpoMC")
        .setDescription(
          "Selecciona abajo la categoría que corresponda a tu ticket.\nSe creará un canal privado donde el staff te atenderá."
        )
        .setColor(0x2b6cb0);
 
      const menu = new StringSelectMenuBuilder()
        .setCustomId("ticket_select")
        .setPlaceholder("Elige una categoría...")
        .addOptions(
          ticketCategories.map((cat) => ({
            label: cat.label,
            value: cat.value,
            description: cat.description,
            emoji: cat.emoji,
          }))
        );
 
      const row = new ActionRowBuilder().addComponents(menu);
      await interaction.reply({ embeds: [embed], components: [row] });
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
      await deleteTicketChannel(interaction, "🔒 Cerrando ticket en 5 segundos...");
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
      const staffUser = interaction.options.getUser("staff");
      await interaction.reply({ content: `${staffUser} te necesitan en este ticket.` });
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
      const role = interaction.options.getRole("rol");
      await interaction.reply({ content: `<@&${role.id}> los necesitan en este ticket.` });
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
 
      await interaction.reply({ content: `<@&${category.roleId}>`, embeds: [embed] });
      return;
    }
 
    // ---------- Selección de categoría -> abre el formulario correspondiente ----------
    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_select") {
      const categoryValue = interaction.values[0];
      const category = ticketCategories.find((c) => c.value === categoryValue);
 
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
 
      // "Reportes de staff" solo lo puede ver el rol específico, no el @Soporte general
      const primaryRoleId =
        category.value === "reportes_staff" ? REPORTS_STAFF_ROLE_ID : SUPPORT_ROLE_ID;
 
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
          text: `${interaction.user.username} • Sin reclamar`,
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
      return;
    }
 
    // ---------- Botón Claim ----------
    if (interaction.isButton() && interaction.customId === "ticket_claim") {
      if (!isStaffInChannel(interaction)) {
        await interaction.reply({ content: "Solo el staff puede reclamar tickets.", ephemeral: true });
        return;
      }
 
      const oldEmbed = interaction.message.embeds[0];
      const newEmbed = EmbedBuilder.from(oldEmbed).setFooter({
        text: `Reclamado por ${interaction.user.username}`,
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
 
      const ownerId = interaction.channel.topic;
      const ownerMention = ownerId ? `<@${ownerId.split(":")[0]}>` : "usuario";
      await interaction.channel.send(
        `Hola, ${ownerMention}! tu ticket será atendido por ${interaction.user}, del equipo de soporte.`
      );
      return;
    }
 
    // ---------- Botón Eliminar ----------
    if (interaction.isButton() && interaction.customId === "ticket_close") {
      if (!isStaffInChannel(interaction) && !isTicketOwner(interaction)) {
        await interaction.reply({ content: "No tienes permiso para eliminar este ticket.", ephemeral: true });
        return;
      }
      await deleteTicketChannel(interaction, "🔒 Eliminando ticket en 5 segundos...");
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
 
client.login(process.env.DISCORD_TOKEN);
 
