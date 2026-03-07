import logging
import os
from datetime import datetime
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes, MessageHandler, CallbackQueryHandler, filters
from config import TELEGRAM_TOKEN, ADMIN_ID
from extractor import process_document

# Configuración de logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Diccionario temporal para guardar estado por usuario (en memoria por simplicidad para 1 usuario)
user_data_store = {}

def is_admin(update: Update) -> bool:
    if update.effective_user.id != ADMIN_ID:
        logger.warning(f"Acceso denegado al usuario: {update.effective_user.id}")
        return False
    return True

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        await update.message.reply_text("Acceso denegado. No eres el administrador de este bot.")
        return
    
    await update.message.reply_text(
        "¡Hola Julián! Soy tu Tracker Financiero Personal.\n"
        "Enviame cualquier factura en formato PDF o Imagen y yo me encargaré de extraer los datos y guardar el registro."
    )

async def handle_document(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        return
        
    message = update.message
    document = message.document or message.photo
    
    if not document:
        return
        
    await message.reply_text("Recibí el archivo. Analizándolo con la IA... ⏳")
    
    try:
        # Si es foto, Telegram manda una tupla de PhotoSize, tomamos la de mayor resolución (-1)
        # Si es document, es un objeto Document directo.
        if message.photo:
            file_obj = message.photo[-1]
            tipo_archivo = "jpg"
        else:
            file_obj = message.document
            tipo_archivo = "pdf" if getattr(file_obj, 'mime_type', '') == 'application/pdf' else "jpg"
            
        file_id = file_obj.file_id
        
        new_file = await context.bot.get_file(file_id)
        
        # Crear carpeta temp si no existe
        os.makedirs("temp", exist_ok=True)
        
        file_path = f"temp/{file_id}.{tipo_archivo}"
        
        await new_file.download_to_drive(file_path)
        
        # Procesar con Gemini
        data = process_document(file_path)
        
        if not data:
            await message.reply_text("❌ No pude extraer los datos correctamente. Por favor revisá el formato del archivo o intentá nuevamente.")
            if os.path.exists(file_path):
                os.remove(file_path)
            return
            
        # Guardar en diccionario temporal
        user_data_store[update.effective_user.id] = {
            "extracted_data": data,
            "file_path": file_path
        }
        
        resumen = (
            f"📄 **Datos Extraídos:**\n\n"
            f"🏢 Entidad: `{data.get('entidad', 'N/A')}`\n"
            f"💰 Monto: `${data.get('monto_total', 0.0):.2f}`\n"
            f"📅 Vencimiento: `{data.get('fecha_vencimiento', 'N/A')}`\n"
            f"🔢 Código: `{data.get('codigo_pago', 'N/A')}`\n\n"
            f"¿A qué categoría pertenece este gasto?"
        )
        
        keyboard = [
            [
                InlineKeyboardButton("🏠 Personal", callback_data='cat_Personal'),
                InlineKeyboardButton("🏢 SHURIAN", callback_data='cat_SHURIAN')
            ],
            [
                InlineKeyboardButton("❌ Cancelar", callback_data='cat_cancel')
            ]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await message.reply_text(resumen, reply_markup=reply_markup, parse_mode='Markdown')
        
    except Exception as e:
        logger.error(f"Error procesando documento: {e}")
        await message.reply_text(f"Hubo un error procesando tu archivo: {str(e)}")

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    user_id = update.effective_user.id
    if user_id not in user_data_store:
        await query.edit_message_text("❌ Sesión expirada. Por favor, enviá el archivo nuevamente.")
        return
        
    data = query.data
    
    if data == 'cat_cancel':
        file_path = user_data_store[user_id].get("file_path")
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
        del user_data_store[user_id]
        await query.edit_message_text("❌ Operación cancelada.")
        return
        
    if data == 'save_confirm':
        ext_data = user_data_store[user_id]['extracted_data']
        category = user_data_store[user_id]['category']
        
        # Validar y formatear fecha para Supabase (ideal AAAA-MM-DD o parseo inteligente)
        raw_date = ext_data.get('fecha_vencimiento', '')
        try:
            parsed_date = datetime.strptime(raw_date, '%d/%m/%Y').strftime('%Y-%m-%d')
        except ValueError:
            # Fallback simple si Gemini tira otro formato u omite
            parsed_date = datetime.now().strftime('%Y-%m-%d')
            
        try:
            from config import supabase
            # TODO: Idealmente subir el PDF a Storage y guardar la URL.
            # Por ahora guardamos el registro en la BD principal
            response = supabase.table('expenses').insert({
                "entity": ext_data.get('entidad', 'N/A'),
                "category": category,
                "amount": ext_data.get('monto_total', 0.0),
                "due_date": parsed_date,
                "payment_code": ext_data.get('codigo_pago', 'N/A')
            }).execute()
            
            await query.edit_message_text(f"✅ ¡Gasto de **{category}** guardado exitosamente en la base de datos!", parse_mode='Markdown')
            
        except Exception as e:
            logger.error(f"Error insertando en BD: {e}")
            await query.edit_message_text("❌ Ocurrió un error al guardar en la base de datos.")
            
        finally:
            # Limpiar estado y archivo
            file_path = user_data_store[user_id].get("file_path")
            if file_path and os.path.exists(file_path):
                os.remove(file_path)
            del user_data_store[user_id]
        return
        
    if data.startswith('cat_'):
        # Obtener la categoría elegida
        category = data.split('_')[1] # 'Personal' o 'SHURIAN'
        user_data_store[user_id]['category'] = category
        
        # Próximo paso: Confirmar Guardado
        ext_data = user_data_store[user_id]['extracted_data']
        resumen_final = (
            f"✅ ¡Categoría asignada: **{category}**!\n\n"
            f"🏢 Entidad: `{ext_data.get('entidad', 'N/A')}`\n"
            f"💰 Monto: `${ext_data.get('monto_total', 0.0):.2f}`\n"
            f"📅 Vencimiento: `{ext_data.get('fecha_vencimiento', 'N/A')}`\n\n"
            f"¿Confirmás guardar este registro en Supabase?"
        )
        
        keyboard = [
            [
                InlineKeyboardButton("💾 Confirmar Guardado", callback_data='save_confirm'),
                InlineKeyboardButton("❌ Cancelar", callback_data='cat_cancel')
            ]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(resumen_final, reply_markup=reply_markup, parse_mode='Markdown')

def main():
    if not TELEGRAM_TOKEN:
        logger.error("No se encontró TELEGRAM_TOKEN. Saliendo...")
        return
        
    app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()

    # Tareas en JobQueue
    from alerts import check_pending_expenses
    from datetime import time
    
    # Hora de revisión: 09:00 AM todos los días
    job_queue = app.job_queue
    hora_aviso = time(hour=9, minute=0, second=0)
    job_queue.run_daily(check_pending_expenses, time=hora_aviso, name='Aviso-24h')

    # Handlers Base
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.Document.ALL | filters.PHOTO, handle_document))
    app.add_handler(CallbackQueryHandler(handle_callback))

    logger.info("Iniciando el bot y JobQueue diario...")
    app.run_polling()

if __name__ == '__main__':
    main()
