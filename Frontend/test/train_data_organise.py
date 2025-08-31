import re
import json

def extract_train_data(text_content):
    """
    Extract train data from the text content
    """
    trains = []
    
    # Improved pattern to match train entries across multiple pages
    # Train number (5 digits), then tab, train name, tab, starts, tab, ends
    pattern = r'(\d{5})\t(.+?)\t(.+?)\t(.+?)(?=\n\d{5}\t|\n\n|$)'
    
    matches = re.findall(pattern, text_content, re.DOTALL)
    
    for match in matches:
        train_no, train_name, starts, ends = match
        # Skip if it's not a valid train entry (like page numbers)
        if (len(train_no) == 5 and train_no.isdigit() and 
            len(train_name) > 0 and len(starts) > 0 and len(ends) > 0):
            trains.append({
                'train_no': train_no.strip(),
                'train_name': train_name.strip(),
                'starts': starts.strip(),
                'ends': ends.strip()
            })
    
    return trains

def clean_text_content(text_content):
    """
    Clean the text content by removing unnecessary sections and handling pagination
    """
    # Remove everything before the first train list
    start_marker = "List of Indian Railways trains between stations"
    start_idx = text_content.find(start_marker)
    if start_idx != -1:
        text_content = text_content[start_idx:]
    
    # Remove all page navigation and footer content
    lines = text_content.split('\n')
    cleaned_lines = []
    
    skip_next = False
    for i, line in enumerate(lines):
        # Skip page navigation lines
        if (line.startswith('Displaying Train') or 
            line.startswith('← Previous') or 
            line.startswith('Next →') or
            '| 1 | 2 | 3 | 4 | 5 |' in line or
            line.startswith('Home') or
            line.startswith('Flights') or
            line.startswith('Hotels') or
            line.startswith('Packages') or
            line.startswith('Trains') or
            line.startswith('Trains List') or
            line.startswith('Indian Railway Train Lists') or
            line.startswith('Frequently Asked Questions') or
            line.startswith('About 11,000') or
            line.startswith('With a maximum') or
            line.startswith('Just click') or
            line.startswith('On the Cleartrip.com') or
            line.startswith('Yes, by clicking') or
            line.startswith('Over the years') or
            line.startswith('Just knowing') or
            line.startswith('Each day') or
            line.startswith('The trains list') or
            line.startswith('When you click') or
            line.startswith('Finding an Indian') or
            line.startswith('Check out') or
            len(line.strip()) == 0):
            continue
        
        # Skip headers that appear on subsequent pages
        if (line.startswith('Train no.') and 
            'Train name' in line and 
            'Starts' in line and 
            'Ends' in line):
            continue
        
        # Handle section headers that might appear between pages
        if line.startswith('List of Indian Railways trains between stations'):
            # This is the main header, skip it
            continue
        
        # Replace multiple spaces with single tab and clean the line
        line = re.sub(r'\s{2,}', '\t', line.strip())
        
        # Only add lines that look like train data (contain a 5-digit number)
        if re.search(r'\b\d{5}\b', line):
            cleaned_lines.append(line)
    
    return '\n'.join(cleaned_lines)

def main():
    # Read the text file
    try:
        with open('traindata.txt', 'r', encoding='utf-8') as file:
            text_content = file.read()
    except FileNotFoundError:
        print("Error: traindata.txt file not found in the current directory.")
        return
    except Exception as e:
        print(f"Error reading file: {e}")
        return
    
    print("Cleaning text content...")
    cleaned_content = clean_text_content(text_content)
    
    # For debugging: save cleaned content to a file
    with open('cleaned_trains.txt', 'w', encoding='utf-8') as f:
        f.write(cleaned_content)
    
    print("Extracting train data...")
    trains = extract_train_data(cleaned_content)
    
    # Remove duplicates by train number
    unique_trains = {}
    for train in trains:
        unique_trains[train['train_no']] = train
    
    unique_trains_list = list(unique_trains.values())
    
    # Create JSON data
    train_data = {
        "trains": unique_trains_list,
        "total_trains": len(unique_trains_list)
    }
    
    # Write to JSON file
    try:
        with open('train_data.json', 'w', encoding='utf-8') as json_file:
            json.dump(train_data, json_file, indent=2, ensure_ascii=False)
        print(f"Successfully extracted {len(unique_trains_list)} unique trains and saved to train_data.json")
        
        # Also create a simple version for JavaScript
        js_train_data = {}
        for train in unique_trains_list:
            js_train_data[train['train_no']] = train['train_name']
        
        with open('train_data_simple.json', 'w', encoding='utf-8') as js_file:
            json.dump(js_train_data, js_file, indent=2, ensure_ascii=False)
        print("Also created train_data_simple.json for easy JavaScript usage")
        
    except Exception as e:
        print(f"Error writing JSON file: {e}")

if __name__ == "__main__":
    main()