# Especificación: Tracker Financiero Personal & Business (Web App + Bot)

## 1. Visión General
Aplicación web en la nube y bot de Telegram para la gestión automatizada de finanzas. El sistema debe procesar facturas/VEPs, categorizarlos entre "Personal" y "SHURIAN", y gestionar recordatorios de vencimiento proactivos.

## 2. Usuarios y Seguridad
- **Acceso:** Login privado para un solo usuario (Juli).
- **Bot Privacy:** El bot solo procesará mensajes del Chat ID de administrador configurado.
- **Entorno:** 100% Cloud (Backend Python + Database en la nube).

## 3. Categorización y Datos
Cada registro debe contener obligatoriamente:
- **Entidad:** (Ej: EPE, Litoral Gas, AFIP, Proveedor).
- **Tipo de Gasto:** [Personal] o [Local - SHURIAN].
- **Monto:** Extraído del PDF.
- **Vencimiento:** Fecha límite de pago.
- **Datos de Pago:** Código de pago electrónico y/o Código de barras.
- **Archivo:** Link al PDF original almacenado en la nube.

## 4. Flujo de Trabajo (Telegram Bot)
1. **Ingreso:** Usuario envía PDF al bot.
2. **Procesamiento:** Extracción automática de datos mediante IA/OCR.
3. **Confirmación Interactiva:** - El bot pregunta: "¿Es un gasto Personal o de SHURIAN?" (Botones en pantalla).
   - El bot muestra el resumen y pide "Confirmar Guardado".
4. **Almacenamiento:** Registro en DB y guardado de archivo en Storage.

## 5. Sistema de Alertas (Recordatorios)
- **Notificación Automática:** El sistema debe chequear la base de datos diariamente.
- **Regla de Aviso:** El bot debe enviar un mensaje automático 24 horas antes de cada vencimiento pendiente.
- **Formato de Alerta:** "⚠️ Recordatorio: Mañana vence [Entidad] por $[Monto]. Código de pago: [Código]".

## 6. Interfaz de Usuario (Web App - Fintech Moderna)
- **Dashboard Principal:** Prioridad absoluta a "Próximos Vencimientos".
- **Filtros:** Opción de ver "Solo Personal", "Solo SHURIAN" o "Vista Consolidada".
- **Estilo Visual:** Dark Mode, estética limpia tipo banco digital, acentos neón para estados de pago (Verde: Pagado / Rojo: Pendiente).
- **Acceso Rápido:** Copiar código de pago con un clic y visualizador de PDF integrado.