# complete_irctc_parseq_pipeline.py
# Fixed version with proper error handling

import asyncio
import sqlite3
import base64
import io
import os
import datetime
import traceback
import re
import pandas as pd
import xlwings as xw
from PIL import Image, ImageOps, ImageEnhance, ImageDraw, ImageFont
import cv2
import numpy as np
import torch
from playwright.async_api import async_playwright
import time
import tempfile
import torch.nn.functional as F

# ---------------- CONFIG ----------------
BROWSER_COUNT = 1
HEADLESS = False
EXCEL_PATH = r"G:\Project\IRCTC_OCR_MODEL\captchas.xlsx"
START_URL = "https://www.irctc.co.in/nget/train-search"
CAPTCHA_SELECTOR = "img.captcha-img"
REFRESH_SELECTOR = "span.glyphicon.glyphicon-repeat"
OK_BUTTON_SELECTOR = "button.btn.btn-primary:has-text('OK')"
LOGIN_SELECTOR = "a.loginText"
FETCH_DELAY = 0.3
OCR_WORKERS = 1
MAX_RETRIES = 3
SAVE_INTERVAL = 15
BATCH_SIZE = 1

# Allowed characters: include punctuation common in captchas
ALLOWED_CHARS = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@="
)

# GPU optimization settings
TORCH_CUDA_ARCH_LIST = "8.9"
TORCH_CUDNN_V8_API_ENABLED = "1"
os.environ["TORCH_CUDA_ARCH_LIST"] = TORCH_CUDA_ARCH_LIST
os.environ["TORCH_CUDNN_V8_API_ENABLED"] = TORCH_CUDNN_V8_API_ENABLED

# Character confusion mapping
CHAR_CONFUSION_MAP = {
    '0': 'O', 'O': '0',
    '1': 'I', 'I': '1',
    '5': 'S', 'S': '5',
    '8': 'B', 'B': '8',
    'G': '6', '6': 'G',
    'Q': '0', '0': 'Q',
    'Z': '2', '2': 'Z',
    'b': 'd', 'd': 'b',
    'p': 'q', 'q': 'p',
    'g': '9', '9': 'g',
}

# -------- Logging setup --------
class ColoredLogger:
    COLORS = {
        'INFO': '\033[94m',
        'SUCCESS': '\033[92m',
        'WARNING': '\033[93m',
        'ERROR': '\033[91m',
        'DEBUG': '\033[90m',
        'RESET': '\033[0m'
    }

    @staticmethod
    def log(level, message, worker_idx=None):
        # Get IST time with milliseconds
        ist = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5, minutes=30)))
        timestamp = ist.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        
        worker_str = f"[B{worker_idx}]" if worker_idx else "[SYSTEM]"
        color = ColoredLogger.COLORS.get(level, ColoredLogger.COLORS['RESET'])
        print(f"{color}[{timestamp}] {worker_str} [{level}] {message}{ColoredLogger.COLORS['RESET']}")

# -------- Ensure Excel file exists --------
# Replace the ensure_excel_file function with this:
def ensure_excel_file(path):
    if os.path.exists(path):
        try:
            # Remove read-only attribute if it exists
            if not os.access(path, os.W_OK):
                ColoredLogger.log('INFO', f"Removing read-only attribute from: {path}")
                os.chmod(path, 0o666)  # Make file writable
            
            app = xw.App(visible=False)
            wb = app.books.open(path)
            wb.close()
            app.quit()
            ColoredLogger.log('INFO', f"Using existing Excel file: {path}")
        except Exception as e:
            ColoredLogger.log('WARNING', f"Existing Excel file may be corrupted: {e}")
            backup_path = path + f".backup_{int(time.time())}.xlsx"
            os.rename(path, backup_path)
            ColoredLogger.log('INFO', f"Created backup: {backup_path}")
            create_new_excel_file(path)
    else:
        create_new_excel_file(path)

def create_new_excel_file(path):
    try:
        app = xw.App(visible=False)
        wb = app.books.add()
        headers = ["SlNo", "ProcessedImage", "OCRText", "Base64String", "Confidence", "Timestamp", "CharBoxes"]
        wb.sheets[0].range('A1:G1').value = headers
        wb.sheets[0].range('A:A').column_width = 8
        wb.sheets[0].range('B:B').column_width = 25
        wb.sheets[0].range('C:C').column_width = 15
        wb.sheets[0].range('D:D').column_width = 30
        wb.sheets[0].range('E:E').column_width = 12
        wb.sheets[0].range('F:F').column_width = 30
        wb.sheets[0].range('G:G').column_width = 25
        wb.sheets[0].api.Rows.RowHeight = 40
        wb.save(path)
        wb.close()
        app.quit()
        ColoredLogger.log('SUCCESS', f"Created new Excel file: {path}")
    except Exception as e:
        ColoredLogger.log('ERROR', f"Failed to create Excel file: {e}")
        raise

# -------- Load PARSeq (global) --------
device = "cuda" if torch.cuda.is_available() else "cpu"
ColoredLogger.log('INFO', f"Loading PARSeq on {device.upper()} (this may take time).")

# Enable TF32
torch.backends.cuda.matmul.allow_tf32 = True
torch.backends.cudnn.allow_tf32 = True

# Initialize global variables
parseq = None
img_transform = None

try:
    # First try to install missing dependencies
    try:
        import nltk
    except ImportError:
        ColoredLogger.log('WARNING', "nltk not found, attempting to install...")
        import subprocess
        import sys
        subprocess.check_call([sys.executable, "-m", "pip", "install", "nltk"])
        import nltk
    
    # Load parseq via torch.hub
    parseq = torch.hub.load('baudm/parseq', 'parseq', pretrained=True).eval().to(device)
    
    # Try to get the recommended transform
    try:
        from strhub.data.utils import create_transform
        parseq_img_size = parseq.hparams.img_size
        
        # Handle case where img_size might be a list/tuple
        if isinstance(parseq_img_size, (list, tuple)):
            parseq_img_size = parseq_img_size[0]  # Take first element
            ColoredLogger.log('INFO', f"Using image size: {parseq_img_size} (extracted from list)")
        
        img_transform = create_transform(parseq_img_size, False, True)
        ColoredLogger.log('INFO', f"Using PARSeq transform with size {parseq_img_size}")
    except Exception as e:
        ColoredLogger.log('WARNING', f"Could not create PARSeq transform: {e}. Will use fallback transforms.")
        
        # Create a simple fallback transform
        # In the PARSeq loading section, replace the fallback transform with:
        def simple_transform(img):
            img = img.convert('RGB')
            # Resize to exact dimensions that PARSeq expects
            img = img.resize((128, 32), Image.Resampling.LANCZOS)  # PARSeq standard size
            
            # Convert to tensor and normalize
            img_array = np.array(img).astype(np.float32) / 255.0
            img_array = (img_array - 0.5) / 0.5  # Basic normalization
            return torch.tensor(img_array).permute(2, 0, 1)  # HWC -> CHW
        
        img_transform = simple_transform

    # Optionally use half precision for GPU
    if device == "cuda":
        try:
            parseq = parseq.half()
            ColoredLogger.log('INFO', "Enabled half-precision for PARSeq inference")
        except Exception as e:
            ColoredLogger.log('WARNING', f"Could not enable half-precision: {e}")

    ColoredLogger.log('SUCCESS', f"PARSeq loaded successfully on {device.upper()}.")
    
except Exception as e:
    ColoredLogger.log('ERROR', f"Failed to load PARSeq: {e}")
    ColoredLogger.log('INFO', "Please install missing dependencies: pip install nltk")
    # Exit if PARSeq cannot be loaded
    raise

# -------- Image processing functions (modified) --------
def preprocess_captcha_image(b64_str):
    """
    Preprocess captcha image from base64 string
    Returns:
    - png_bytes: Processed image bytes for Excel
    - img_for_ocr: PIL.Image (RGB) for PARSeq
    - char_boxes_img_bytes: visualization bytes
    """
    try:
        raw = base64.b64decode(b64_str)
        # Load as RGB to preserve case-sensitive strokes/colors
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        
        # Convert to white background with black text
        img = convert_to_white_background(img)
        
        # Gentle enhancement
        img = advanced_image_enhancement(img)
        
        # Crop only excess whitespace from sides (not top/bottom)
        img = crop_excess_whitespace_sides(img)
        
        # Resize for PARSeq
        img = resize_for_parseq(img)
        
        # Save PNG bytes for Excel
        png_buf = io.BytesIO()
        img.save(png_buf, format="PNG")
        png_bytes = png_buf.getvalue()
        
        # Create char boxes visualization (works on current processed image)
        char_boxes_img = create_char_boxes_image(img.copy())
        char_boxes_buf = io.BytesIO()
        char_boxes_img.save(char_boxes_buf, format="PNG")
        char_boxes_img_bytes = char_boxes_buf.getvalue()
        
        # Return RGB PIL image for PARSeq
        img_for_ocr = img.convert("RGB")
        
        return png_bytes, img_for_ocr, char_boxes_img_bytes
        
    except Exception as e:
        ColoredLogger.log('ERROR', f"Image preprocessing failed: {e}")
        raise

def convert_to_white_background(img):
    """
    Convert image to white background with black text
    """
    # Convert to numpy array for processing
    arr = np.array(img)
    
    # Calculate average brightness to determine if we need to invert
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    mean_brightness = gray.mean()
    
    # If the image is mostly dark, invert it to get black text on white
    if mean_brightness < 127:
        # Invert the image (black text becomes white, background becomes black)
        inverted = cv2.bitwise_not(arr)
        # Create a white background
        white_bg = np.ones_like(arr) * 255
        # Use the inverted image as mask (white text on black background)
        # Where inverted is black (background), use white; where inverted is white (text), use black
        result = np.where(inverted < 50, 0, white_bg)  # Text becomes black, background becomes white
    else:
        # Image is already light, ensure white background with black text
        # Create a white background
        white_bg = np.ones_like(arr) * 255
        # Use threshold to identify text regions
        gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
        _, mask = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
        # Where mask has text, use black; otherwise use white
        result = np.zeros_like(arr)
        result[mask == 0] = [255, 255, 255]  # Background white
        result[mask == 255] = [0, 0, 0]      # Text black
    
    return Image.fromarray(result.astype(np.uint8))

def advanced_image_enhancement(img):
    """
    Gentle enhancement for PARSeq: mild denoising, slight contrast,
    avoid heavy sharpening that destroys lowercase bowls.
    Input: RGB PIL Image
    Return: RGB PIL Image (but many transforms operate on grayscale)
    """
    try:
        # Convert to grayscale for denoising steps, but keep original color for final output
        arr = np.array(img)
        gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
        
        # Mild bilateral filter for denoising while preserving edges
        denoised = cv2.bilateralFilter(gray, d=5, sigmaColor=75, sigmaSpace=75)
        
        # Slight adaptive thresholding (not too aggressive)
        thresh = cv2.adaptiveThreshold(denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                      cv2.THRESH_BINARY, 15, 3)
        
        # Convert back to RGB and blend with original lightly to preserve strokes
        thr_rgb = cv2.cvtColor(thresh, cv2.COLOR_GRAY2RGB)
        blended = cv2.addWeighted(arr, 0.85, thr_rgb, 0.15, 0)
        
        pil_img = Image.fromarray(blended)
        
        # Mild contrast and small sharpening
        enhancer = ImageEnhance.Contrast(pil_img)
        pil_img = enhancer.enhance(1.2)  # gentle
        sharp = ImageEnhance.Sharpness(pil_img)
        pil_img = sharp.enhance(1.1)     # mild
        
        return pil_img
    except Exception as e:
        ColoredLogger.log('WARNING', f"advanced_image_enhancement fallback: {e}")
        return img

def crop_excess_whitespace_sides(img):
    """
    Crop only excess whitespace from left and right sides using strip method
    Don't crop from top or bottom to prevent losing characters
    """
    # Convert to numpy array for processing
    arr = np.array(img.convert('L'))
    height, width = arr.shape
    
    # Divide into 5px wide vertical strips
    strip_width = 5
    num_strips = width // strip_width
    
    # Find left crop position
    left_crop = 0
    for i in range(num_strips):
        strip_start = i * strip_width
        strip_end = min((i + 1) * strip_width, width)
        strip = arr[:, strip_start:strip_end]
        
        # Check if strip contains any non-white pixels (text)
        if np.any(strip < 245):  # Not completely white (has some text)
            left_crop = max(0, strip_start - 5)  # Keep 5px padding
            break
    
    # Find right crop position
    right_crop = width
    for i in range(num_strips - 1, -1, -1):
        strip_start = i * strip_width
        strip_end = min((i + 1) * strip_width, width)
        strip = arr[:, strip_start:strip_end]
        
        # Check if strip contains any non-white pixels (text)
        if np.any(strip < 245):  # Not completely white (has some text)
            right_crop = min(width, strip_end + 5)  # Keep 5px padding
            break
    
    # Apply cropping only if we found meaningful boundaries
    # Don't crop if it would remove too much (keep at least 20px width)
    if right_crop - left_crop > 20:
        return img.crop((left_crop, 0, right_crop, height))
    else:
        return img

def resize_for_parseq(img):
    """Resize to the exact target size that PARSeq expects."""
    try:
        width, height = img.size
        
        # Get target size from model params - PARSeq expects 128x32
        target_height = 32  # PARSeq standard height
        target_width = 128  # PARSeq standard width
        
        # Resize to exact dimensions that PARSeq expects
        return img.resize((target_width, target_height), Image.Resampling.LANCZOS)
    
    except Exception as e:
        ColoredLogger.log('ERROR', f"Error in resize_for_parseq: {e}")
        # Fallback: return original image
        return img
    
    except Exception as e:
        ColoredLogger.log('ERROR', f"Error in resize_for_parseq: {e}")
        # Fallback: return original image
        return img

def create_char_boxes_image(img):
    """Create image with thin light green boxes around characters and small purple text in bottom area."""
    # Convert to numpy array for processing
    img_array = np.array(img.convert('RGB'))
    original_height, original_width = img_array.shape[:2]
    
    # Add 15px white background at the bottom (increased from 10px for better text visibility)
    bottom_padding = 15
    new_height = original_height + bottom_padding
    new_img_array = np.ones((new_height, original_width, 3), dtype=np.uint8) * 255  # White background
    new_img_array[:original_height, :] = img_array  # Place original image on top
    
    # Find contours in the original image
    gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    _, thresh = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=lambda c: cv2.boundingRect(c)[0])
    
    # Get OCR prediction for this image
    text, confidence, char_confidences = run_parseq_sync(img)
    
    # Draw character boxes and predictions
    for i, contour in enumerate(contours):
        x, y, w, h = cv2.boundingRect(contour)
        if w > 3 and h > 5:  # Reduced minimum size for better detection
            # Draw thin light green box around character (thickness=1, light green color)
            cv2.rectangle(new_img_array, (x, y), (x + w, y + h), (144, 238, 144), 1)
            
            # Add predicted character in purple in the bottom white area
            if i < len(text):
                char = text[i]
                # Calculate position in the white bottom area
                text_y = original_height + 10  # 10px from top of white area
                text_x = x + w//2 - 3  # Center the character
                
                # Draw small purple text (font scale=0.4, thickness=1)
                cv2.putText(new_img_array, char, (text_x, text_y),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.4, (180, 0, 180), 1, cv2.LINE_AA)
    
    return Image.fromarray(new_img_array)

def filter_allowed_chars(text):
    """Filter text to only include allowed characters and remove spaces."""
    filtered = ''.join(c for c in text if c in ALLOWED_CHARS)
    return filtered

def correct_character_confusions(text, confidence_scores=None):
    """
    Apply intelligent corrections only when low confidence and mapping is safe.
    Avoid any blanket case forcing.
    """
    if not text:
        return text
    if confidence_scores and len(confidence_scores) == len(text):
        corrected_chars = []
        for i, ch in enumerate(text):
            conf = confidence_scores[i]
            if conf < 0.6 and ch in CHAR_CONFUSION_MAP:
                corrected_chars.append(CHAR_CONFUSION_MAP[ch])
            else:
                corrected_chars.append(ch)
        return ''.join(corrected_chars)
    return text

# -------- Improved confidence calculation --------
def calculate_confidence_from_probs(probs, pred_ids):
    """
    Improved confidence calculation with better handling of sequence probabilities.
    """
    try:
        probs_np = probs.detach().cpu().numpy()
        pred_np = pred_ids.detach().cpu().numpy()
        
        char_confidences = []
        T = probs_np.shape[1]
        
        for t in range(T):
            chosen = pred_np[0, t]
            p = probs_np[0, t, int(chosen)]
            char_confidences.append(float(p))
        
        # Find valid probabilities
        valid_probs = []
        for i, p in enumerate(char_confidences):
            if p > 0.1:
                valid_probs.append(p)
            else:
                break
        
        if not valid_probs:
            return 0.0, char_confidences
        
        # Calculate geometric mean
        log_probs = np.log(np.array(valid_probs))
        geometric_mean = np.exp(log_probs.mean())
        
        overall_confidence = geometric_mean * 100
        
        return overall_confidence, char_confidences
    except Exception as e:
        ColoredLogger.log('ERROR', f"Confidence calculation failed: {e}")
        return 0.0, []

# -------- PARSeq inference function --------
def run_parseq_sync(img_for_ocr):
    """
    Synchronous PARSeq inference. Accepts PIL.Image (RGB).
    Returns: filtered_text, overall_confidence (0-100), char_confidences
    """
    try:
        # Use the transform if available
        if img_transform is not None:
            inp = img_transform(img_for_ocr).unsqueeze(0)
        else:
            # Fallback: simple resize & normalize
            w, h = img_for_ocr.size
            
            # Get target size from model params, handle if it's a list
            target_size = getattr(parseq.hparams, 'img_size', 112)
            if isinstance(target_size, (list, tuple)):
                target_size = target_size[0]
                
            new_w = int(w * (target_size / max(1, h)))
            img_resized = img_for_ocr.resize((new_w, target_size), Image.Resampling.LANCZOS)
            
            # Convert to tensor and normalize
            arr = np.array(img_resized).astype(np.float32) / 255.0
            arr = (arr - 0.5) / 0.5
            inp = torch.tensor(arr).permute(2, 0, 1).unsqueeze(0)

        # Move to device and dtype
        inp = inp.to(device)
        if device == "cuda" and hasattr(parseq, 'half'):
            try:
                inp = inp.half()
            except Exception:
                pass

        with torch.no_grad():
            logits = parseq(inp)
            probs = torch.softmax(logits, dim=-1)
            pred_ids = torch.argmax(probs, dim=-1)

        # Use tokenizer.decode if available for label + confidence
        try:
            label, conf = parseq.tokenizer.decode(probs)
            decoded = label[0] if isinstance(label, (list, tuple)) else str(label)
            overall_conf = conf[0] if isinstance(conf, (list, tuple)) else float(conf)
            overall2, char_conf = calculate_confidence_from_probs(probs, pred_ids)
            if overall2 > 0:
                overall_conf = overall2
            return filter_allowed_chars(decoded.strip()), overall_conf, char_conf
        except Exception:
            # Fallback decoding
            try:
                decoded = parseq.decode(logits) if hasattr(parseq, 'decode') else "".join(
                    [parseq.tokenizer.idx2char[int(i)] for i in pred_ids[0] if int(i) in parseq.tokenizer.idx2char]
                )
            except Exception:
                decoded_chars = []
                if hasattr(parseq, 'tokenizer') and hasattr(parseq.tokenizer, 'idx2char'):
                    for idx in pred_ids[0]:
                        ch = parseq.tokenizer.idx2char.get(int(idx), '')
                        decoded_chars.append(ch)
                    decoded = "".join(decoded_chars)
                else:
                    decoded = ""
            overall_conf, char_conf = calculate_confidence_from_probs(probs, pred_ids)
            return filter_allowed_chars(decoded.strip()), overall_conf, char_conf

    except Exception as e:
        ColoredLogger.log('ERROR', f"PARSeq OCR processing failed: {e}")
        return "", 0.0, []

# -------- Excel writer coroutine --------

# -------- SQLite writer coroutine --------
async def excel_writer(excel_queue):
    # Create SQLite database connection
    db_path = EXCEL_PATH.replace('.xlsx', '.db')
    conn = sqlite3.connect(db_path, check_same_thread=False)
    cursor = conn.cursor()
    
    # Create table if it doesn't exist with the exact column sequence
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS captchas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slno INTEGER,
        processed_image_blob BLOB,
        ocr_text TEXT,
        b64 TEXT,
        confidence REAL,
        timestamp TEXT,
        boxes_image_blob BLOB
    )
    ''')
    conn.commit()
    
    try:
        # Find the next slno
        cursor.execute('SELECT MAX(slno) FROM captchas')
        result = cursor.fetchone()
        row_idx = result[0] + 1 if result[0] is not None else 1
        
        ColoredLogger.log('INFO', f"SQLite writer ready. Starting from slno {row_idx}")
        
        batch_data = []
        processed_count = 0
        
        while True:
            rec = await excel_queue.get()
            if rec is None:
                # Save any remaining batch data before exiting
                if batch_data:
                    success = save_batch_to_sqlite(cursor, conn, batch_data, row_idx)
                    if success:
                        row_idx += len(batch_data)
                break
                
            png_bytes, ocr_text, b64, confidence, ts, char_boxes_img_bytes = rec
            
            try:
                # Convert timestamp to IST with milliseconds
                ist_ts = ts.astimezone(datetime.timezone(datetime.timedelta(hours=5, minutes=30)))
                timestamp_str = ist_ts.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
                
                batch_data.append({
                    'slno': row_idx + len(batch_data),
                    'processed_image_blob': sqlite3.Binary(png_bytes),
                    'ocr_text': ocr_text,
                    'b64': b64,
                    'confidence': confidence,
                    'timestamp': timestamp_str,
                    'boxes_image_blob': sqlite3.Binary(char_boxes_img_bytes)
                })
                
                processed_count += 1
                
                # Save batch when it reaches BATCH_SIZE
                if len(batch_data) >= BATCH_SIZE:
                    success = save_batch_to_sqlite(cursor, conn, batch_data, row_idx)
                    if success:
                        row_idx += len(batch_data)
                        batch_data = []
                        ColoredLogger.log('DEBUG', f"Saved batch. Total processed: {processed_count}")
                
                # Periodic save to prevent data loss
                if processed_count % SAVE_INTERVAL == 0 and batch_data:
                    success = save_batch_to_sqlite(cursor, conn, batch_data, row_idx)
                    if success:
                        row_idx += len(batch_data)
                        batch_data = []
                        ColoredLogger.log('DEBUG', f"Periodic save. Total processed: {processed_count}")
                    
            except Exception as e:
                ColoredLogger.log('ERROR', f"SQLite queue processing failed: {e}")
            
            excel_queue.task_done()
        
        ColoredLogger.log('INFO', f"SQLite writer exiting. Total records processed: {processed_count}")
        
    except Exception as e:
        ColoredLogger.log('ERROR', f"SQLite writer initialization failed: {e}")
    finally:
        # Ensure proper cleanup
        try:
            conn.commit()
            conn.close()
        except Exception:
            pass

def save_batch_to_sqlite(cursor, conn, batch_data, start_row):
    try:
        for i, data in enumerate(batch_data):
            cursor.execute('''
            INSERT INTO captchas (slno, processed_image_blob, ocr_text, b64, confidence, timestamp, boxes_image_blob)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (data['slno'], data['processed_image_blob'], data['ocr_text'], data['b64'], 
                  data['confidence'], data['timestamp'], data['boxes_image_blob']))
        
        conn.commit()
        ColoredLogger.log('DEBUG', f"Saved batch of {len(batch_data)} records to SQLite")
        return True
        
    except Exception as e:
        ColoredLogger.log('ERROR', f"Save batch to SQLite failed: {e}")
        return False
# -------- OCR worker coroutine --------
async def ocr_worker(ocr_queue, excel_queue, loop, worker_id):
    ColoredLogger.log('INFO', f"OCR worker {worker_id} started on {device.upper()}.")
    while True:
        item = await ocr_queue.get()
        if item is None:
            break
        png_bytes, img_for_ocr, b64, ts, browser_id, char_boxes_img_bytes = item
        try:
            text, conf, char_conf = await loop.run_in_executor(None, run_parseq_sync, img_for_ocr)
            await excel_queue.put((png_bytes, text, b64, conf, ts, char_boxes_img_bytes))
            if conf > 70.0:
                ColoredLogger.log('DEBUG', f"OCR processed: '{text}' (conf: {conf:.1f}%)", browser_id)
            else:
                ColoredLogger.log('WARNING', f"Low confidence OCR: '{text}' (conf: {conf:.1f}%)", browser_id)
        except Exception as e:
            ColoredLogger.log('ERROR', f"OCR processing failed: {e}", browser_id)
        ocr_queue.task_done()
    ColoredLogger.log('INFO', f"OCR worker {worker_id} exiting.")

# -------- Browser worker coroutine --------
async def browser_worker(worker_idx, ocr_queue, p):
    ColoredLogger.log('INFO', f"Initializing browser {worker_idx}", worker_idx)
    browser = None
    page = None
    retry_count = 0
    while retry_count < MAX_RETRIES:
        try:
            browser = await p.chromium.launch(
                headless=HEADLESS,
                args=['--start-maximized', '--disable-gpu-vsync']
            )
            context = await browser.new_context(no_viewport=True)
            page = await context.new_page()
            screen_width, screen_height = 1920, 1080
            try:
                screen = await page.evaluate("""() => {
                    return { width: window.screen.width, height: window.screen.height };
                }""")
                screen_width, screen_height = screen['width'], screen['height']
            except:
                pass
            await page.set_viewport_size({"width": screen_width, "height": screen_height})
            ColoredLogger.log('INFO', f"Browser {worker_idx} launched with resolution {screen_width}x{screen_height}", worker_idx)
            await page.goto(START_URL, timeout=60000)
            ColoredLogger.log('INFO', f"Page loaded successfully", worker_idx)
            try:
                ok = page.locator(OK_BUTTON_SELECTOR)
                await ok.wait_for(state="visible", timeout=7000)
                await ok.click()
                await asyncio.sleep(0.3)
                ColoredLogger.log('INFO', "Closed popup", worker_idx)
            except Exception:
                pass
            try:
                login = page.locator(LOGIN_SELECTOR)
                await login.wait_for(state="visible", timeout=7000)
                await login.click()
                await asyncio.sleep(0.6)
                ColoredLogger.log('INFO', "Clicked LOGIN", worker_idx)
            except Exception as e:
                ColoredLogger.log('WARNING', f"LOGIN click issue: {e}", worker_idx)
            captcha_count = 0
            while True:
                try:
                    captcha = page.locator(CAPTCHA_SELECTOR).first
                    await captcha.wait_for(state="visible", timeout=15000)
                    src = await captcha.get_attribute("src")
                    if not src or not src.startswith("data:image"):
                        await asyncio.sleep(0.2)
                        continue
                    b64 = src.split(",", 1)[1]
                    ColoredLogger.log('DEBUG', f"Captured base64 string (length: {len(b64)})", worker_idx)
                    # Preprocess now (fast)
                    png_bytes, img_for_ocr, char_boxes_img_bytes = await asyncio.get_running_loop().run_in_executor(
                        None, preprocess_captcha_image, b64
                    )
                    ts = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5, minutes=30)))
                    await ocr_queue.put((png_bytes, img_for_ocr, b64, ts, worker_idx, char_boxes_img_bytes))
                    captcha_count += 1
                    ColoredLogger.log('INFO', f"Captcha #{captcha_count} queued for OCR", worker_idx)
                    try:
                        await page.locator(REFRESH_SELECTOR).click()
                        ColoredLogger.log('DEBUG', "Clicked refresh button", worker_idx)
                    except Exception:
                        try:
                            await captcha.click()
                            ColoredLogger.log('DEBUG', "Clicked captcha to refresh", worker_idx)
                        except Exception as e:
                            ColoredLogger.log('WARNING', f"Refresh failed: {e}", worker_idx)
                    await asyncio.sleep(FETCH_DELAY)
                except asyncio.CancelledError:
                    ColoredLogger.log('INFO', "Browser worker cancelled", worker_idx)
                    break
                except Exception as e:
                    ColoredLogger.log('ERROR', f"Captcha processing error: {e}", worker_idx)
                    await asyncio.sleep(1)
            break
        except Exception as e:
            retry_count += 1
            ColoredLogger.log('ERROR', f"Browser initialization failed (attempt {retry_count}/{MAX_RETRIES}): {e}", worker_idx)
            if browser:
                await browser.close()
            if retry_count >= MAX_RETRIES:
                ColoredLogger.log('ERROR', f"Max retries exceeded for browser {worker_idx}", worker_idx)
                break
            await asyncio.sleep(2)
    if browser:
        await browser.close()
        ColoredLogger.log('INFO', f"Browser {worker_idx} closed", worker_idx)

# -------- Main entrypoint --------
async def main():
    ensure_excel_file(EXCEL_PATH)
    loop = asyncio.get_running_loop()
    ocr_queue = asyncio.Queue(maxsize=2000)
    excel_queue = asyncio.Queue(maxsize=2000)
    excel_task = asyncio.create_task(excel_writer(excel_queue))
    ocr_tasks = [asyncio.create_task(ocr_worker(ocr_queue, excel_queue, loop, i+1))
                 for i in range(OCR_WORKERS)]
    async with async_playwright() as p:
        browser_tasks = []
        for i in range(BROWSER_COUNT):
            t = asyncio.create_task(browser_worker(i + 1, ocr_queue, p))
            browser_tasks.append(t)
            await asyncio.sleep(1)
        ColoredLogger.log('SUCCESS', f"Pipeline started with {BROWSER_COUNT} browsers. Press Ctrl+C to stop.")
        try:
            await asyncio.Event().wait()
        except KeyboardInterrupt:
            ColoredLogger.log('INFO', "Shutdown requested. Stopping gracefully...")
        for t in browser_tasks:
            t.cancel()
        await asyncio.gather(*browser_tasks, return_exceptions=True)
        for _ in range(OCR_WORKERS):
            await ocr_queue.put(None)
        await asyncio.gather(*ocr_tasks, return_exceptions=True)
        await excel_queue.put(None)
        await excel_task

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        ColoredLogger.log('ERROR', f"Fatal error: {e}")
        ColoredLogger.log('ERROR', traceback.format_exc())