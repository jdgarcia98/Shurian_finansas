import google.generativeai as genai
import json
import re
import os
from PIL import Image
from pdf2image import convert_from_path

def process_document(file_path: str) -> dict:
    """
    Recibe la ruta de un archivo (PDF, JPG, PNG) descargado por Telegram.
    Si es PDF, convierte la primera página en imagen. Luego lo pasa a Gemini para extraer los datos.
    """
    image_to_process = None
    temp_image_path = None
    
    # 1. Determinar tipo de archivo y preparar imagen
    if file_path.lower().endswith('.pdf'):
        try:
            # Convertir la primera página del PDF a imagen (JPEG)
            pages = convert_from_path(file_path, first_page=1, last_page=1, dpi=200)
            if not pages:
                print("No se pudieron extraer páginas del PDF.")
                return None
                
            temp_image_path = file_path + "_temp.jpg"
            pages[0].save(temp_image_path, 'JPEG')
            image_to_process = Image.open(temp_image_path)
        except Exception as e:
            print(f"Error convirtiendo PDF a imagen (¿Poppler instalado?): {e}")
            return None
    else:
        # Asumimos que es una imagen directa (JPG, PNG)
        try:
            image_to_process = Image.open(file_path)
        except Exception as e:
            print(f"Error abriendo imagen: {e}")
            return None
            
    # 2. Llamada a Gemini (Multimodal)
    try:
        # Usar el alias detectado en el diagnóstico: gemini-flash-latest
        model = genai.GenerativeModel('gemini-flash-latest')
        
        prompt = """
        Eres un experto en procesar facturas y documentos financieros argentinos (VEPs, boletas de servicio, impuestos).
        Extrae obligatoriamente los siguientes datos del documento adjunto en formato JSON estricto.
        
        Campos requeridos:
        1. "monto_total": El monto final a pagar. (Solo el número).
        2. "fecha_vencimiento": La fecha de vencimiento en formato DD/MM/AAAA.
        3. "codigo_pago": El código para pagar (Link, Banelco, VEP, o el string numérico del código de barras si lo detectas).
        4. "entidad": El nombre de la empresa, organismo o impuesto (p. ej. AFIP, EPE, Municipalidad).

        IMPORTANTE: Si detectas un código de barras visual, extrae el número largo que lo representa.
        Responde exclusivamente con el objeto JSON, sin texto adicional.
        """
        
        response = model.generate_content([prompt, image_to_process])
        text = response.text
        
        # 3. Limpiar y parsear JSON
        text_clean = re.sub(r'```json\s*', '', text)
        text_clean = re.sub(r'\s*```', '', text_clean)
        text_clean = text_clean.strip()
        
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
        print(f"Error parseando JSON de Gemini. Error: {je}")
        print(f"Respuesta cruda de Gemini: ------------------\n{text}\n------------------")
        return None
    except Exception as e:
        print(f"Error inesperado en el procesamiento con Gemini: {e}")
        import traceback
        traceback.print_exc()
        return None
    finally:
        # Limpieza de archivo temporal si fue creado a partir de un PDF
        if temp_image_path and os.path.exists(temp_image_path):
            os.remove(temp_image_path)

