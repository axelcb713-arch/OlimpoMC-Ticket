require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");
const { transferCategories } = require("./config");

const commands = [
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Publica el panel para abrir tickets")
    .setDefaultMemberPermissions(0), // solo administradores lo pueden usar

  new SlashCommandBuilder()
    .setName("close")
    .setDescription("Cierra (elimina) el ticket actual"),

  new SlashCommandBuilder()
    .setName("rename")
    .setDescription("Cambia el nombre del ticket")
    .addStringOption((option) =>
      option.setName("nombre").setDescription("Nuevo nombre del canal").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("tagstaff")
    .setDescription("Taguea a un miembro del staff específico en el ticket")
    .addUserOption((option) =>
      option.setName("staff").setDescription("Miembro del staff a taguear").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("tagrole")
    .setDescription("Taguea a un rol específico en el ticket")
    .addRoleOption((option) =>
      option.setName("rol").setDescription("Rol a taguear").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("transfer")
    .setDescription("Transfiere el ticket a otra categoría")
    .addStringOption((option) => {
      option
        .setName("categoria")
        .setDescription("Categoría a la que se transfiere el ticket")
        .setRequired(true);
      transferCategories.forEach((cat) => option.addChoices({ name: cat.label, value: cat.value }));
      return option;
    }),

  new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Gestiona quién puede abrir tickets (solo Head Staff)")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Bloquea a alguien de abrir tickets")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuario a bloquear").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Desbloquea a alguien")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuario a desbloquear").setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName("note")
    .setDescription("Deja una nota interna sobre este ticket (solo la ve el staff)")
    .addStringOption((o) => o.setName("texto").setDescription("Contenido de la nota").setRequired(true)),

  new SlashCommandBuilder()
    .setName("ticketinfo")
    .setDescription("Muestra información de este ticket"),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Estadísticas de tickets por staff")
    .addUserOption((o) => o.setName("staff").setDescription("Ver stats de un staff en específico").setRequired(false)),
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("Registrando comandos slash...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("Comandos registrados correctamente ✅");
  } catch (error) {
    console.error(error);
  }
})();
