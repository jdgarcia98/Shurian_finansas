import logging
from datetime import datetime, timedelta
from config import supabase, ADMIN_ID

logger = logging.getLogger(__name__)

async def check_pending_expenses(context):
    """
    Función que el JobQueue de Telegram ejecutará diariamente.
    Busca gastos PENDIENTES, cuyo due_date sea EXACTAMENTE mañana y notifica
    al usuario administrador. Una vez notificado, marca 'notified_24h' como True.
    """
    logger.info("Iniciando chequeo de vencimientos a 24 horas...")
    
    try:
        # Calcular fecha de mañana
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        
        # Consultar Supabase
        # .eq('status', 'pending') -> Solo PENDIENTES
        # .eq('due_date', tomorrow) -> Vence mañana (24hs)
        # .eq('notified_24h', False) -> Aún no notificado
        response = supabase.table('expenses').select('*')\
            .eq('status', 'pending')\
            .eq('due_date', tomorrow)\
            .eq('notified_24h', False)\
            .execute()
            
        data = response.data
        
        if not data:
            logger.info("No hay vencimientos pendientes para mañana.")
            return
            
        logger.info(f"Se encontraron {len(data)} vencimientos para notificar.")
        
        # Dispatch de mensajes y actualización de la DB
        for expense in data:
            mensaje_alerta = (
                f"⚠️ **RECORDATORIO IMPORTANTE** ⚠️\n\n"
                f"Mañana vence el siguiente gasto de **{expense['category']}**:\n\n"
                f"🏢 **Entidad:** `{expense['entity']}`\n"
                f"💰 **Monto a Pagar:** `${expense['amount']}`\n"
                f"🔢 **Código de Pago:** `{expense['payment_code']}`\n\n"
                f"Por favor marcá el pago cuando lo realices."
            )
            
            # Enviar mensaje por Telegram
            await context.bot.send_message(
                chat_id=ADMIN_ID,
                text=mensaje_alerta,
                parse_mode='Markdown'
            )
            
            # Marcar el registro como notificado
            supabase.table('expenses').update({"notified_24h": True}).eq('id', expense['id']).execute()
            
    except Exception as e:
        logger.error(f"Error en la tarea programada de alertas: {e}")
