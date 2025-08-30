# example_usage.py
from CLI_OCR import IRCTCOCRProcessor

def main():
    # Initialize the processor
    processor = IRCTCOCRProcessor()
    
    # # Your base64 string (replace with actual base64)
    # base64_string = "your_base64_string_here"

    # Your base64 string (replace with actual base64)
    base64_string = input("Enter Base64 String : ")
    
    # Process in normal mode (saves to database)
    result1 = processor.process_captcha(base64_string, test_mode=False)
    print(f"Normal mode result: {result1}")
    
    # Process in test mode (doesn't save to database, adds ", TEST")
    result2 = processor.process_captcha(base64_string, test_mode=True)
    print(f"Test mode result: {result2}")
    
    # Clean up
    processor.close()

if __name__ == "__main__":
    main()