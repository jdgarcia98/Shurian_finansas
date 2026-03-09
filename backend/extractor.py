import google.generativeai as genai
import json
import re
import os
import logging
from PIL import Image
from pdf2image import convert_from_path

logger = logging.getLogger(__name__)

def process_document(file_path: str) -> dict:
    """
    Recibe la ruta de un archivo (PDF, JPG, PNG) descargado por Telegram.
    Si es PDF, convierte la primera página en imagen. Luego lo pasa a Gemini para extraer los datos.
    """
    if not os.path.exists(file_path):
        return None

    image_to_process = None
    temp_image_path = None
    
    # 1. Determinar tipo de archivo y preparar imagen
    if file_path.lower().endswith('.pdf'):
        try:
            # Convertir la primera página del PDF a imagen (JPEG)
            pages = convert_from_path(file_path, first_page=1, last_page=1, dpi=200)
            if not pages:
                logger.error(f"No se pudieron extraer páginas del PDF: {file_path}")
                return None
                
            temp_image_path = file_path + "_temp.jpg"
            pages[0].save(temp_image_path, 'JPEG')
            image_to_process = Image.open(temp_image_path)
        except Exception as e:
            logger.error(f"Error convirtiendo PDF a imagen (¿Poppler instalado?): {e}")
            return None
    else:
        # Asumimos que es una imagen directa (JPG, PNG)
        try:
            image_to_process = Image.open(file_path)
        except Exception as e:
            logger.error(f"Error abriendo imagen {file_path}: {e}")
            return None
            
    # 1.1 Redimensionar si la imagen es muy grande para acelerar el procesamiento
    try:
        max_size = 1600
        if image_to_process.width > max_size or image_to_process.height > max_size:
            image_to_process.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
            logger.info(f"Imagen redimensionada a: {image_to_process.width}x{image_to_process.height}")
    except Exception as e:
        logger.error(f"Error redimensionando: {e}")
            
    try:
        logger.info(f"Iniciando llamada a Gemini Flash para: {file_path}")
        model = genai.GenerativeModel('gemini-flash-latest')
        
        # Configurar un timeout más largo (60 segundos)
        request_options = {"timeout": 60}
        
        prompt = """
        Eres un experto en procesar facturas y documentos financieros argentinos (VEPs, boletas de servicio, impuestos).
        Extrae los siguientes datos del documento adjunto y RESPONDE EXCLUSIVAMENTE CON UN OBJETO JSON VÁLIDO.
        
        Campos requeridos:
        1. "monto_total": El monto final a pagar. (Número sin símbolos).
        2. "fecha_vencimiento": La fecha de vencimiento en formato DD/MM/AAAA.
        3. "codigo_pago": El código para pagar (Link, Banelco, VEP, o el string numérico del código de barras).
        4. "entidad": El nombre de la empresa u organismo.
        5. "numero_comprobante": El número único de factura, comprobante, o boleta. Buscá campos como "N° Factura", "Comprobante N°", "N° de Operación", "Número de Boleta", o similares. Si no existe un número identificador, devolvé null.

        Si no encuentras un dato, pon null. 
        NO agregues texto antes ni después del JSON. NO uses bloques de código markdown.
        """
        
        response = model.generate_content([prompt, image_to_process], request_options=request_options)
        text = response.text.strip()
        logger.info(f"Respuesta recibida de Gemini (longitud: {len(text)})")
        
        # 3. Limpiar y parsear JSON (limpieza más agresiva)
        # Buscar el primer '{' y el último '}'
        start_idx = text.find('{')
        end_idx = text.rfind('}')
        
        if start_idx != -1 and end_idx != -1:
            text_clean = text[start_idx:end_idx+1]
        else:
            text_clean = text
            
        data = json.loads(text_clean)
        
        # Parseo seguro a flotante
        try:
            monto_raw = str(data.get("monto_total", "0"))
            monto_raw = monto_raw.replace("$", "").replace(" ", "")
            
            # Verificar si existe alguna coma o punto
            if "," in monto_raw and "." in monto_raw:
                # Determinar cuál es el separador de decimales (el que está más a la derecha)
                if monto_raw.rfind(",") > monto_raw.rfind("."):
                    monto_raw = monto_raw.replace(".", "").replace(",", ".")
                else:
                    monto_raw = monto_raw.replace(",", "")
            elif "," in monto_raw:
                monto_raw = monto_raw.replace(",", ".")
            # Si solo tiene punto, lo dejamos como está (ej. 1500.50)
            
            data["monto_total"] = float(monto_raw)
        except ValueError:
            data["monto_total"] = 0.0
            
        return data
        
    except json.JSONDecodeError as je:
        logger.error(f"Error parseando JSON de Gemini. Error: {je}")
        logger.error(f"Respuesta cruda de Gemini: ------------------\n{text}\n------------------")
        return None
    except Exception as e:
        logger.error(f"Error inesperado en el procesamiento con Gemini: {e}")
        return None
    finally:
        # Limpieza de archivo temporal si fue creado a partir de un PDF
        if temp_image_path and os.path.exists(temp_image_path):
            os.remove(temp_image_path)

