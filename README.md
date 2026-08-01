# Bot de Tickets — OlimpoMC

## 1. Crear la aplicación del bot
1. Ve a https://discord.com/developers/applications y crea una nueva aplicación.
2. En la pestaña **Bot**, dale clic a "Reset Token" y copia el token (lo vas a pegar en `.env`).
3. En **Bot**, activa el intent **Server Members Intent**.
4. En **OAuth2 → URL Generator**, marca los scopes `bot` y `applications.commands`, y en permisos marca: Manage Channels, Send Messages, Read Message History, Embed Links, View Channels. Con la URL generada invita el bot a tu servidor.

## 2. Configurar el proyecto
```bash
npm install
cp .env.example .env
```
Llena el archivo `.env` con:
- `DISCORD_TOKEN`: el token del paso 1
- `CLIENT_ID`: Application ID (pestaña General Information)
- `GUILD_ID`: ID de tu servidor de Discord
- `SUPPORT_ROLE_ID`: ID del rol `@Soporte`
- `TICKET_CATEGORY_ID`: (opcional) ID de la categoría donde quieres que se creen los canales de ticket

> Para copiar IDs necesitas activar el "Modo desarrollador" en Discord: Configuración → Avanzado → Modo desarrollador.

## 3. Registrar el comando y correr el bot
```bash
npm run deploy   # registra el comando /panel (solo hace falta una vez, o cuando cambies comandos)
npm start        # enciende el bot
```

## 4. Usarlo
En el canal de tickets, un admin escribe `/panel`. Esto publica el menú desplegable. Cuando alguien elige una categoría:
- Se crea un canal privado solo visible para esa persona y el rol `@Soporte`
- Se taguea al rol `@Soporte` automáticamente
- Aparece un botón "Cerrar ticket" que puede usar el dueño del ticket o cualquier miembro de `@Soporte`

## Categorías actuales
Soporte general, Buycraft, Unbans, Reportes de staff, Bug report — se editan en `config.js`.

## Próximos pasos posibles
- Guardar transcripciones del ticket antes de cerrarlo
- Límite de tickets abiertos por usuario
- Logs de tickets cerrados en un canal aparte
