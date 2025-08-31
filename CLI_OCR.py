# standalone_irctc_parseq_ocr.py
# Modified version for terminal input with base64 strings

import base64
import io
import os
import datetime
import traceback
import re
import cv2
import numpy as np
import torch
from PIL import Image, ImageOps, ImageEnhance, ImageDraw, ImageFont
import sqlite3
import torch.nn.functional as F
import sys

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
    def log(level, message):
        # Get IST time with milliseconds
        ist = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5
, minutes=30)))
        timestamp = ist.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

        color = ColoredLogger.COLORS.get(level, ColoredLogger.COLORS['RESET'])
        # Use stderr for logs to keep stdout clean for OCR results
        print(f"{color}[{timestamp}] [{level}] {message}{ColoredLogger.COLORS['RESET']}", file=sys.stderr, flush=True)

class IRCTCOCRProcessor:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.parseq = None
        self.img_transform = None
        self.conn = None
        self.cursor = None
        self.next_slno = 1

        self._load_parseq()
        self._init_database()

    def _load_parseq(self):
        """Load PARSeq model"""
        ColoredLogger.log('INFO', f"Loading PARSeq on {self.device.upper()} (this may take time).")

        # Enable TF32
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True

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
            self.parseq = torch.hub.load('baudm/parseq', 'parseq', pretrained=True).eval().to(self.device)

            # Try to get the recommended transform
            try:
                from strhub.data.utils import create_transform
                parseq_img_size = self.parseq.hparams.img_size

                # Handle case where img_size might be a list/tuple
                if isinstance(parseq_img_size, (list, tuple)):
                    parseq_img_size = parseq_img_size[0]  # Take first element
                    ColoredLogger.log('INFO', f"Using image size: {parseq_img_size} (extracted from list)")

                self.img_transform = create_transform(parseq_img_size, False, True)
                ColoredLogger.log('INFO', f"Using PARSeq transform with size {parseq_img_size}")
            except Exception as e:
                ColoredLogger.log('WARNING', f"Could not create PARSeq transform: {e}. Will use fallback transforms.")

                # Create a simple fallback transform
                def simple_transform(img):
                    img = img.convert('RGB')
                    # Resize to exact dimensions that PARSeq expects
                    img = img.resize((128, 32), Image.Resampling.LANCZOS)  # PARSeq standard size

                    # Convert to tensor and normalize
                    img_array = np.array(img).astype(np.float32) / 255.0
                    img_array = (img_array - 0.5) / 0.5  # Basic normalization
                    return torch.tensor(img_array).permute(2, 0, 1)  # HWC -> CHW

                self.img_transform = simple_transform

            # Optionally use half precision for GPU
            if self.device == "cuda":
                try:
                    self.parseq = self.parseq.half()
                    ColoredLogger.log('INFO', "Enabled half-precision for PARSeq inference")
                except Exception as e:
                    ColoredLogger.log('WARNING', f"Could not enable half-precision: {e}")

            ColoredLogger.log('SUCCESS', f"PARSeq loaded successfully on {self.device.upper()}.")

        except Exception as e:
            ColoredLogger.log('ERROR', f"Failed to load PARSeq: {e}")
            ColoredLogger.log('INFO', "Please install missing dependencies: pip install nltk")
            raise

    def _init_database(self):
        """Initialize SQLite database"""
        db_path = "captchas.db"
        self.conn = sqlite3.connect(db_path)
        self.cursor = self.conn.cursor()

        # Create table if it doesn't exist
        self.cursor.execute('''
        CREATE TABLE IF NOT EXISTS captchas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slno INTEGER,
            processed_image_blob BLOB,
            ocr_text TEXT,
            b64 TEXT,
            timestamp TEXT
        )
        ''')
        self.conn.commit()

        # Find the next slno
        self.cursor.execute('SELECT MAX(slno) FROM captchas')
        result = self.cursor.fetchone()
        self.next_slno = result[0] + 1 if result[0] is not None else 1

        ColoredLogger.log('INFO', f"Database initialized. Starting from slno {self.next_slno}")

    def _save_to_database(self, png_bytes, ocr_text, b64, timestamp):
        """Save record to database"""
        try:
            self.cursor.execute('''
            INSERT INTO captchas (slno, processed_image_blob, ocr_text, b64, timestamp)
            VALUES (?, ?, ?, ?, ?)
            ''', (self.next_slno, sqlite3.Binary(png_bytes), ocr_text, b64, timestamp))

            self.conn.commit()
            self.next_slno += 1
            return True
        except Exception as e:
            ColoredLogger.log('ERROR', f"Database save failed: {e}")
            return False

    def _preprocess_captcha_image(self, b64_str):
        """
        Preprocess captcha image from base64 string
        Returns:
        - png_bytes: Processed image bytes for display
        - img_for_ocr: PIL.Image (RGB) for PARSeq
        """
        try:
            raw = base64.b64decode(b64_str)
            # Load as RGB to preserve case-sensitive strokes/colors
            img = Image.open(io.BytesIO(raw)).convert("RGB")

            # Convert to white background with black text
            img = self._convert_to_white_background(img)

            # Gentle enhancement
            img = self._advanced_image_enhancement(img)

            # Crop only excess whitespace from sides (not top/bottom)
            img = self._crop_excess_whitespace_sides(img)

            # Resize for PARSeq
            img = self._resize_for_parseq(img)

            # Save PNG bytes for display
            png_buf = io.BytesIO()
            img.save(png_buf, format="PNG")
            png_bytes = png_buf.getvalue()

            # Return RGB PIL image for PARSeq
            img_for_ocr = img.convert("RGB")

            return png_bytes, img_for_ocr

        except Exception as e:
            ColoredLogger.log('ERROR', f"Image preprocessing failed: {e}")
            raise

    def _convert_to_white_background(self, img):
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
            result = np.where(inverted < 50, 0, white_bg)  # Text becomes black,
# background becomes white
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

    def _advanced_image_enhancement(self, img):
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

    def _crop_excess_whitespace_sides(self, img):
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

    def _resize_for_parseq(self, img):
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

    def _filter_allowed_chars(self, text):
        """Filter text to only include allowed characters and remove spaces."""
        filtered = ''.join(c for c in text if c in ALLOWED_CHARS)
        return filtered

    def _run_parseq_sync(self, img_for_ocr):
        """
        Synchronous PARSeq inference. Accepts PIL.Image (RGB).
        Returns: filtered_text
        """
        try:
            # Use the transform if available
            if self.img_transform is not None:
                inp = self.img_transform(img_for_ocr).unsqueeze(0)
            else:
                # Fallback: simple resize & normalize
                w, h = img_for_ocr.size

                # Get target size from model params, handle if it's a list
                target_size = getattr(self.parseq.hparams, 'img_size', 112)
                if isinstance(target_size, (list, tuple)):
                    target_size = target_size[0]

                new_w = int(w * (target_size / max(1, h)))
                img_resized = img_for_ocr.resize((new_w, target_size), Image.Resampling.LANCZOS)

                # Convert to tensor and normalize
                arr = np.array(img_resized).astype(np.float32) / 255.0
                arr = (arr - 0.5) / 0.5
                inp = torch.tensor(arr).permute(2, 0, 1).unsqueeze(0)

            # Move to device and dtype
            inp = inp.to(self.device)
            if self.device == "cuda" and hasattr(self.parseq, 'half'):
                try:
                    inp = inp.half()
                except Exception:
                    pass

            with torch.no_grad():
                logits = self.parseq(inp)
                probs = torch.softmax(logits, dim=-1)
                pred_ids = torch.argmax(probs, dim=-1)

            # Use tokenizer.decode if available for label
            try:
                label, _ = self.parseq.tokenizer.decode(probs)
                decoded = label[0] if isinstance(label, (list, tuple)) else str(label)
                return self._filter_allowed_chars(decoded.strip())
            except Exception:
                # Fallback decoding
                try:
                    decoded = self.parseq.decode(logits) if hasattr(self.parseq, 'decode') else "".join(
                        [self.parseq.tokenizer.idx2char[int(i)] for i in pred_ids[0] if int(i) in self.parseq.tokenizer.idx2char]
                    )
                except Exception:
                    decoded_chars = []
                    if hasattr(self.parseq, 'tokenizer') and hasattr(self.parseq.tokenizer, 'idx2char'):
                        for idx in pred_ids[0]:
                            ch = self.parseq.tokenizer.idx2char.get(int(idx), '')
                            decoded_chars.append(ch)
                        decoded = "".join(decoded_chars)
                    else:
                        decoded = ""
                return self._filter_allowed_chars(decoded.strip())

        except Exception as e:
            ColoredLogger.log('ERROR', f"PARSeq OCR processing failed: {e}")
            return ""

    def _display_image_in_terminal(self, png_bytes):
        """Display image in terminal using viu if available, otherwise show info"""
        # This function is not needed for the service mode, as logs go to stderr.
        pass

    def process_captcha(self, base64_string, test_mode=False):
        """
        Process a captcha image from base64 string
        """
        try:
            # Extract base64 part if full data URI is provided
            if base64_string.startswith("data:image"):
                if "," in base64_string:
                    base64_string = base64_string.split(",", 1)[1]

            if not base64_string:
                ColoredLogger.log('ERROR', "Empty base64 string provided")
                return ""

            # Process the image
            ColoredLogger.log('INFO', "Processing image...")
            png_bytes, img_for_ocr = self._preprocess_captcha_image(base64_string)

            # Run OCR
            ColoredLogger.log('INFO', "Running OCR...")
            text = self._run_parseq_sync(img_for_ocr)

            # Save to database if not in test mode
            if not test_mode:
                ts = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5, minutes=30)))
                timestamp_str = ts.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
                if not self._save_to_database(png_bytes, text, base64_string, timestamp_str):
                    ColoredLogger.log('ERROR', "Failed to save to database")

            return text

        except Exception as e:
            ColoredLogger.log('ERROR', f"Processing failed: {e}")
            ColoredLogger.log('DEBUG', traceback.format_exc())
            return ""

    def close(self):
        """Close database connection"""
        try:
            if self.conn:
                self.conn.close()
                ColoredLogger.log('INFO', "Database connection closed.")
        except:
            pass

# -------- Main function for IPC service mode --------
def main():
    # Initialize the processor once to load the model.
    processor = IRCTCOCRProcessor()
    # Signal readiness to the parent Node.js process.
    print("OCR_READY", flush=True)

    try:
        # Loop indefinitely to process captcha strings from stdin.
        for line in sys.stdin:
            base64_string = line.strip()
            if base64_string:
                # Process the captcha and get the result.
                result = processor.process_captcha(base64_string, test_mode=False)
                # Print the result to stdout for the parent process to capture.
                print(result, flush=True)
            else:
                # If an empty line is received, just continue.
                continue
    except KeyboardInterrupt:
        # Allow graceful shutdown (e.g., if the parent process is killed).
        pass
    except Exception as e:
        # Log any unexpected errors to stderr.
        ColoredLogger.log('ERROR', f"An error occurred in the main loop: {e}")
        ColoredLogger.log('DEBUG', traceback.format_exc())
    finally:
        # Clean up resources.
        processor.close()

if __name__ == "__main__":
    main()
