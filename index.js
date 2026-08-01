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
} = require("discord.js");
const { ticketCategories, transferCategories, REPORTS_STAFF_ROLE_ID } = require("./config");
 
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});
 
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID;
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || null;
 
client.once("ready", () => {
  console.log(`Bot conectado como ${client.user.tag} ✅`);
});
 
// --- Helpers ---
 
function isTicketChannel(channel) {
  return channel && channel.name && channel.name.startsWith("ticket-");
}
 
function isStaffInChannel(interaction) {
  return interaction.member
    .permissionsIn(interaction.channel)
    .has(PermissionFlagsBits.ManageChannels);
}
 
function isTicketOwner(interaction) {
  return interaction.channel.topic === interaction.user.id;
}
 
async function deleteTicketChannel(interaction, replyText) {
  await interaction.reply(replyText);
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
      const safeName = rawName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");
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
      const ownerId = interaction.channel.topic;
 
      const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
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
        (ch) => ch.name === `ticket-${interaction.user.username}-${category.value}`.toLowerCase()
      );
      if (existing) {
        await interaction.editReply({ content: `Ya tienes un ticket abierto de esa categoría: ${existing}` });
        return;
      }
 
      // "Reportes de staff" solo lo puede ver el rol específico, no el @Soporte general
      const primaryRoleId =
        category.value === "reportes_staff" ? REPORTS_STAFF_ROLE_ID : SUPPORT_ROLE_ID;
 
      const channel = await guild.channels.create({
        name: `ticket-${interaction.user.username}-${category.value}`.toLowerCase(),
        type: ChannelType.GuildText,
        parent: TICKET_CATEGORY_ID || undefined,
        topic: interaction.user.id, // guarda el dueño del ticket para poder identificarlo luego
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
            ],
          },
        ],
      });
 
      const embed = new EmbedBuilder()
        .setTitle(`${category.emoji} ${category.label}`)
        .setDescription(`Ticket abierto por ${interaction.user}.`)
        .addFields(
          category.fields.map((field) => ({
            name: field.label,
            value: interaction.fields.getTextInputValue(field.id) || "-",
            inline: field.style !== "Paragraph",
          }))
        )
        .setColor(0x2b6cb0)
        .setFooter({ text: "Sin reclamar" });
 
      const claimButton = new ButtonBuilder()
        .setCustomId("ticket_claim")
        .setLabel("Reclamar")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🎟️");
 
      const closeButton = new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Eliminar")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒");
 
      const row = new ActionRowBuilder().addComponents(claimButton, closeButton);
 
      await channel.send({
        content: `<@&${primaryRoleId}> | ${interaction.user}`,
        embeds: [embed],
        components: [row],
      });
 
      await interaction.editReply({ content: `Tu ticket fue creado: ${channel}` });
      return;
    }
 
    // ---------- Botón Reclamar ----------
    if (interaction.isButton() && interaction.customId === "ticket_claim") {
      if (!isStaffInChannel(interaction)) {
        await interaction.reply({ content: "Solo el staff puede reclamar tickets.", ephemeral: true });
        return;
      }
 
      const oldEmbed = interaction.message.embeds[0];
      const newEmbed = EmbedBuilder.from(oldEmbed).setFooter({
        text: `Reclamado por ${interaction.user.username}`,
      });
 
      const claimButton = new ButtonBuilder()
        .setCustomId("ticket_claim")
        .setLabel(`Reclamado por ${interaction.user.username}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🎟️")
        .setDisabled(true);
 
      const closeButton = new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Eliminar")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒");
 
      const row = new ActionRowBuilder().addComponents(claimButton, closeButton);
      await interaction.update({ embeds: [newEmbed], components: [row] });
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
    if (interaction.isRepliable()) {
      interaction
        .reply({ content: "Ocurrió un error, intenta de nuevo.", ephemeral: true })
        .catch(() => {});
    }
  }
});
 
client.login(process.env.DISCORD_TOKEN);
