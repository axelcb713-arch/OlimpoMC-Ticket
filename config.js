module.exports = {
  // Categorías del panel /panel. Todas crean el ticket para el staff de Soporte general;
  // las categorías especializadas (Anticheats, Buycraft real, Reportar Staff, etc.)
  // se alcanzan después transfiriendo el ticket con /transfer.
  ticketCategories: [
    {
      value: "soporte",
      label: "Soporte",
      emoji: "🛠️",
      description: "Dudas o problemas generales del servidor",
      fields: [
        { id: "ign_input", label: "IGN (nombre en el juego)", style: "Short", required: true, maxLength: 50 },
        { id: "reason_input", label: "Razón", style: "Paragraph", required: true, maxLength: 500 },
      ],
    },
    {
      value: "apelaciones",
      label: "Apelaciones",
      emoji: "🔓",
      description: "Apelar un ban, mute u otra sanción",
      fields: [
        { id: "ign_input", label: "IGN (nombre en el juego)", style: "Short", required: true, maxLength: 50 },
        { id: "ban_reason_input", label: "Razón de la sanción", style: "Short", required: true, maxLength: 200 },
        { id: "reason_input", label: "¿Por qué deberían levantarla?", style: "Paragraph", required: true, maxLength: 500 },
      ],
    },
    {
      value: "buycraft_tebex",
      label: "Buycraft/Tebex",
      emoji: "💳",
      description: "Problemas con compras o la tienda",
      fields: [
        { id: "ign_input", label: "IGN (nombre en el juego)", style: "Short", required: true, maxLength: 50 },
        { id: "email_input", label: "Correo de la compra", style: "Short", required: true, maxLength: 100 },
        { id: "reason_input", label: "¿Cuál es el problema?", style: "Paragraph", required: true, maxLength: 500 },
      ],
    },
    {
      value: "bugs",
      label: "Bugs",
      emoji: "🐛",
      description: "Reportar un error o bug del servidor",
      fields: [
        { id: "reason_input", label: "Descripción del bug", style: "Paragraph", required: true, maxLength: 500 },
        { id: "steps_input", label: "¿Cómo se reproduce?", style: "Paragraph", required: true, maxLength: 500 },
      ],
    },
    {
      value: "media_apply",
      label: "Media Apply",
      emoji: "🎥",
      description: "Postularte como creador de contenido del server",
      fields: [
        { id: "ign_input", label: "IGN (nombre en el juego)", style: "Short", required: true, maxLength: 50 },
        { id: "content_link_input", label: "Enlace a tu contenido (video/redes)", style: "Short", required: true, maxLength: 200 },
        { id: "experience_input", label: "Experiencia previa", style: "Paragraph", required: true, maxLength: 500 },
      ],
    },
  ],
 
  // Categorías a las que se puede transferir un ticket ya abierto.
  // roleId = rol de staff que queda con acceso exclusivo tras la transferencia.
  transferCategories: [
    { value: "anticheats", label: "Anticheat", roleId: "1532935067578531972" }, // SS Team
    { value: "devolucion_inventario", label: "Devolución de inventario", roleId: "1532935779842523278" }, // Medium Staff
    { value: "media_apply", label: "Media Apply", roleId: "1532936205635682466" }, // Media Manager
    { value: "rol_discord_permanente", label: "Rol Discord Permanente", roleId: "1532480760508977412" }, // High Staff
    { value: "recompensas_boost", label: "Recompensas Boost", roleId: "1532480760508977412" }, // High Staff
    { value: "items_ilegales", label: "Items Bugs/Ilegales", roleId: "1532480760508977412" }, // High Staff
    { value: "resign", label: "Resign", roleId: "1532936954394443937" }, // Head Staff
    { value: "reportar_staff", label: "Reportar Staff", roleId: "1532936954394443937" }, // Head Staff
    { value: "buycraft", label: "BuyCraft", roleId: "1532494236971434155" }, // Owner
    { value: "un_register", label: "Un-Register", roleId: "1532494236971434155" }, // Owner
    { value: "owner", label: "Owner", roleId: "1532494236971434155" }, // Owner
  ],
 
  // Rol de Owner (usado también para permisos de /blacklist)
  OWNER_ROLE_ID: "1532494236971434155",
};
 
