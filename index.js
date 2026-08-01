require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");
const { ticketCategories } = require("./config");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID;
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || null;

client.once("ready", () => {
  console.log(`Bot conectado como ${client.user.tag} ✅`);
});

client.on("interactionCreate", async (interaction) => {
  try {
    // Comando /panel -> publica el embed con el menú de tickets
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

    // Selección de categoría -> crea el canal del ticket
    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_select") {
      await interaction.deferReply({ ephemeral: true });

      const categoryValue = interaction.values[0];
      const category = ticketCategories.find((c) => c.value === categoryValue);
      const guild = interaction.guild;

      // Evita que un usuario abra dos tickets de la misma categoría a la vez
      const existing = guild.channels.cache.find(
        (ch) => ch.name === `ticket-${interaction.user.username}-${category.value}`.toLowerCase()
      );
      if (existing) {
        await interaction.editReply({
          content: `Ya tienes un ticket abierto de esa categoría: ${existing}`,
        });
        return;
      }

      const channel = await guild.channels.create({
        name: `ticket-${interaction.user.username}-${category.value}`.toLowerCase(),
        type: ChannelType.GuildText,
        parent: TICKET_CATEGORY_ID || undefined,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          {
            id: SUPPORT_ROLE_ID,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
        ],
      });

      const embed = new EmbedBuilder()
        .setTitle(`${category.emoji} ${category.label}`)
        .setDescription(
          `Ticket abierto por ${interaction.user}.\nUn miembro de <@&${SUPPORT_ROLE_ID}> te atenderá pronto.\n\nDescribe tu caso con el mayor detalle posible.`
        )
        .setColor(0x2b6cb0);

      const closeButton = new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Cerrar ticket")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒");

      const row = new ActionRowBuilder().addComponents(closeButton);

      await channel.send({
        content: `<@&${SUPPORT_ROLE_ID}> | ${interaction.user}`,
        embeds: [embed],
        components: [row],
      });

      await interaction.editReply({ content: `Tu ticket fue creado: ${channel}` });
      return;
    }

    // Botón de cerrar ticket
    if (interaction.isButton() && interaction.customId === "ticket_close") {
      const member = interaction.member;
      const isStaff = member.roles.cache.has(SUPPORT_ROLE_ID);
      const isTicketOwner = interaction.channel.name.includes(
        interaction.user.username.toLowerCase()
      );

      if (!isStaff && !isTicketOwner) {
        await interaction.reply({
          content: "No tienes permiso para cerrar este ticket.",
          ephemeral: true,
        });
        return;
      }

      await interaction.reply("🔒 Cerrando ticket en 5 segundos...");
      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 5000);
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
