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
            print(f"Error convirtiendo PDF a imagen: {e}")
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
        Extraer obligatoriamente los siguientes datos de la factura o ticket adjunto en formato JSON estricto.
        (Si detectas un código de barras visual, extrae también el string numérico).
        
        Estructura JSON requerida: Moda: [JSON puro]
        {
          "monto_total": "Solo el número final a pagar en formato 0.00",
          "fecha_vencimiento": "Formato DD/MM/AAAA",
          "codigo_pago": "Link, Banelco, VEP, o el código numérico de barras extraído visualmente",
          "entidad": "Nombre de la empresa o impuesto"
        }
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
            monto_str = data.get("monto_total", "0").replace("$", "").replace(" ", "").replace(".", "")
            if "," in data.get("monto_total", "0"):
                monto_str = data.get("monto_total", "0").replace("$", "").replace(" ", "").replace(".", "").replace(",", ".")
            
            data["monto_total"] = float(monto_str)
        except ValueError:
            data["monto_total"] = 0.0
            
        return data
        
    except json.JSONDecodeError:
        print(f"Error parseando JSON de Gemini. Respuesta cruda: {text_clean}")
        return None
    except Exception as e:
        print(f"Error en el procesamiento con Gemini: {e}")
        return None
    finally:
        # Limpieza de archivo temporal si fue creado a partir de un PDF
        if temp_image_path and os.path.exists(temp_image_path):
            os.remove(temp_image_path)

