
import base64
import io
import pandas as pd
from PIL import Image, ImageOps, ImageEnhance, ImageDraw, ImageFont
import cv2
import numpy as np
def process_captcha_image(b64_str):
    """
    Process captcha image from base64 string and return processed image for OCR.
    
    Args:
        b64_str (str): Base64 encoded image string
        
    Returns:
        PIL.Image: Processed RGB image ready for OCR
    """
    try:
        # Decode base64 string
        raw = base64.b64decode(b64_str)
        
        # Load as RGB to preserve case-sensitive strokes/colors
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        
        # Convert to white background with black text
        def convert_to_white_background(img):
            arr = np.array(img)
            gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
            mean_brightness = gray.mean()
            
            if mean_brightness < 127:
                inverted = cv2.bitwise_not(arr)
                white_bg = np.ones_like(arr) * 255
                result = np.where(inverted < 50, 0, white_bg)
            else:
                white_bg = np.ones_like(arr) * 255
                gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
                _, mask = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
                result = np.zeros_like(arr)
                result[mask == 0] = [255, 255, 255]
                result[mask == 255] = [0, 0, 0]
            
            return Image.fromarray(result.astype(np.uint8))
        
        img = convert_to_white_background(img)
        
        # Gentle enhancement
        def advanced_image_enhancement(img):
            try:
                arr = np.array(img)
                gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
                
                # Mild bilateral filter for denoising
                denoised = cv2.bilateralFilter(gray, d=5, sigmaColor=75, sigmaSpace=75)
                
                # Slight adaptive thresholding
                thresh = cv2.adaptiveThreshold(denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                              cv2.THRESH_BINARY, 15, 3)
                
                # Convert back to RGB and blend
                thr_rgb = cv2.cvtColor(thresh, cv2.COLOR_GRAY2RGB)
                blended = cv2.addWeighted(arr, 0.85, thr_rgb, 0.15, 0)
                
                pil_img = Image.fromarray(blended)
                
                # Mild contrast and sharpening
                enhancer = ImageEnhance.Contrast(pil_img)
                pil_img = enhancer.enhance(1.2)
                sharp = ImageEnhance.Sharpness(pil_img)
                pil_img = sharp.enhance(1.1)
                
                return pil_img
            except Exception:
                return img
        
        img = advanced_image_enhancement(img)
        
        # Crop excess whitespace from sides only
        def crop_excess_whitespace_sides(img):
            arr = np.array(img.convert('L'))
            height, width = arr.shape
            
            strip_width = 5
            num_strips = width // strip_width
            
            # Find left crop position
            left_crop = 0
            for i in range(num_strips):
                strip_start = i * strip_width
                strip_end = min((i + 1) * strip_width, width)
                strip = arr[:, strip_start:strip_end]
                
                if np.any(strip < 245):
                    left_crop = max(0, strip_start - 5)
                    break
            
            # Find right crop position
            right_crop = width
            for i in range(num_strips - 1, -1, -1):
                strip_start = i * strip_width
                strip_end = min((i + 1) * strip_width, width)
                strip = arr[:, strip_start:strip_end]
                
                if np.any(strip < 245):
                    right_crop = min(width, strip_end + 5)
                    break
            
            if right_crop - left_crop > 20:
                return img.crop((left_crop, 0, right_crop, height))
            else:
                return img
        
        img = crop_excess_whitespace_sides(img)
        
        # Resize to exact dimensions that PARSeq expects (128x32)
        def resize_for_parseq(img):
            """Resize to the exact target size that PARSeq expects."""
            try:
                width, height = img.size
                
                # PARSeq expects 128x32
                target_height = 32
                target_width = 128
                
                # Resize to exact dimensions that PARSeq expects
                return img.resize((target_width, target_height), Image.Resampling.LANCZOS)
            
            except Exception as e:
                print('ERROR', f"Error in resize_for_parseq: {e}")
                # Fallback: return original image
                return img
        
        img = resize_for_parseq(img)
        
        # Return RGB PIL image for OCR
        return img.convert("RGB")
        
    except Exception as e:
        print('ERROR', f"Image processing failed: {e}")
        raise