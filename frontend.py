# frontend.py
import sys
import sqlite3
import os
from PyQt5.QtWidgets import (QApplication, QMainWindow, QTableWidget, QTableWidgetItem, 
                             QVBoxLayout, QWidget, QScrollArea, QPushButton, QHBoxLayout,
                             QHeaderView, QLabel, QFrame, QProgressBar)
from PyQt5.QtGui import QPixmap, QImage, QColor, QFont, QPalette
from PyQt5.QtCore import QTimer, Qt, QThread, pyqtSignal, QSize
import subprocess
import threading
import time
from datetime import datetime, timedelta

class CaptchaViewer(QMainWindow):
    def __init__(self, db_path):
        super().__init__()
        self.db_path = db_path
        self.last_row_count = 0
        self.last_update_time = time.time()
        self.rows_per_minute = 0
        self.user_scrolled_manually = False
        self.visible_rows = set()
        self.initUI()
        self.timer = QTimer()
        self.timer.timeout.connect(self.load_data)
        self.timer.start(1000)  # Update every 1 second
        
    def initUI(self):
        self.setWindowTitle('IRCTC Captcha Collection - Real Time Viewer')
        self.setGeometry(100, 100, 1600, 900)

        # Apply styles
        self.setStyleSheet("""
            QMainWindow {
                background-color: #f0f0f0;
            }
            QPushButton {
                background-color: #4CAF50;
                color: white;
                border: none;
                padding: 10px;
                border-radius: 5px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #45a049;
            }
            QPushButton:pressed {
                background-color: #3d8b40;
            }
            QTableWidget {
                background-color: white;
                alternate-background-color: #f8f8f8;
                gridline-color: #d0d0d0;
                border: 1px solid #cccccc;
            }
            QTableWidget::item {
                padding: 5px;
            }
            QTableWidget::item:selected {
                background-color: #e0e0e0;
            }
            QHeaderView::section {
                background-color: #e0e0e0;
                padding: 5px;
                border: 1px solid #cccccc;
                font-weight: bold;
            }
            QLabel#statusLabel {
                background-color: #e8e8e8;
                border: 1px solid #cccccc;
                padding: 8px;
                border-radius: 4px;
                font-weight: bold;
            }
        """)
        
        # Main widget and layout
        main_widget = QWidget()
        self.setCentralWidget(main_widget)
        layout = QVBoxLayout(main_widget)
        layout.setSpacing(10)
        layout.setContentsMargins(15, 15, 15, 15)
        
        # Header frame
        header_frame = QFrame()
        header_frame.setFrameStyle(QFrame.StyledPanel)
        header_frame.setLineWidth(1)
        header_layout = QHBoxLayout(header_frame)
        
        # Title
        title_label = QLabel("IRCTC Captcha Data Collection")
        title_font = QFont()
        title_font.setPointSize(16)
        title_font.setBold(True)
        title_label.setFont(title_font)
        header_layout.addWidget(title_label)
        header_layout.addStretch()
        
        # Controls
        controls_layout = QHBoxLayout()
        
        self.start_button = QPushButton('🚀 Start Collection')
        self.start_button.clicked.connect(self.start_collection)
        self.start_button.setFixedWidth(150)
        controls_layout.addWidget(self.start_button)
        
        # Stats display
        stats_layout = QVBoxLayout()
        
        # Row count
        row_count_layout = QHBoxLayout()
        row_count_label = QLabel("Total Records:")
        row_count_label.setStyleSheet("font-weight: bold; color: #555555;")
        self.row_count_value = QLabel("0")
        self.row_count_value.setStyleSheet("font-size: 16px; font-weight: bold; color: #2E86C1;")
        row_count_layout.addWidget(row_count_label)
        row_count_layout.addWidget(self.row_count_value)
        stats_layout.addLayout(row_count_layout)
        
        # Rows per minute
        rpm_layout = QHBoxLayout()
        rpm_label = QLabel("Speed (rows/min):")
        rpm_label.setStyleSheet("font-weight: bold; color: #555555;")
        self.rpm_value = QLabel("0")
        self.rpm_value.setStyleSheet("font-size: 16px; font-weight: bold; color: #E67E22;")
        rpm_layout.addWidget(rpm_label)
        rpm_layout.addWidget(self.rpm_value)
        stats_layout.addLayout(rpm_layout)
        
        controls_layout.addLayout(stats_layout)
        
        # Status label
        status_layout = QVBoxLayout()
        status_title = QLabel("Status:")
        status_title.setStyleSheet("font-weight: bold; color: #555555;")
        self.status_label = QLabel('Ready to start collection')
        self.status_label.setObjectName("statusLabel")
        self.status_label.setMinimumWidth(200)
        status_layout.addWidget(status_title)
        status_layout.addWidget(self.status_label)
        controls_layout.addLayout(status_layout)
        
        controls_layout.addStretch()
        header_layout.addLayout(controls_layout)
        
        layout.addWidget(header_frame)
        
        # Progress bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        layout.addWidget(self.progress_bar)
        
        # Table with exact column sequence
        self.table = QTableWidget()
        self.table.setColumnCount(8)
        self.table.setHorizontalHeaderLabels(['ID', 'SlNo', 'Processed Image', 'OCR Text', 'Base64', 'Confidence', 'Timestamp', 'Char Boxes'])
        self.table.verticalHeader().setDefaultSectionSize(60)
        
        # Set column widths
        self.table.setColumnWidth(0, 60)   # ID
        self.table.setColumnWidth(1, 70)   # SlNo
        self.table.setColumnWidth(2, 180)  # Processed Image
        self.table.setColumnWidth(3, 120)  # OCR Text
        self.table.setColumnWidth(4, 250)  # Base64 (truncated)
        self.table.setColumnWidth(5, 100)  # Confidence
        self.table.setColumnWidth(6, 180)  # Timestamp
        self.table.setColumnWidth(7, 180)  # Char Boxes
        
        # Enable alternating row colors
        self.table.setAlternatingRowColors(True)
        
        # Connect scroll signal to detect manual scrolling
        self.table.verticalScrollBar().valueChanged.connect(self.on_scroll)
        
        layout.addWidget(self.table)
        
        # Load initial data (only last 100 rows)
        self.load_data()
        
    def on_scroll(self):
        """Detect if user manually scrolled away from bottom"""
        scrollbar = self.table.verticalScrollBar()
        max_scroll = scrollbar.maximum()
        current_scroll = scrollbar.value()
        
        # If user scrolled away from bottom, don't auto-scroll
        if current_scroll < max_scroll - 100:  # 100px threshold
            self.user_scrolled_manually = True
        else:
            self.user_scrolled_manually = False
    
    def load_data(self):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Get total row count
            cursor.execute('SELECT COUNT(*) FROM captchas')
            row_count = cursor.fetchone()[0]
            self.row_count_value.setText(str(row_count))
            
            # Calculate rows per minute
            current_time = time.time()
            if self.last_row_count > 0 and row_count > self.last_row_count:
                time_diff = current_time - self.last_update_time
                rows_added = row_count - self.last_row_count
                self.rows_per_minute = int(rows_added / (time_diff / 60))
                self.rpm_value.setText(str(self.rows_per_minute))
            
            self.last_update_time = current_time
            
            # Only update if there are new rows
            if row_count != self.last_row_count:
                new_rows = row_count - self.last_row_count
                self.last_row_count = row_count
                
                # If user hasn't manually scrolled, show latest rows
                if not self.user_scrolled_manually:
                    # Only load last 200 rows for performance
                    display_start = max(0, row_count - 200)
                    
                    # Clear table and set row count for visible rows only
                    visible_row_count = min(200, row_count)
                    self.table.setRowCount(visible_row_count)
                    
                    # Get only the visible rows
                    cursor.execute('SELECT * FROM captchas ORDER BY id DESC LIMIT ?', (visible_row_count,))
                    rows = cursor.fetchall()
                    rows.reverse()  # Show in chronological order
                    
                    for display_idx, row in enumerate(rows):
                        table_row_idx = display_idx  # Since we're showing only recent rows
                        
                        # Only update rows that are actually visible or have changed
                        if row[0] not in self.visible_rows:
                            self.visible_rows.add(row[0])
                            
                            # ID
                            self.table.setItem(table_row_idx, 0, QTableWidgetItem(str(row[0])))
                            
                            # SlNo
                            self.table.setItem(table_row_idx, 1, QTableWidgetItem(str(row[1])))
                            
                            # Processed Image
                            if row[2]:
                                try:
                                    image = QImage()
                                    image.loadFromData(row[2])
                                    if not image.isNull():
                                        pixmap = QPixmap(image)
                                        pixmap = pixmap.scaled(150, 50, Qt.KeepAspectRatio, Qt.SmoothTransformation)
                                        
                                        image_label = QLabel()
                                        image_label.setPixmap(pixmap)
                                        image_label.setAlignment(Qt.AlignCenter)
                                        image_label.setStyleSheet("background-color: white; border: 1px solid #cccccc;")
                                        self.table.setCellWidget(table_row_idx, 2, image_label)
                                except Exception as e:
                                    error_label = QLabel("Image Error")
                                    error_label.setAlignment(Qt.AlignCenter)
                                    error_label.setStyleSheet("color: red; font-style: italic;")
                                    self.table.setCellWidget(table_row_idx, 2, error_label)
                            
                            # OCR Text
                            ocr_item = QTableWidgetItem(str(row[3] if row[3] is not None else ""))
                            ocr_item.setTextAlignment(Qt.AlignCenter)
                            self.table.setItem(table_row_idx, 3, ocr_item)
                            
                            # Base64 (truncated)
                            b64_text = str(row[4]) if row[4] is not None else ""
                            b64_display = b64_text[:35] + '...' if len(b64_text) > 35 else b64_text
                            b64_item = QTableWidgetItem(b64_display)
                            b64_item.setToolTip(b64_text)
                            self.table.setItem(table_row_idx, 4, b64_item)
                            
                            # Confidence
                            if row[5] is not None:
                                confidence = float(row[5])
                                confidence_item = QTableWidgetItem(f"{confidence:.1f}%")
                                confidence_item.setTextAlignment(Qt.AlignCenter)
                                
                                # Color code based on confidence
                                if confidence >= 60:
                                    confidence_item.setBackground(QColor(200, 255, 200))
                                elif confidence >= 40:
                                    confidence_item.setBackground(QColor(255, 255, 200))
                                else:
                                    confidence_item.setBackground(QColor(255, 200, 200))
                                    
                                self.table.setItem(table_row_idx, 5, confidence_item)
                            
                            # Timestamp
                            if row[6] is not None:
                                timestamp_item = QTableWidgetItem(str(row[6]))
                                timestamp_item.setTextAlignment(Qt.AlignCenter)
                                self.table.setItem(table_row_idx, 6, timestamp_item)
                            
                            # Char Boxes Image
                            if row[7]:
                                try:
                                    image = QImage()
                                    image.loadFromData(row[7])
                                    if not image.isNull():
                                        pixmap = QPixmap(image)
                                        pixmap = pixmap.scaled(150, 50, Qt.KeepAspectRatio, Qt.SmoothTransformation)
                                        
                                        boxes_label = QLabel()
                                        boxes_label.setPixmap(pixmap)
                                        boxes_label.setAlignment(Qt.AlignCenter)
                                        boxes_label.setStyleSheet("background-color: white; border: 1px solid #cccccc;")
                                        self.table.setCellWidget(table_row_idx, 7, boxes_label)
                                except Exception as e:
                                    error_label = QLabel("Boxes Error")
                                    error_label.setAlignment(Qt.AlignCenter)
                                    error_label.setStyleSheet("color: red; font-style: italic;")
                                    self.table.setCellWidget(table_row_idx, 7, error_label)
                    
                    # Auto-scroll to bottom only if user hasn't manually scrolled away
                    if not self.user_scrolled_manually and row_count > 0:
                        self.table.scrollToBottom()
                
                self.status_label.setText(f'Loaded {row_count} records (+{new_rows})')
            
            conn.close()
            
        except Exception as e:
            print(f"Error loading data: {e}")
            self.status_label.setText(f'Error: {str(e)}')
    
    def start_collection(self):
        self.start_button.setEnabled(False)
        self.start_button.setText('Collecting...')
        self.status_label.setText('Collection in progress...')
        self.progress_bar.setVisible(True)
        self.progress_bar.setRange(0, 0)
        
        def run_collection():
            try:
                result = subprocess.run([sys.executable, "complete_irctc_parseq_pipeline.py"], 
                                      capture_output=True, text=True)
                
                self.start_button.setText('🚀 Start Collection')
                self.start_button.setEnabled(True)
                self.progress_bar.setVisible(False)
                
                if result.returncode == 0:
                    self.status_label.setText('Collection completed successfully')
                else:
                    self.status_label.setText(f'Collection failed: {result.stderr}')
                    
            except Exception as e:
                print(f"Error running collection: {e}")
                self.start_button.setText('🚀 Start Collection')
                self.start_button.setEnabled(True)
                self.progress_bar.setVisible(False)
                self.status_label.setText(f'Error: {str(e)}')
        
        thread = threading.Thread(target=run_collection)
        thread.daemon = True
        thread.start()

def main():
    db_path = "G:\\Project\\IRCTC_OCR_MODEL\\captchas.db"
    # db_path = "G:\\Project\\IRCTC_OCR_MODEL\\IRCTC-v3.db"
    
    if not os.path.exists(db_path):
        print(f"Database file not found: {db_path}")
        print("Please make sure the path is correct and the database exists.")
        return
    
    app = QApplication(sys.argv)
    viewer = CaptchaViewer(db_path)
    viewer.show()
    sys.exit(app.exec_())

if __name__ == '__main__':
    main()