module.exports = {
  ticketCategories: [
    {
      value: "soporte_general",
      label: "Soporte general",
      emoji: "🛠️",
      description: "Dudas o problemas generales del servidor",
      fields: [
        { id: "ign_input", label: "IGN (nombre en el juego)", style: "Short", required: true, maxLength: 50 },
        { id: "reason_input", label: "Razón", style: "Paragraph", required: true, maxLength: 500 },
      ],
    },
    {
      value: "buycraft",
      label: "Buycraft",
      emoji: "💳",
      description: "Problemas con compras o la tienda",
      fields: [
        { id: "ign_input", label: "IGN (nombre en el juego)", style: "Short", required: true, maxLength: 50 },
        { id: "email_input", label: "Correo de la compra", style: "Short", required: true, maxLength: 100 },
        { id: "reason_input", label: "¿Cuál es el problema?", style: "Paragraph", required: true, maxLength: 500 },
      ],
    },
    {
      value: "unbans",
      label: "Unbans",
      emoji: "🔓",
      description: "Solicitudes de desbaneo",
      fields: [
        { id: "ign_input", label: "IGN (nombre en el juego)", style: "Short", required: true, maxLength: 50 },
        { id: "ban_reason_input", label: "Razón del ban", style: "Short", required: true, maxLength: 200 },
        { id: "reason_input", label: "¿Por qué deberían desbanearte?", style: "Paragraph", required: true, maxLength: 500 },
      ],
    },
    {
      value: "reportes_staff",
      label: "Reportes de staff",
      emoji: "🚨",
      description: "Reportar mal comportamiento de un miembro del staff",
      fields: [
        { id: "staff_input", label: "IGN del staff reportado", style: "Short", required: true, maxLength: 50 },
        { id: "reason_input", label: "Razón / evidencia", style: "Paragraph", required: true, maxLength: 500 },
      ],
    },
    {
      value: "bug_report",
      label: "Bug report",
      emoji: "🐛",
      description: "Reportar un error o bug del servidor",
      fields: [
        { id: "reason_input", label: "Descripción del bug", style: "Paragraph", required: true, maxLength: 500 },
        { id: "steps_input", label: "¿Cómo se reproduce?", style: "Paragraph", required: true, maxLength: 500 },
      ],
    },
  ],
 
  // Categorías a las que se puede transferir un ticket ya abierto.
  // roleId = rol de staff que queda con acceso exclusivo tras la transferencia.
  transferCategories: [
    { value: "anticheats", label: "Anticheats", roleId: "1532935067578531972" },
    { value: "devolucion_inventario", label: "Devolución de inventario", roleId: "1532935779842523278" },
    { value: "media_apply", label: "Media Apply", roleId: "1532936205635682466" },
    { value: "rol_discord_permanente", label: "Rol Discord Permanente", roleId: "1532480760508977412" },
    { value: "recompensas_boost", label: "Recompensas Boost", roleId: "1532480760508977412" },
    { value: "items_ilegales", label: "Ítems Ilegales", roleId: "1532480760508977412" },
    { value: "resign", label: "Resign", roleId: "1532936954394443937" },
    { value: "un_register", label: "Un-Register", roleId: "1532494236971434155" },
    { value: "owner", label: "Owner", roleId: "1532494236971434155" },
  ],
 
  // Rol que exclusivamente puede ver y responder tickets de "Reportes de staff"
  REPORTS_STAFF_ROLE_ID: "1532936954394443937",
 
  // Rol que exclusivamente puede ver y responder tickets de "Buycraft"
  OWNER_ROLE_ID: "1532494236971434155",
};
 
