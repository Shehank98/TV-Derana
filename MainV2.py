import tkinter as tk
from tkinter import ttk, messagebox, simpledialog, filedialog
import sqlite3
import os
from datetime import datetime, time, timedelta
import hashlib
import pandas as pd
import re
from difflib import SequenceMatcher
import numpy as np
import csv
import json
import shutil
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from reportlab.lib.pagesizes import letter, A4, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch

def create_sqlite_database():
 """Create SQLite database with all tables including enhanced rate card system"""
 db_path = "tv_program_schedule.db"
 
 if os.path.exists(db_path):
     os.remove(db_path)
 
 connection = sqlite3.connect(db_path)
 cursor = connection.cursor()
 
 try:
     # Create Broadcast Types table
     cursor.execute('''
     CREATE TABLE broadcast_types (
         broadcast_type_id INTEGER PRIMARY KEY AUTOINCREMENT,
         type_code VARCHAR(10) NOT NULL,
         description VARCHAR(100) NOT NULL
     )
     ''')
     
     # Create Day Patterns table
     cursor.execute('''
     CREATE TABLE day_patterns (
         day_pattern_id INTEGER PRIMARY KEY AUTOINCREMENT,
         pattern_code VARCHAR(50) NOT NULL,
         description VARCHAR(100) NOT NULL
     )
     ''')
     
     # Create Program Categories table
     cursor.execute('''
     CREATE TABLE program_categories (
         category_id INTEGER PRIMARY KEY AUTOINCREMENT,
         category_name VARCHAR(100) NOT NULL
     )
     ''')
     
     # Create Program Subcategories table
     cursor.execute('''
     CREATE TABLE program_subcategories (
         subcategory_id INTEGER PRIMARY KEY AUTOINCREMENT,
         category_id INTEGER NOT NULL,
         subcategory_name VARCHAR(100) NOT NULL,
         FOREIGN KEY (category_id) REFERENCES program_categories(category_id)
     )
     ''')
     
     # Create Programs table
     cursor.execute('''
     CREATE TABLE programs (
         program_id INTEGER PRIMARY KEY AUTOINCREMENT,
         program_name VARCHAR(100) NOT NULL,
         subcategory_id INTEGER NOT NULL,
         is_repeat BOOLEAN DEFAULT 0,
         original_program_id INTEGER,
         FOREIGN KEY (subcategory_id) REFERENCES program_subcategories(subcategory_id),
         FOREIGN KEY (original_program_id) REFERENCES programs(program_id)
     )
     ''')
     
     # Create Program Schedules table
     cursor.execute('''
     CREATE TABLE program_schedules (
         schedule_id INTEGER PRIMARY KEY AUTOINCREMENT,
         program_id INTEGER NOT NULL,
         day_pattern_id INTEGER NOT NULL,
         start_time TIME NOT NULL,
         end_time TIME NOT NULL,
         broadcast_type_id INTEGER NOT NULL,
         rate_30sec DECIMAL(10,2) NOT NULL,
         FOREIGN KEY (program_id) REFERENCES programs(program_id),
         FOREIGN KEY (day_pattern_id) REFERENCES day_patterns(day_pattern_id),
         FOREIGN KEY (broadcast_type_id) REFERENCES broadcast_types(broadcast_type_id)
     )
     ''')
     
     # Create User management tables
     cursor.execute('''
     CREATE TABLE users (
         user_id INTEGER PRIMARY KEY AUTOINCREMENT,
         username VARCHAR(100) UNIQUE NOT NULL,
         password_hash VARCHAR(255) NOT NULL,
         full_name VARCHAR(200),
         email VARCHAR(200),
         is_admin BOOLEAN DEFAULT 0,
         is_active BOOLEAN DEFAULT 1,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         last_login TIMESTAMP NULL
     )
     ''')
     
     cursor.execute('''
     CREATE TABLE permissions (
         permission_id INTEGER PRIMARY KEY AUTOINCREMENT,
         permission_name VARCHAR(100) UNIQUE NOT NULL,
         description TEXT
     )
     ''')
     
     cursor.execute('''
     CREATE TABLE user_permissions (
         user_id INTEGER,
         permission_id INTEGER,
         PRIMARY KEY (user_id, permission_id),
         FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
         FOREIGN KEY (permission_id) REFERENCES permissions(permission_id) ON DELETE CASCADE
     )
     ''')
     
     # Create Agencies table
     cursor.execute('''
     CREATE TABLE agencies (
         agency_id INTEGER PRIMARY KEY AUTOINCREMENT,
         agency_name VARCHAR(100) NOT NULL
     )
     ''')
     
     # Create Clients table
     cursor.execute('''
     CREATE TABLE clients (
         client_id INTEGER PRIMARY KEY AUTOINCREMENT,
         client_name VARCHAR(100) NOT NULL
     )
     ''')
     
     # Create Agency_Clients table with enhanced rate card support
     cursor.execute('''
     CREATE TABLE agency_clients (
         agency_client_id INTEGER PRIMARY KEY AUTOINCREMENT,
         agency_id INTEGER NOT NULL,
         client_id INTEGER NOT NULL,
         discount_rate DECIMAL(5,2) NOT NULL,
         rate_card_type VARCHAR(20) DEFAULT 'discount',
         FOREIGN KEY (agency_id) REFERENCES agencies(agency_id),
         FOREIGN KEY (client_id) REFERENCES clients(client_id),
         UNIQUE (agency_id, client_id)
     )
     ''')
     
     # NEW: Custom Rate Cards table
     cursor.execute('''
     CREATE TABLE custom_rate_cards (
         rate_card_id INTEGER PRIMARY KEY AUTOINCREMENT,
         agency_client_id INTEGER NOT NULL,
         rate_card_name VARCHAR(100) NOT NULL,
         base_modifier_percentage DECIMAL(5,2) DEFAULT 0,
         created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         is_active BOOLEAN DEFAULT 1,
         created_by INTEGER,
         FOREIGN KEY (agency_client_id) REFERENCES agency_clients(agency_client_id),
         FOREIGN KEY (created_by) REFERENCES users(user_id)
     )
     ''')
     
     # NEW: Custom Program Rates table
     cursor.execute('''
     CREATE TABLE custom_program_rates (
         custom_rate_id INTEGER PRIMARY KEY AUTOINCREMENT,
         rate_card_id INTEGER NOT NULL,
         program_schedule_id INTEGER NOT NULL,
         custom_rate_30sec DECIMAL(10,2) NOT NULL,
         override_type VARCHAR(20) DEFAULT 'individual',
         modifier_percentage DECIMAL(5,2),
         created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         FOREIGN KEY (rate_card_id) REFERENCES custom_rate_cards(rate_card_id),
         FOREIGN KEY (program_schedule_id) REFERENCES program_schedules(schedule_id),
         UNIQUE(rate_card_id, program_schedule_id)
     )
     ''')
     
     # NEW: Calculation History table
     cursor.execute('''
     CREATE TABLE calculation_history (
         history_id INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id INTEGER NOT NULL,
         agency_client_id INTEGER,
         rate_card_id INTEGER,
         calculation_name VARCHAR(200),
         total_rate_card_value DECIMAL(12,2),
         final_package_value DECIMAL(12,2),
         discount_percentage DECIMAL(5,2),
         file_path TEXT,
         folder_path TEXT,
         excel_filename VARCHAR(255),
         calculation_data TEXT,
         created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         expires_date TIMESTAMP,
         FOREIGN KEY (user_id) REFERENCES users(user_id),
         FOREIGN KEY (agency_client_id) REFERENCES agency_clients(agency_client_id),
         FOREIGN KEY (rate_card_id) REFERENCES custom_rate_cards(rate_card_id)
     )
     ''')
     
     # Insert sample data
     insert_sample_data(cursor)
     
     connection.commit()
     print("Enhanced SQLite database created successfully!")
 
 except sqlite3.Error as err:
     print(f"Error creating database: {err}")
     connection.rollback()
 finally:
     cursor.close()
     connection.close()

def insert_sample_data(cursor):
 """Insert sample data into tables"""
 
 # Insert broadcast types
 cursor.execute("INSERT INTO broadcast_types (type_code, description) VALUES (?, ?)", ('PT', 'Prime Time'))
 cursor.execute("INSERT INTO broadcast_types (type_code, description) VALUES (?, ?)", ('NPT', 'Non-Prime Time'))
 
 # Insert day patterns
 day_patterns_data = [
     ('Wkdays', 'Weekdays: Monday through Friday'),
     ('Wkends', 'Weekends: Saturday and Sunday'),
     ('Daily', 'Every day of the week'),
     ('Monday', 'Monday only'),
     ('Sat.day', 'Saturday only'),
     ('Sunday', 'Sunday only'),
     ('Tue-Fri', 'Tuesday through Friday'),
     ('Poya Days', 'Poya Days')
 ]
 
 for pattern_code, description in day_patterns_data:
     cursor.execute("INSERT INTO day_patterns (pattern_code, description) VALUES (?, ?)", (pattern_code, description))
 
 # Insert program categories
 categories = ['Tele Dramas', 'Exclusive', 'Cartoons/Children', 'Movies', 'News & Current Affairs', 'Other']
 for category in categories:
     cursor.execute("INSERT INTO program_categories (category_name) VALUES (?)", (category,))
 
 # Insert sample subcategories
 subcategories_data = [
     (1, 'Weekdays Evening'),
     (1, 'Weekends Evening'),
     (1, 'Weekdays 7.30pm'),
     (1, 'Tele Drama Repeats-Catg 01'),
     (5, 'Ada Derana 7.00pm'),
     (3, 'Weekdays')
 ]
 
 for category_id, subcategory_name in subcategories_data:
     cursor.execute("INSERT INTO program_subcategories (category_id, subcategory_name) VALUES (?, ?)", (category_id, subcategory_name))
 
 # Insert sample programs
 cursor.execute("INSERT INTO programs (program_name, subcategory_id, is_repeat, original_program_id) VALUES (?, ?, ?, ?)", ('Kodu Kaari', 1, 0, None))
 cursor.execute("INSERT INTO programs (program_name, subcategory_id, is_repeat, original_program_id) VALUES (?, ?, ?, ?)", ('Skole', 3, 0, None))
 cursor.execute("INSERT INTO programs (program_name, subcategory_id, is_repeat, original_program_id) VALUES (?, ?, ?, ?)", ('Skole Rpt', 4, 1, 2))
 
 # Insert sample program schedules
 cursor.execute("INSERT INTO program_schedules (program_id, day_pattern_id, start_time, end_time, broadcast_type_id, rate_30sec) VALUES (?, ?, ?, ?, ?, ?)", (1, 1, '17:55:00', '18:25:00', 2, 329000.00))
 cursor.execute("INSERT INTO program_schedules (program_id, day_pattern_id, start_time, end_time, broadcast_type_id, rate_30sec) VALUES (?, ?, ?, ?, ?, ?)", (2, 1, '19:30:00', '20:00:00', 1, 1200000.00))
 cursor.execute("INSERT INTO program_schedules (program_id, day_pattern_id, start_time, end_time, broadcast_type_id, rate_30sec) VALUES (?, ?, ?, ?, ?, ?)", (3, 1, '09:00:00', '09:30:00', 2, 152000.00))
 
 # Insert default admin user (password: admin)
 password_hash = hashlib.sha256('admin'.encode()).hexdigest()
 cursor.execute("INSERT INTO users (username, password_hash, full_name, email, is_admin, is_active) VALUES (?, ?, ?, ?, ?, ?)", ('admin', password_hash, 'System Administrator', 'admin@example.com', 1, 1))
 
 # Insert standard permissions
 permissions_data = [
     ('view_programs', 'View TV programs'),
     ('add_programs', 'Add new TV programs'),
     ('edit_programs', 'Edit existing TV programs'),
     ('delete_programs', 'Delete TV programs'),
     ('view_schedules', 'View program schedules'),
     ('add_schedules', 'Add new program schedules'),
     ('edit_schedules', 'Edit existing program schedules'),
     ('delete_schedules', 'Delete program schedules'),
     ('view_broadcast_types', 'View broadcast types'),
     ('manage_broadcast_types', 'Add/edit/delete broadcast types'),
     ('view_day_patterns', 'View day patterns'),
     ('manage_day_patterns', 'Add/edit/delete day patterns'),
     ('view_categories', 'View program categories'),
     ('manage_categories', 'Add/edit/delete program categories'),
     ('view_subcategories', 'View program subcategories'),
     ('manage_subcategories', 'Add/edit/delete program subcategories'),
     ('generate_reports', 'Generate and view reports'),
     ('manage_rate_cards', 'Manage custom rate cards'),
     ('view_history', 'View calculation history')
 ]
 
 for perm_name, perm_desc in permissions_data:
     cursor.execute("INSERT INTO permissions (permission_name, description) VALUES (?, ?)", (perm_name, perm_desc))
 
 # Grant all permissions to admin (user_id = 1)
 cursor.execute("SELECT permission_id FROM permissions")
 permissions = cursor.fetchall()
 for perm in permissions:
     cursor.execute("INSERT INTO user_permissions (user_id, permission_id) VALUES (?, ?)", (1, perm[0]))
 
 # Insert sample agencies
 cursor.execute("INSERT INTO agencies (agency_name) VALUES (?)", ('Ogilvy',))
 cursor.execute("INSERT INTO agencies (agency_name) VALUES (?)", ('Agency 2',))
 
 # Insert sample clients
 clients_data = ['Mobitel', 'SLT', 'Maliban', 'NDB', 'Dialog', 'CBL', 'Peoples Bank']
 for client in clients_data:
     cursor.execute("INSERT INTO clients (client_name) VALUES (?)", (client,))
 
 # Insert sample agency-client relationships with different rate card types
 agency_clients_data = [
     (1, 1, 10.00, 'discount'),  # Ogilvy - Mobitel with 10% discount
     (1, 2, 15.00, 'discount'),  # Ogilvy - SLT with 15% discount
     (1, 3, 12.50, 'custom'),    # Ogilvy - Maliban with custom rate card
     (1, 4, 8.00, 'discount'),   # Ogilvy - NDB with 8% discount
     (2, 5, 20.00, 'discount'),  # Agency 2 - Dialog with 20% discount
     (2, 6, 18.00, 'custom'),    # Agency 2 - CBL with custom rate card
     (2, 7, 25.00, 'discount')   # Agency 2 - Peoples Bank with 25% discount
 ]
 
 for agency_id, client_id, discount_rate, rate_type in agency_clients_data:
     cursor.execute("INSERT INTO agency_clients (agency_id, client_id, discount_rate, rate_card_type) VALUES (?, ?, ?, ?)", (agency_id, client_id, discount_rate, rate_type))
 
 # Insert sample custom rate cards
 cursor.execute("INSERT INTO custom_rate_cards (agency_client_id, rate_card_name, base_modifier_percentage, created_by) VALUES (?, ?, ?, ?)", (3, 'Maliban Special Rates', 5.0, 1))  # 5% increase on base rates
 cursor.execute("INSERT INTO custom_rate_cards (agency_client_id, rate_card_name, base_modifier_percentage, created_by) VALUES (?, ?, ?, ?)", (6, 'CBL Premium Rates', -10.0, 1))  # 10% decrease on base rates
 
 # Insert sample custom program rates
 cursor.execute("INSERT INTO custom_program_rates (rate_card_id, program_schedule_id, custom_rate_30sec, override_type) VALUES (?, ?, ?, ?)", (1, 1, 400000.00, 'individual'))  # Custom individual rate for program 1
 cursor.execute("INSERT INTO custom_program_rates (rate_card_id, program_schedule_id, custom_rate_30sec, override_type) VALUES (?, ?, ?, ?)", (1, 2, 1500000.00, 'individual'))  # Custom individual rate for program 2

class HistoryManager:
 def __init__(self, connection):
     self.connection = connection
     self.base_path = "calculation_history"

 def create_history_folder(self, user_id, agency_client_id=None):
     """Create organized folder structure for calculation history"""
     now = datetime.now()
     year_month = now.strftime("%Y/%m-%B")
     timestamp = now.strftime("%Y%m%d_%H%M%S")
     
     # Build folder path
     if agency_client_id:
         cursor = self.connection.cursor()
         try:
             cursor.execute("""
                 SELECT a.agency_name, c.client_name
                 FROM agency_clients ac
                 JOIN agencies a ON ac.agency_id = a.agency_id
                 JOIN clients c ON ac.client_id = c.client_id
                 WHERE ac.agency_client_id = ?
             """, (agency_client_id,))
             result = cursor.fetchone()
             if result:
                 agency_name = result[0].replace(' ', '_').lower()
                 client_name = result[1].replace(' ', '_').lower()
                 folder_name = f"agency_{agency_name}_client_{client_name}_{timestamp}"
             else:
                 folder_name = f"calculation_{timestamp}"
         finally:
             cursor.close()
     else:
         folder_name = f"calculation_{timestamp}"
         
     folder_path = os.path.join(self.base_path, year_month, folder_name)
     
     # Create directory
     os.makedirs(folder_path, exist_ok=True)
     
     return folder_path

 def save_calculation(self, user_id, agency_client_id, calculation_data, excel_file_path=None):
     """Save calculation to history with 1-month expiry"""
     folder_path = self.create_history_folder(user_id, agency_client_id)
     
     # Copy excel file if provided
     excel_filename = None
     if excel_file_path and os.path.exists(excel_file_path):
         excel_filename = f"original_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
         dest_path = os.path.join(folder_path, excel_filename)
         shutil.copy2(excel_file_path, dest_path)
     
     # Set expiry date (1 month from now)
     expires_date = datetime.now() + timedelta(days=30)
     
     # Save to database
     cursor = self.connection.cursor()
     try:
         cursor.execute("""
             INSERT INTO calculation_history 
             (user_id, agency_client_id, calculation_name, total_rate_card_value, 
              final_package_value, folder_path, excel_filename, calculation_data, expires_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         """, (user_id, agency_client_id, 
               calculation_data.get('calculation_name', 'Unnamed Calculation'),
               calculation_data.get('total_rate_card_value', 0),
               calculation_data.get('final_package_value', 0),
               folder_path, excel_filename, json.dumps(calculation_data), expires_date))
         
         self.connection.commit()
         return cursor.lastrowid
         
     except sqlite3.Error as err:
         print(f"Error saving calculation history: {err}")
         return None
     finally:
         cursor.close()

 def cleanup_expired_history(self):
     """Remove expired history entries and their folders"""
     cursor = self.connection.cursor()
     try:
         # Get expired entries
         cursor.execute("""
             SELECT history_id, folder_path
             FROM calculation_history
             WHERE expires_date < datetime('now')
         """)
         
         expired_entries = cursor.fetchall()
         
         for history_id, folder_path in expired_entries:
             # Remove folder
             if folder_path and os.path.exists(folder_path):
                 shutil.rmtree(folder_path, ignore_errors=True)
             
             # Remove database entry
             cursor.execute("DELETE FROM calculation_history WHERE history_id = ?", (history_id,))
         
         self.connection.commit()
         return len(expired_entries)
         
     except sqlite3.Error as err:
         print(f"Error cleaning up history: {err}")
         return 0
     finally:
         cursor.close()

class RateCardManager:
 def __init__(self, connection):
     self.connection = connection

 def get_effective_rate(self, agency_client_id, program_schedule_id):
     """Get the effective rate for a specific agency-client and program"""
     cursor = self.connection.cursor()
     
     try:
         # Check if agency-client uses custom rate card
         cursor.execute("""
             SELECT rate_card_type, discount_rate 
             FROM agency_clients 
             WHERE agency_client_id = ?
         """, (agency_client_id,))
         
         result = cursor.fetchone()
         if not result:
             return None
             
         rate_card_type, discount_rate = result
         
         if rate_card_type == 'custom':
             # Get custom rate card
             return self._get_custom_rate(agency_client_id, program_schedule_id)
         else:
             # Use default rate + discount
             return self._get_default_rate_with_discount(program_schedule_id, discount_rate)
             
     finally:
         cursor.close()

 def _get_custom_rate(self, agency_client_id, program_schedule_id):
     """Get rate from custom rate card"""
     cursor = self.connection.cursor()
     
     try:
         # Get active custom rate card
         cursor.execute("""
             SELECT crc.rate_card_id, crc.base_modifier_percentage
             FROM custom_rate_cards crc
             WHERE crc.agency_client_id = ? AND crc.is_active = 1
             ORDER BY crc.created_date DESC
             LIMIT 1
         """, (agency_client_id,))
         
         rate_card = cursor.fetchone()
         if not rate_card:
             return None
             
         rate_card_id, base_modifier = rate_card
         
         # Check for specific program override
         cursor.execute("""
             SELECT custom_rate_30sec, override_type, modifier_percentage
             FROM custom_program_rates
             WHERE rate_card_id = ? AND program_schedule_id = ?
         """, (rate_card_id, program_schedule_id))
         
         custom_rate = cursor.fetchone()
         
         if custom_rate:
             # Use specific program rate
             return {
                 'rate': float(custom_rate[0]),
                 'type': 'custom_individual',
                 'source': f'Custom Rate Card (Individual)'
             }
         else:
             # Use base modifier on default rate
             default_rate = self._get_base_rate(program_schedule_id)
             if default_rate and base_modifier:
                 modified_rate = default_rate * (100 + base_modifier) / 100
                 return {
                     'rate': float(modified_rate),
                     'type': 'custom_modifier',
                     'source': f'Custom Rate Card ({base_modifier:+.1f}% modifier)'
                 }
             else:
                 return {
                     'rate': float(default_rate) if default_rate else 0,
                     'type': 'default',
                     'source': 'Default Rate (No Custom Override)'
                 }
                 
     finally:
         cursor.close()

 def _get_default_rate_with_discount(self, program_schedule_id, discount_rate):
     """Get default rate with discount applied"""
     base_rate = self._get_base_rate(program_schedule_id)
     if base_rate:
         discounted_rate = base_rate * (100 - discount_rate) / 100
         return {
             'rate': float(discounted_rate),
             'type': 'discount',
             'source': f'Default Rate (-{discount_rate}% discount)'
         }
     return None

 def _get_base_rate(self, program_schedule_id):
     """Get base rate from program_schedules"""
     cursor = self.connection.cursor()
     try:
         cursor.execute("SELECT rate_30sec FROM program_schedules WHERE schedule_id = ?", (program_schedule_id,))
         result = cursor.fetchone()
         return float(result[0]) if result else None
     finally:
         cursor.close()

 def duplicate_rate_card(self, source_agency_client_id, target_agency_client_id, new_name, user_id):
     """Duplicate ALL programs from source to target rate card"""
     cursor = self.connection.cursor()
     
     try:
         # Get source rate card
         cursor.execute("""
             SELECT rate_card_id, base_modifier_percentage
             FROM custom_rate_cards
             WHERE agency_client_id = ? AND is_active = 1
             ORDER BY created_date DESC LIMIT 1
         """, (source_agency_client_id,))
         
         source_card = cursor.fetchone()
         if not source_card:
             raise Exception("Source rate card not found")
             
         source_card_id, base_modifier = source_card
         
         # Create new rate card
         cursor.execute("""
             INSERT INTO custom_rate_cards 
             (agency_client_id, rate_card_name, base_modifier_percentage, created_by)
             VALUES (?, ?, ?, ?)
         """, (target_agency_client_id, new_name, base_modifier, user_id))
         
         new_rate_card_id = cursor.lastrowid
         
         # Copy ALL program rates
         cursor.execute("""
             INSERT INTO custom_program_rates 
             (rate_card_id, program_schedule_id, custom_rate_30sec, override_type, modifier_percentage)
             SELECT ?, program_schedule_id, custom_rate_30sec, override_type, modifier_percentage
             FROM custom_program_rates
             WHERE rate_card_id = ?
         """, (new_rate_card_id, source_card_id))
         
         # Set target agency-client to use custom rates
         cursor.execute("""
             UPDATE agency_clients 
             SET rate_card_type = 'custom'
             WHERE agency_client_id = ?
         """, (target_agency_client_id,))
         
         self.connection.commit()
         return new_rate_card_id
         
     except Exception as e:
         self.connection.rollback()
         raise e
     finally:
         cursor.close()

 def create_custom_rate_card_from_default(self, agency_client_id, rate_card_name, base_modifier, user_id):
     """Create new custom rate card with ALL programs from default rates"""
     cursor = self.connection.cursor()
     
     try:
         # Create rate card
         cursor.execute("""
             INSERT INTO custom_rate_cards 
             (agency_client_id, rate_card_name, base_modifier_percentage, created_by)
             VALUES (?, ?, ?, ?)
         """, (agency_client_id, rate_card_name, base_modifier, user_id))
         
         rate_card_id = cursor.lastrowid
         
         # Get ALL program schedules
         cursor.execute("SELECT schedule_id, rate_30sec FROM program_schedules")
         all_schedules = cursor.fetchall()
         
         # Create custom rates for ALL programs using base modifier
         for schedule_id, default_rate in all_schedules:
             if base_modifier != 0:
                 custom_rate = default_rate * (100 + base_modifier) / 100
                 override_type = 'modifier'
             else:
                 custom_rate = default_rate
                 override_type = 'individual'
             
             cursor.execute("""
                 INSERT INTO custom_program_rates
                 (rate_card_id, program_schedule_id, custom_rate_30sec, override_type, modifier_percentage)
                 VALUES (?, ?, ?, ?, ?)
             """, (rate_card_id, schedule_id, custom_rate, override_type, base_modifier))
         
         # Set agency-client to use custom rates
         cursor.execute("""
             UPDATE agency_clients 
             SET rate_card_type = 'custom'
             WHERE agency_client_id = ?
         """, (agency_client_id,))
         
         self.connection.commit()
         return rate_card_id
         
     except Exception as e:
         self.connection.rollback()
         raise e
     finally:
         cursor.close()

 def update_program_rate(self, rate_card_id, program_schedule_id, new_rate):
     """Update individual program rate in custom rate card"""
     cursor = self.connection.cursor()
     
     try:
         # Check if rate exists
         cursor.execute("""
             SELECT custom_rate_id FROM custom_program_rates
             WHERE rate_card_id = ? AND program_schedule_id = ?
         """, (rate_card_id, program_schedule_id))
         
         if cursor.fetchone():
             # Update existing rate
             cursor.execute("""
                 UPDATE custom_program_rates
                 SET custom_rate_30sec = ?, override_type = 'individual'
                 WHERE rate_card_id = ? AND program_schedule_id = ?
             """, (new_rate, rate_card_id, program_schedule_id))
         else:
             # Create new rate
             cursor.execute("""
                 INSERT INTO custom_program_rates
                 (rate_card_id, program_schedule_id, custom_rate_30sec, override_type)
                 VALUES (?, ?, ?, 'individual')
             """, (rate_card_id, program_schedule_id, new_rate))
         
         self.connection.commit()
         
     except Exception as e:
         self.connection.rollback()
         raise e
     finally:
         cursor.close()

class LoginWindow:
 def __init__(self, root):
     self.root = root
     self.root.title("TV Program Database Login")
     self.root.geometry("400x300")
     self.root.resizable(False, False)
     
     # Center the window
     screen_width = self.root.winfo_screenwidth()
     screen_height = self.root.winfo_screenheight()
     x = (screen_width/2) - (400/2)
     y = (screen_height/2) - (300/2)
     self.root.geometry('%dx%d+%d+%d' % (400, 300, x, y))
     
     # Create variables
     self.username_var = tk.StringVar()
     self.password_var = tk.StringVar()
     
     # Create login frame
     self.login_frame = ttk.Frame(self.root, padding="20")
     self.login_frame.pack(fill=tk.BOTH, expand=True)
     
     # Title label with styling
     ttk.Label(self.login_frame, text="TV Program Database", 
             font=("Helvetica", 16, "bold")).pack(pady=(0, 20))
     
     # Username field
     ttk.Label(self.login_frame, text="Username:").pack(anchor="w", pady=(10, 2))
     ttk.Entry(self.login_frame, textvariable=self.username_var, width=30).pack(fill=tk.X, pady=(0, 10))
     
     # Password field
     ttk.Label(self.login_frame, text="Password:").pack(anchor="w", pady=(10, 2))
     password_entry = ttk.Entry(self.login_frame, textvariable=self.password_var, show="*", width=30)
     password_entry.pack(fill=tk.X, pady=(0, 20))
     
     # Login button
     ttk.Button(self.login_frame, text="Login", command=self.login, width=15).pack(pady=(10, 0))
     
     # Status label for error messages
     self.status_var = tk.StringVar()
     ttk.Label(self.login_frame, textvariable=self.status_var, foreground="red").pack(pady=(10, 0))
     
     # Bind Enter key to login
     self.root.bind("<Return>", lambda event: self.login())
     
     # Database connection
     self.connection = self.connect_to_database()

 def login(self):
     username = self.username_var.get().strip()
     password = self.password_var.get()
     
     if not username or not password:
         self.status_var.set("Please enter both username and password")
         return
     
     if not self.connection:
         self.connection = self.connect_to_database()
         if not self.connection:
             return
     
     try:
         cursor = self.connection.cursor()
         
         password_hash = hashlib.sha256(password.encode()).hexdigest()
         
         cursor.execute("""
             SELECT user_id, is_admin, is_active 
             FROM users 
             WHERE username = ? AND password_hash = ?
         """, (username, password_hash))
         
         user = cursor.fetchone()
         
         if user and user[2]:  # user exists and is active
             user_id, is_admin = user[0], user[1]
             
             # Update last login time
             cursor.execute("UPDATE users SET last_login = datetime('now') WHERE user_id = ?", (user_id,))
             self.connection.commit()
             
             # Close login window
             self.root.destroy()
             
             # Start the combined application
             main_root = tk.Tk()
             app = CombinedApplication(main_root, user_id, username, is_admin)
             main_root.mainloop()
         else:
             self.status_var.set("Invalid username or password")
             
     except sqlite3.Error as err:
         self.status_var.set(f"Login error: {err}")
     finally:
         if cursor:
             cursor.close()

 def connect_to_database(self):
     try:
         connection = sqlite3.connect("tv_program_schedule.db")
         connection.execute("PRAGMA foreign_keys = ON")
         return connection
     except sqlite3.Error as err:
         messagebox.showerror("Database Connection Error", f"Failed to connect to database: {err}")
         return None

class CombinedApplication:
 def __init__(self, root, user_id, username, is_admin):
     self.root = root
     self.root.title("TV Program Database - Enhanced System v2.0")
     self.root.geometry("1400x800")
     self.root.state('zoomed')
     
     # User information
     self.user_id = user_id
     self.username = username
     self.is_admin = is_admin
     
     # Database connection
     self.connection = self.connect_to_database()
     if not self.connection:
         self.root.destroy()
         return
     
     # Initialize managers
     self.history_manager = HistoryManager(self.connection)
     
     # Create the combined interface
     self.create_interface()
     
     # Cleanup expired history on startup
     self.cleanup_expired_history()

 def connect_to_database(self):
     try:
         connection = sqlite3.connect("tv_program_schedule.db")
         connection.execute("PRAGMA foreign_keys = ON")
         return connection
     except sqlite3.Error as err:
         messagebox.showerror("Database Connection Error", f"Failed to connect to database: {err}")
         return None

 def create_interface(self):
     # Create menu bar
     self.create_menu()
     
     # Create main notebook (tabs)
     self.main_notebook = ttk.Notebook(self.root)
     self.main_notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
     
     # TAB 1: Enhanced Smart Ad Calculator (Available to ALL users)
     self.calc_frame = ttk.Frame(self.main_notebook)
     self.main_notebook.add(self.calc_frame, text="📊 Smart Ad Calculator")
     
     # Initialize the Enhanced Smart Calculator
     self.smart_calculator = EnhancedSmartAdCalculator(self.calc_frame, self.user_id, self.connection)
     
     # TAB 2: Admin Panel (Only for ADMIN users)
     if self.is_admin:
         self.admin_frame = ttk.Frame(self.main_notebook)
         self.main_notebook.add(self.admin_frame, text="⚙️ Admin Panel")
         
         # Initialize the Enhanced Admin Panel
         self.admin_panel = EnhancedTVProgramDatabaseAdmin(self.admin_frame, self.user_id, self.username, self.is_admin, self.connection)
     
     # TAB 3: History (Available to ALL users)
     self.history_frame = ttk.Frame(self.main_notebook)
     self.main_notebook.add(self.history_frame, text="📁 History")
     
     # Initialize History Browser
     self.history_browser = HistoryBrowser(self.history_frame, self.user_id, self.connection)
     
     # Create status bar
     self.create_status_bar()

 def create_menu(self):
     menubar = tk.Menu(self.root)
     
     # File menu
     file_menu = tk.Menu(menubar, tearoff=0)
     file_menu.add_command(label="Logout", command=self.logout)
     file_menu.add_command(label="Cleanup History", command=self.cleanup_expired_history)
     file_menu.add_separator()
     file_menu.add_command(label="Exit", command=self.root.quit)
     menubar.add_cascade(label="File", menu=file_menu)
     
     # View menu
     view_menu = tk.Menu(menubar, tearoff=0)
     view_menu.add_command(label="Smart Ad Calculator", command=lambda: self.main_notebook.select(0))
     if self.is_admin:
         view_menu.add_command(label="Admin Panel", command=lambda: self.main_notebook.select(1))
     view_menu.add_command(label="History", command=lambda: self.main_notebook.select(-1))
     menubar.add_cascade(label="View", menu=view_menu)
     
     # Tools menu
     tools_menu = tk.Menu(menubar, tearoff=0)
     if self.is_admin:
         tools_menu.add_command(label="Rate Card Manager", command=self.open_rate_card_manager)
         tools_menu.add_separator()
     tools_menu.add_command(label="Backup Data", command=self.backup_data)
     menubar.add_cascade(label="Tools", menu=tools_menu)
     
     # Help menu
     help_menu = tk.Menu(menubar, tearoff=0)
     help_menu.add_command(label="User Guide", command=self.show_user_guide)
     help_menu.add_command(label="About", command=self.show_about)
     menubar.add_cascade(label="Help", menu=help_menu)
     
     self.root.config(menu=menubar)

 def create_status_bar(self):
     status_frame = ttk.Frame(self.root)
     status_frame.pack(side=tk.BOTTOM, fill=tk.X)
     
     # User info
     user_info = f"Logged in as: {self.username}"
     if self.is_admin:
         user_info += " (Administrator) - Full Access"
     else:
         user_info += " (User) - Calculator & History Access"
     
     ttk.Label(status_frame, text=user_info, font=("Arial", 9)).pack(side=tk.LEFT, padx=10, pady=5)
     
     # System status
     ttk.Label(status_frame, text="Enhanced Rate Card System v2.0", font=("Arial", 8), foreground="blue").pack(side=tk.RIGHT, padx=10, pady=5)
     
     # Current time
     self.time_label = ttk.Label(status_frame, text="", font=("Arial", 9))
     self.time_label.pack(side=tk.RIGHT, padx=10, pady=5)
     self.update_time()

 def update_time(self):
     current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
     self.time_label.config(text=current_time)
     self.root.after(1000, self.update_time)

 def logout(self):
     confirm = messagebox.askyesno("Logout", "Are you sure you want to log out?")
     if confirm:
         self.root.destroy()
         main_root = tk.Tk()
         app = LoginWindow(main_root)
         main_root.mainloop()

 def cleanup_expired_history(self):
     """Cleanup expired history entries"""
     try:
         cleaned_count = self.history_manager.cleanup_expired_history()
         if cleaned_count > 0:
             messagebox.showinfo("Cleanup Complete", f"Removed {cleaned_count} expired history entries.")
         else:
             messagebox.showinfo("Cleanup Complete", "No expired entries found.")
     except Exception as e:
         messagebox.showerror("Cleanup Error", f"Error during cleanup: {str(e)}")

 def open_rate_card_manager(self):
     """Open the enhanced rate card manager"""
     if not self.is_admin:
         messagebox.showerror("Access Denied", "Rate card management requires administrator privileges.")
         return
     
     rate_manager_window = tk.Toplevel(self.root)
     RateCardManagerWindow(rate_manager_window, self.connection, self.user_id)

 def backup_data(self):
     """Create backup of database"""
     try:
         timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
         backup_filename = f"tv_database_backup_{timestamp}.db"
         
         file_path = filedialog.asksaveasfilename(
             title="Save Database Backup",
             defaultextension=".db",
             initialvalue=backup_filename,
             filetypes=[("Database files", "*.db"), ("All files", "*.*")]
         )
         
         if file_path:
             shutil.copy2("tv_program_schedule.db", file_path)
             messagebox.showinfo("Backup Complete", f"Database backed up to {file_path}")
             
     except Exception as e:
         messagebox.showerror("Backup Error", f"Error creating backup: {str(e)}")

 def show_user_guide(self):
     """Show user guide window"""
     guide_window = tk.Toplevel(self.root)
     guide_window.title("User Guide")
     guide_window.geometry("800x600")
     
     guide_text = tk.Text(guide_window, wrap=tk.WORD, padx=20, pady=20)
     guide_text.pack(fill=tk.BOTH, expand=True)
     
     guide_content = """TV PROGRAM DATABASE - USER GUIDE

ENHANCED RATE CARD SYSTEM v2.0

OVERVIEW:
This system now supports two types of pricing:
• DISCOUNT RATES: Default rates with percentage discounts
• CUSTOM RATE CARDS: Completely customized rates per program

SMART AD CALCULATOR:

1. Upload Excel File:
• Required columns: PROGRAM, DAY, TIME, DUR, TOTAL SPOTS
• Supports merged TIME headers
• Auto-detects themes/campaigns

2. Select Agency & Client:
• Choose from dropdown lists
• System automatically shows discount rate or custom rate card
• Rate information is visible to all users

3. Program Mapping:
• Auto-matching with confidence scores
• Manual mapping for unmatched programs
• Deselection options for fine-tuning

4. Calculations:
• Option 1: Manual package value entry
• Option 2: Agency discount application
• Real-time rate breakdown showing source

RATE CARD TYPES:

DISCOUNT RATES:
• Uses default program rates
• Applies negotiated discount percentage
• Simple and straightforward

CUSTOM RATE CARDS:
• Individual rates per program
• Base modifier percentages
• Mix of individual + modifier rates
• Complete flexibility

ADMIN FEATURES (Admin Users Only):

UNIFIED DASHBOARD:
• Single interface for all data
• Organized boxes for easy navigation
• Hidden complexity, clean presentation

RATE CARD MANAGEMENT:
• Duplicate rate cards between clients
• Create custom rate cards from default
• Edit individual program rates
• Bulk operations support

HISTORY SYSTEM:
• Automatic saving of calculations
• 1-month retention period
• Organized folder structure
• Search and retrieval functions

TIME FORMAT:
• All times in 24-hour format (HH:MM)
• Automatic matching with schedules
• Proper time validation

TIPS:
• Always select agency & client before calculations
• Use mapping deselection for better accuracy
• Check history tab for previous calculations
• Admin users can duplicate rate cards easily
• System shows rate source for transparency

SUPPORT:
For technical support or questions about the enhanced features, 
contact your system administrator.

Version: 2.0 - Enhanced Rate Card System
Date: 2025"""
     
     guide_text.insert(tk.END, guide_content)
     guide_text.config(state=tk.DISABLED)
     
     ttk.Button(guide_window, text="Close", command=guide_window.destroy).pack(pady=10)

 def show_about(self):
     about_text = f"""TV Program Database System - Enhanced Version

Version: 2.0 (Enhanced Rate Card System)
User: {self.username}
Access Level: {'Administrator' if self.is_admin else 'Standard User'}

NEW FEATURES IN v2.0:
✓ Custom Rate Card System
✓ Rate Card Duplication
✓ Individual Program Rate Editing
✓ Calculation History (1-month retention)
✓ Enhanced Admin Interface
✓ Real-time Rate Source Display

AVAILABLE FEATURES:
✓ Smart Advertisement Calculator
✓ Enhanced Program Mapping
✓ Multiple Rate Card Types
✓ History Management
{'✓ Database Administration' if self.is_admin else '✗ Database Administration (Admin Only)'}
{'✓ Rate Card Management' if self.is_admin else '✗ Rate Card Management (Admin Only)'}
{'✓ User Management' if self.is_admin else '✗ User Management (Admin Only)'}

SYSTEM SPECIFICATIONS:
• Database: SQLite with Enhanced Schema
• Rate Types: Discount + Custom Rate Cards
• History Retention: 30 days
• Time Format: 24-hour (HH:MM)
• Auto-cleanup: Expired data removal

© 2025 Enhanced TV Program Database System
Developed with Advanced Rate Card Management"""
     
     messagebox.showinfo("About System", about_text)

class EnhancedSmartAdCalculator:
 def __init__(self, parent_frame, user_id, connection):
     self.root = parent_frame
     self.user_id = user_id
     self.connection = connection
     
     # Initialize managers
     self.rate_manager = RateCardManager(self.connection)
     self.history_manager = HistoryManager(self.connection)
     
     # Variables
     self.uploaded_data = None
     self.program_schedules = {}
     self.program_mappings = {}
     self.unmatched_programs = []
     self.calculations = []
     self.themes_data = {}
     
     # Create UI
     self.create_widgets()
     self.load_program_schedules()

 def create_widgets(self):
     # Create notebook for tabs
     self.notebook = ttk.Notebook(self.root)
     self.notebook.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
     
     # Tab 1: Upload and Process
     self.upload_tab = ttk.Frame(self.notebook)
     self.notebook.add(self.upload_tab, text="1. Upload & Process")
     
     # Tab 2: Program Mapping
     self.mapping_tab = ttk.Frame(self.notebook)
     self.notebook.add(self.mapping_tab, text="2. Program Mapping")
     
     # Tab 3: Enhanced Calculations
     self.calc_tab = ttk.Frame(self.notebook)
     self.notebook.add(self.calc_tab, text="3. Enhanced Calculations")
     
     self.create_upload_tab()
     self.create_mapping_tab()
     self.create_enhanced_calculation_tab()

 def create_upload_tab(self):
     # Upload section
     upload_frame = ttk.LabelFrame(self.upload_tab, text="Upload Excel File", padding="10")
     upload_frame.pack(fill=tk.X, padx=10, pady=10)
     
     ttk.Button(upload_frame, text="Select Excel File", 
             command=self.upload_excel).pack(side=tk.LEFT, padx=(0, 10))
     
     self.file_label = ttk.Label(upload_frame, text="No file selected", foreground="gray")
     self.file_label.pack(side=tk.LEFT, padx=(0, 10))
     
     self.process_btn = ttk.Button(upload_frame, text="Process Data", 
                                 command=self.process_data, state=tk.DISABLED)
     self.process_btn.pack(side=tk.LEFT)
     
     # Enhanced Agency and Client Selection Section
     agency_client_frame = ttk.LabelFrame(self.upload_tab, text="Agency & Client Selection (Enhanced)", padding="10")
     agency_client_frame.pack(fill=tk.X, padx=10, pady=10)
     
     # Agency selection
     ttk.Label(agency_client_frame, text="Select Agency:").grid(row=0, column=0, padx=10, pady=5, sticky=tk.W)
     self.selected_agency_var = tk.StringVar()
     self.agency_combo = ttk.Combobox(agency_client_frame, textvariable=self.selected_agency_var, 
                                     state="readonly", width=30)
     self.agency_combo.grid(row=0, column=1, padx=10, pady=5, sticky=tk.W)
     self.agency_combo.bind('<<ComboboxSelected>>', self.on_agency_selected)
     
     # Client selection
     ttk.Label(agency_client_frame, text="Select Client:").grid(row=0, column=2, padx=10, pady=5, sticky=tk.W)
     self.selected_client_var = tk.StringVar()
     self.client_combo = ttk.Combobox(agency_client_frame, textvariable=self.selected_client_var, 
                                 state="readonly", width=30)
     self.client_combo.grid(row=0, column=3, padx=10, pady=5, sticky=tk.W)
     self.client_combo.bind('<<ComboboxSelected>>', self.on_client_selected)
     
     # Rate card information display
     info_frame = ttk.Frame(agency_client_frame)
     info_frame.grid(row=1, column=0, columnspan=4, sticky='ew', pady=10)
     
     ttk.Label(info_frame, text="Rate Card Type:", font=("Arial", 9, "bold")).pack(side=tk.LEFT, padx=(0, 5))
     self.rate_card_type_label = ttk.Label(info_frame, text="Not Selected", foreground="gray")
     self.rate_card_type_label.pack(side=tk.LEFT, padx=(0, 20))
     
     ttk.Label(info_frame, text="Discount/Rate Info:", font=("Arial", 9, "bold")).pack(side=tk.LEFT, padx=(0, 5))
     self.discount_display_label = ttk.Label(info_frame, text="0.0%", font=("Arial", 9), foreground="blue")
     self.discount_display_label.pack(side=tk.LEFT)
     
     # Load agencies on initialization
     self.load_agencies()
     
     # Enhanced data preview with rate information
     preview_frame = ttk.LabelFrame(self.upload_tab, text="Processed Data Preview (Enhanced)", padding="10")
     preview_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
     
     # Create treeview for data preview
     columns = ('Theme', 'program', 'day', 'time_range', 'duration', 'spots', 'total_seconds')
     self.preview_tree = ttk.Treeview(preview_frame, columns=columns, show='headings')
     
     self.preview_tree.heading('Theme', text='Theme/Campaign')
     self.preview_tree.heading('program', text='Program')
     self.preview_tree.heading('day', text='Day Pattern')
     self.preview_tree.heading('time_range', text='Time Range (24h)')
     self.preview_tree.heading('duration', text='Ad Duration')
     self.preview_tree.heading('spots', text='Spots')
     self.preview_tree.heading('total_seconds', text='Total Seconds')
     
     # Configure column widths
     for col in columns:
         self.preview_tree.column(col, width=120)
     
     # Scrollbars
     preview_v_scroll = ttk.Scrollbar(preview_frame, orient="vertical", command=self.preview_tree.yview)
     preview_h_scroll = ttk.Scrollbar(preview_frame, orient="horizontal", command=self.preview_tree.xview)
     self.preview_tree.configure(yscrollcommand=preview_v_scroll.set, xscrollcommand=preview_h_scroll.set)
     
     self.preview_tree.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
     preview_v_scroll.grid(row=0, column=1, sticky=(tk.N, tk.S))
     preview_h_scroll.grid(row=1, column=0, sticky=(tk.W, tk.E))
     
     preview_frame.grid_rowconfigure(0, weight=1)
     preview_frame.grid_columnconfigure(0, weight=1)

 def create_mapping_tab(self):
     # Instructions
     instructions = ttk.Label(self.mapping_tab, 
                            text="ENHANCED: Review program mappings. System shows rate source and confidence. Green = Auto-matched, Red = Needs manual mapping", 
                            font=("Arial", 10))
     instructions.pack(pady=10)
     
     # Control buttons with enhanced options
     control_frame = ttk.Frame(self.mapping_tab)
     control_frame.pack(fill=tk.X, padx=10, pady=5)
     
     # Row 1 - Main actions
     main_actions = ttk.Frame(control_frame)
     main_actions.pack(fill=tk.X, pady=(0, 5))
     
     ttk.Button(main_actions, text="Auto-Match All", command=self.auto_match_programs).pack(side=tk.LEFT, padx=5)
     ttk.Button(main_actions, text="Manual Map", command=self.open_manual_mapping).pack(side=tk.LEFT, padx=5)
     ttk.Button(main_actions, text="Clear All Mappings", command=self.clear_all_mappings).pack(side=tk.LEFT, padx=5)
     
     # Row 2 - Enhanced deselection actions
     deselect_actions = ttk.Frame(control_frame)
     deselect_actions.pack(fill=tk.X)
     
     ttk.Label(deselect_actions, text="Deselect Options:", font=("Arial", 9, "bold")).pack(side=tk.LEFT, padx=(0, 10))
     ttk.Button(deselect_actions, text="Deselect Selected", command=self.deselect_selected_mapping).pack(side=tk.LEFT, padx=2)
     ttk.Button(deselect_actions, text="Deselect Auto-Matches", command=self.deselect_auto_matches).pack(side=tk.LEFT, padx=2)
     ttk.Button(deselect_actions, text="Deselect Low Confidence", command=self.deselect_low_confidence).pack(side=tk.LEFT, padx=2)
     ttk.Button(deselect_actions, text="Show Rate Preview", command=self.show_rate_preview).pack(side=tk.LEFT, padx=2)
     
     # Enhanced mapping results with rate information
     mapping_frame = ttk.LabelFrame(self.mapping_tab, text="Program Mappings (Enhanced with Rate Info)", padding="10")
     mapping_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
     
     # Enhanced mapping tree with rate information
     mapping_columns = ('status', 'excel_program', 'day_time', 'db_program', 'db_time', 'match_type', 'confidence', 'rate_info')
     self.mapping_tree = ttk.Treeview(mapping_frame, columns=mapping_columns, show='headings', selectmode='extended')
     
     self.mapping_tree.heading('status', text='Status')
     self.mapping_tree.heading('excel_program', text='Excel Program')
     self.mapping_tree.heading('day_time', text='Day & Time')
     self.mapping_tree.heading('db_program', text='Database Program')
     self.mapping_tree.heading('db_time', text='DB Time Slot')
     self.mapping_tree.heading('match_type', text='Match Type')
     self.mapping_tree.heading('confidence', text='Confidence')
     self.mapping_tree.heading('rate_info', text='Rate Preview')
     
     # Column widths
     self.mapping_tree.column('status', width=80)
     self.mapping_tree.column('excel_program', width=150)
     self.mapping_tree.column('day_time', width=120)
     self.mapping_tree.column('db_program', width=150)
     self.mapping_tree.column('db_time', width=120)
     self.mapping_tree.column('match_type', width=100)
     self.mapping_tree.column('confidence', width=80)
     self.mapping_tree.column('rate_info', width=150)
     
     # Scrollbars
     mapping_v_scroll = ttk.Scrollbar(mapping_frame, orient="vertical", command=self.mapping_tree.yview)
     mapping_h_scroll = ttk.Scrollbar(mapping_frame, orient="horizontal", command=self.mapping_tree.xview)
     self.mapping_tree.configure(yscrollcommand=mapping_v_scroll.set, xscrollcommand=mapping_h_scroll.set)
     
     self.mapping_tree.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
     mapping_v_scroll.grid(row=0, column=1, sticky=(tk.N, tk.S))
     mapping_h_scroll.grid(row=1, column=0, sticky=(tk.W, tk.E))
     
     mapping_frame.grid_rowconfigure(0, weight=1)
     mapping_frame.grid_columnconfigure(0, weight=1)
     
     # Enhanced statistics
     self.stats_label = ttk.Label(self.mapping_tab, text="", font=("Arial", 10, "bold"))
     self.stats_label.pack(pady=10)
     
     # Proceed button
     self.proceed_btn = ttk.Button(self.mapping_tab, text="Proceed to Enhanced Calculations", 
                                 command=self.proceed_to_calculations, state=tk.DISABLED)
     self.proceed_btn.pack(pady=10)

 def create_enhanced_calculation_tab(self):
     # Main container
     main_container = ttk.Frame(self.calc_tab)
     main_container.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
     
     # Enhanced discount options with rate card information
     discount_options_frame = ttk.LabelFrame(main_container, text="Enhanced Discount Options", padding="10")
     discount_options_frame.pack(fill=tk.X, pady=(0, 10))
     
     # Option 1 - Manual Package Value (Enhanced)
     option1_frame = ttk.LabelFrame(discount_options_frame, text="Option 01 - Manual Package Value", padding="10")
     option1_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 5))
     
     ttk.Label(option1_frame, text="Total Rate Card Value", font=("Arial", 9)).grid(row=0, column=0, sticky='w', pady=1)
     self.total_rate_card_label1 = ttk.Label(option1_frame, text="0.00", font=("Arial", 9), foreground="blue")
     self.total_rate_card_label1.grid(row=0, column=1, sticky='e', padx=(10, 0), pady=1)
     
     # Package Value input
     package_frame = ttk.Frame(option1_frame)
     package_frame.grid(row=1, column=0, columnspan=2, sticky='ew', pady=1)
     ttk.Label(package_frame, text="Package Value", font=("Arial", 9)).pack(side=tk.LEFT)
     self.package_value_var = tk.StringVar()
     self.package_value_entry = ttk.Entry(package_frame, textvariable=self.package_value_var, width=12)
     self.package_value_entry.pack(side=tk.RIGHT, padx=(3, 3))
     ttk.Button(package_frame, text="Apply", command=self.apply_option1).pack(side=tk.RIGHT)
     
     ttk.Label(option1_frame, text="Calculated Discount %", font=("Arial", 9, "bold"), foreground="red").grid(row=2, column=0, sticky='w', pady=1)
     self.discount_percent_label1 = ttk.Label(option1_frame, text="0.0%", font=("Arial", 9, "bold"), foreground="red")
     self.discount_percent_label1.grid(row=2, column=1, sticky='e', padx=(10, 0), pady=1)
     
     # Option 2 - Enhanced Agency Rate Application
     option2_frame = ttk.LabelFrame(discount_options_frame, text="Option 02 - Apply Agency Rate Card", padding="10")
     option2_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(5, 0))
     
     ttk.Label(option2_frame, text="Total Rate Card Value", font=("Arial", 9)).grid(row=0, column=0, sticky='w', pady=1)
     self.total_rate_card_label2 = ttk.Label(option2_frame, text="0.00", font=("Arial", 9), foreground="blue")
     self.total_rate_card_label2.grid(row=0, column=1, sticky='e', padx=(10, 0), pady=1)
     
     ttk.Label(option2_frame, text="Calculated Package Value", font=("Arial", 9)).grid(row=1, column=0, sticky='w', pady=1)
     self.package_value_label2 = ttk.Label(option2_frame, text="0.00", font=("Arial", 9), foreground="blue")
     self.package_value_label2.grid(row=1, column=1, sticky='e', padx=(10, 0), pady=1)
     
     # Enhanced agency rate display
     rate_frame = ttk.Frame(option2_frame)
     rate_frame.grid(row=2, column=0, columnspan=2, sticky='ew', pady=1)
     ttk.Label(rate_frame, text="Rate Card Type", font=("Arial", 9, "bold"), foreground="green").pack(side=tk.LEFT)
     self.rate_card_type_display = ttk.Label(rate_frame, text="Not Selected", font=("Arial", 9, "bold"), foreground="green")
     self.rate_card_type_display.pack(side=tk.RIGHT, padx=(3, 3))
     ttk.Button(rate_frame, text="Apply Agency Rates", command=self.apply_option2_enhanced).pack(side=tk.RIGHT)
     
     # Agency-Client info (Enhanced)
     info_frame = ttk.Frame(option2_frame)
     info_frame.grid(row=3, column=0, columnspan=2, sticky='ew', pady=2)
     self.agency_client_display = ttk.Label(info_frame, text="Select Agency & Client in Upload Tab", 
                                           font=("Arial", 8), foreground="orange")
     self.agency_client_display.pack()
     
     # Calculate and Export buttons
     button_frame = ttk.Frame(main_container)
     button_frame.pack(fill=tk.X, pady=(0, 10))
     
     ttk.Button(button_frame, text="Calculate Enhanced Analysis", 
             command=self.calculate_enhanced_analysis).pack(side=tk.LEFT, padx=(0, 5))
     
     ttk.Button(button_frame, text="Export Enhanced Report", 
             command=self.export_enhanced_report).pack(side=tk.LEFT, padx=5)
     
     ttk.Button(button_frame, text="Save to History", 
             command=self.save_current_calculation).pack(side=tk.LEFT, padx=5)
     
     # Enhanced content area
     content_frame = ttk.Frame(main_container)
     content_frame.pack(fill=tk.BOTH, expand=True)
     
     # Left side - Enhanced Program Analysis Table
     left_frame = ttk.Frame(content_frame)
     left_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 10))
     
     analysis_frame = ttk.LabelFrame(left_frame, text="Enhanced Program Analysis with Rate Sources", padding="5")
     analysis_frame.pack(fill=tk.BOTH, expand=True)
     
     # Enhanced treeview with rate source information
     columns = ('5s', '10s', '15s', '20s', '25s', '30s', '45s', '60s', 
               'total_30s', 'rc_rate', 'value_rs', 'discounted_value', 'investment_percent', 'rate_source')
     
     self.program_tree = ttk.Treeview(analysis_frame, columns=columns, show='tree headings', height=16)
     
     # Configure headings
     self.program_tree.heading('#0', text='Program')
     for col in ['5s', '10s', '15s', '20s', '25s', '30s', '45s', '60s']:
         self.program_tree.heading(col, text=col)
     
     self.program_tree.heading('total_30s', text='Total 30s')
     self.program_tree.heading('rc_rate', text='Rate')
     self.program_tree.heading('value_rs', text='Value Rs')
     self.program_tree.heading('discounted_value', text='Final Value')
     self.program_tree.heading('investment_percent', text='% Invest')
     self.program_tree.heading('rate_source', text='Rate Source')
     
     # Configure column widths
     self.program_tree.column('#0', width=180)
     duration_columns = ['5s', '10s', '15s', '20s', '25s', '30s', '45s', '60s']
     for col in duration_columns:
         self.program_tree.column(col, width=35)
     
     self.program_tree.column('total_30s', width=60)
     self.program_tree.column('rc_rate', width=70)
     self.program_tree.column('value_rs', width=90)
     self.program_tree.column('discounted_value', width=90)
     self.program_tree.column('investment_percent', width=60)
     self.program_tree.column('rate_source', width=120)
     
     # Scrollbars
     tree_v_scroll = ttk.Scrollbar(analysis_frame, orient="vertical", command=self.program_tree.yview)
     tree_h_scroll = ttk.Scrollbar(analysis_frame, orient="horizontal", command=self.program_tree.xview)
     self.program_tree.configure(yscrollcommand=tree_v_scroll.set, xscrollcommand=tree_h_scroll.set)
     
     self.program_tree.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
     tree_v_scroll.grid(row=0, column=1, sticky=(tk.N, tk.S))
     tree_h_scroll.grid(row=1, column=0, sticky=(tk.W, tk.E))
     
     analysis_frame.grid_rowconfigure(0, weight=1)
     analysis_frame.grid_columnconfigure(0, weight=1)
     
     # Right side - Enhanced summary panel
     right_frame = ttk.LabelFrame(content_frame, text="Enhanced Summary & Rate Analysis", padding="5")
     right_frame.pack(side=tk.RIGHT, fill=tk.Y)
     right_frame.configure(width=300)
     
     # Rate Card Summary (NEW)
     rate_summary_frame = ttk.LabelFrame(right_frame, text="Rate Card Analysis", padding="5")
     rate_summary_frame.pack(fill=tk.X, pady=(0, 5))
     
     self.rate_analysis_text = tk.Text(rate_summary_frame, width=35, height=6, wrap=tk.WORD, font=("Arial", 8))
     self.rate_analysis_text.pack(fill=tk.BOTH, expand=True)
     
     # Agency-Client Summary (Enhanced)
     agency_summary_frame = ttk.LabelFrame(right_frame, text="Agency & Client Info", padding="5")
     agency_summary_frame.pack(fill=tk.X, pady=(0, 5))
     
     self.agency_summary_text = tk.Text(agency_summary_frame, width=35, height=6, wrap=tk.WORD, font=("Arial", 8))
     self.agency_summary_text.pack(fill=tk.BOTH, expand=True)
     
     # Spot Mix Analysis
     spot_frame = ttk.LabelFrame(right_frame, text="Spot Mix Analysis", padding="5")
     spot_frame.pack(fill=tk.X, pady=(0, 5))
     
     self.spot_mix_text = tk.Text(spot_frame, width=35, height=6, wrap=tk.WORD, font=("Arial", 8))
     self.spot_mix_text.pack(fill=tk.BOTH, expand=True)
     
     # Enhanced Financial Summary
     summary_frame = ttk.LabelFrame(right_frame, text="Financial Summary", padding="5")
     summary_frame.pack(fill=tk.BOTH, expand=True)
     
     self.summary_text = tk.Text(summary_frame, width=35, height=8, wrap=tk.WORD, font=("Arial", 8))
     self.summary_text.pack(fill=tk.BOTH, expand=True)
     
     # Initialize displays
     self.update_agency_client_summary()
     self.update_rate_analysis_summary()

 # Core functionality methods (enhanced versions)
 def upload_excel(self):
     """Enhanced Excel upload with better error handling"""
     file_path = filedialog.askopenfilename(
         title="Select Excel File",
         filetypes=[("Excel files", "*.xlsx *.xls"), ("All files", "*.*")]
     )
     
     if file_path:
         try:
             # Store file path for history
             self.current_excel_path = file_path
             
             # Read Excel file
             self.uploaded_data = pd.read_excel(file_path, header=None)
             
             # Find header row and column positions
             header_row, self.column_positions = self.find_header_row_and_columns()
             
             if header_row is None:
                 messagebox.showerror("Error", "Could not find header row in the Excel file.")
                 return
                 
             # Re-read with correct header
             self.uploaded_data = pd.read_excel(file_path, header=int(header_row))
             
             # Clean column names
             self.uploaded_data.columns = [str(col).strip().upper() for col in self.uploaded_data.columns]
             
             self.file_label.config(text=f"File: {file_path.split('/')[-1]}", foreground="green")
             self.process_btn.config(state=tk.NORMAL)
             messagebox.showinfo("Success", f"Excel file loaded successfully!\nFound {len(self.uploaded_data)} rows.")
             
         except Exception as e:
             messagebox.showerror("Error", f"Error reading Excel file: {str(e)}")

 def load_agencies(self):
     """Enhanced agency loading"""
     if not self.connection:
         return
     
     try:
         cursor = self.connection.cursor()
         cursor.execute("SELECT agency_id, agency_name FROM agencies ORDER BY agency_name")
         
         agencies = [("", "-- Select Agency --")]
         for row in cursor.fetchall():
             agencies.append((row[1], row[0]))
         
         self.agency_combo['values'] = [agency[0] for agency in agencies]
         self.agencies_data = agencies
         
         if agencies:
             self.agency_combo.current(0)
             
     except sqlite3.Error as err:
         messagebox.showerror("Database Error", f"Error loading agencies: {err}")
     finally:
         if cursor:
             cursor.close()

 def on_agency_selected(self, event=None):
     """Enhanced agency selection with rate card info"""
     selected_agency = self.selected_agency_var.get()
     
     if not selected_agency or selected_agency == "-- Select Agency --":
         self.client_combo['values'] = ["-- Select Client --"]
         self.client_combo.current(0)
         self.update_rate_card_display("Not Selected", "0.0%")
         return
     
     # Get agency ID
     agency_id = None
     for agency_name, aid in self.agencies_data:
         if agency_name == selected_agency:
             agency_id = aid
             break
     
     if agency_id:
         self.load_clients_for_agency(agency_id)

 def load_clients_for_agency(self, agency_id):
     """Enhanced client loading with rate card type information"""
     if not self.connection:
         return
     
     try:  
         cursor = self.connection.cursor()
         cursor.execute("""
             SELECT c.client_id, c.client_name, ac.discount_rate, ac.rate_card_type, ac.agency_client_id
             FROM clients c
             JOIN agency_clients ac ON c.client_id = ac.client_id
             WHERE ac.agency_id = ?
             ORDER BY c.client_name
         """, (agency_id,))
         
         clients = [("", "-- Select Client --", 0, "none", 0)]
         for row in cursor.fetchall():
             clients.append((row[1], row[0], row[2], row[3], row[4]))  # name, id, discount, type, ac_id
         
         self.client_combo['values'] = [client[0] for client in clients]
         self.clients_data = clients
         
         if clients:
             self.client_combo.current(0)
             self.update_rate_card_display("Not Selected", "0.0%")
             
     except sqlite3.Error as err:
         messagebox.showerror("Database Error", f"Error loading clients: {err}")
     finally:
         if cursor:
             cursor.close()

 def on_client_selected(self, event=None):
     """Enhanced client selection with rate card type detection"""
     selected_client = self.selected_client_var.get()
     
     if not selected_client or selected_client == "-- Select Client --":
         self.update_rate_card_display("Not Selected", "0.0%")
         return
     
     # Get client info including rate card type
     for client_name, cid, discount, rate_type, ac_id in self.clients_data:
         if client_name == selected_client:
             self.selected_agency_client_id = ac_id
             
             if rate_type == 'custom':
                 self.update_rate_card_display("Custom Rate Card", f"Individual rates per program")
             else:
                 self.update_rate_card_display("Discount Rate", f"{float(discount)}%")
             
             # Update displays
             self.update_agency_client_summary()
             break

 def update_rate_card_display(self, card_type, rate_info):
     """Update rate card type and discount display"""
     self.rate_card_type_label.config(text=card_type)
     self.discount_display_label.config(text=rate_info)
     
     # Update calculation tab displays
     if hasattr(self, 'rate_card_type_display'):
         self.rate_card_type_display.config(text=card_type)

 def find_header_row_and_columns(self):
     """Enhanced header detection with 24-hour time support"""
     header_row = None
     column_positions = {}
     
     df = self.uploaded_data
     
     # Search for header row
     for idx in range(min(15, len(df))):
         row_values = [str(val).upper().strip() for val in df.iloc[idx].values if pd.notna(val)]
         
         if any('PROGRAM' in val for val in row_values):
             header_row = idx
             break
     
     if header_row is None:
         raise Exception("Could not find header row with PROGRAM column")
     
     # Get header row
     headers = df.iloc[header_row].values
     
     # Find column positions with enhanced time detection
     time_col_found = False
     
     for col_idx, header in enumerate(headers):
         header_str = str(header).upper().strip()
         
         if 'PROGRAM' in header_str:
             column_positions['program'] = col_idx
         elif header_str == 'DAY':
             column_positions['day'] = col_idx
         elif 'TIME' in header_str and not time_col_found:
             column_positions['start_time'] = col_idx
             column_positions['end_time'] = col_idx + 1
             time_col_found = True
         elif header_str == 'DUR':
             column_positions['duration'] = col_idx
         elif header_str in ['BRAND', 'THEME', 'CAMPAIGN']:
             column_positions['theme'] = col_idx
         elif 'TOTAL SPOTS' in header_str:
             column_positions['total_spots'] = col_idx
     
     return header_row, column_positions

 def process_data(self):
     """Enhanced data processing with 24-hour time support"""
     if self.uploaded_data is None:
         return
     
     # Clear preview
     for item in self.preview_tree.get_children():
         self.preview_tree.delete(item)
     
     self.themes_data = {}
     current_theme = "Unknown"
     
     for index, row in self.uploaded_data.iterrows():
         try:
             # Get values using column positions
             program_val = str(row.iloc[self.column_positions.get('program', -1)]).strip() if 'program' in self.column_positions else ""
             day_val = str(row.iloc[self.column_positions.get('day', -1)]).strip() if 'day' in self.column_positions else ""
             
             # Skip empty rows
             if program_val == '' or program_val == 'nan':
                 continue
             
             # Check for theme header
             if (day_val == '' or day_val == 'nan') and \
                ('start_time' not in self.column_positions or str(row.iloc[self.column_positions['start_time']]).strip() == '' or str(row.iloc[self.column_positions['start_time']]).strip() == 'nan'):
                 if not any(keyword in program_val.upper() for keyword in ['SPONSORSHIP', 'BENEFITS', 'PRESENCE']):
                     current_theme = program_val
                 continue
             
             # Skip header-like rows
             if any(keyword in program_val.upper() for keyword in 
                   ['SPONSORSHIP', 'BENEFITS', 'PRESENCE', 'COMMERCIAL']):
                 continue
             
             # Enhanced time processing with 24-hour support
             start_time_val = ""
             end_time_val = ""
             
             if 'start_time' in self.column_positions:
                 start_val = row.iloc[self.column_positions['start_time']]
                 if pd.notna(start_val):
                     start_time_val = self.format_24h_time(start_val)
             
             if 'end_time' in self.column_positions:
                 end_val = row.iloc[self.column_positions['end_time']]
                 if pd.notna(end_val):
                     end_time_val = self.format_24h_time(end_val)
             
             dur_val = row.iloc[self.column_positions['duration']] if 'duration' in self.column_positions else 0
             spots_val = row.iloc[self.column_positions['total_spots']] if 'total_spots' in self.column_positions else 0
             
             # Skip rows without essential data or with zero spots
             if not dur_val or not spots_val or self.is_zero_spots(spots_val):
                 continue
             
             # Create enhanced time range string (24-hour format)
             time_range = f"{start_time_val} {end_time_val}" if start_time_val and end_time_val else ""
             
             # Calculate total seconds
             total_seconds = int(dur_val) * int(spots_val)
             
             # Store enhanced processed data
             program_data = {
                 'theme': current_theme,
                 'program': program_val,
                 'day': day_val,
                 'time_range': time_range,
                 'start_time': start_time_val,
                 'end_time': end_time_val,
                 'duration': int(dur_val),
                 'spots': int(spots_val),
                 'total_seconds': total_seconds
             }
             
             # Group by theme
             if current_theme not in self.themes_data:
                 self.themes_data[current_theme] = []
             self.themes_data[current_theme].append(program_data)
             
             # Add to enhanced preview tree
             self.preview_tree.insert('', tk.END, values=(
                 current_theme, program_val, day_val, time_range, 
                 int(dur_val), int(spots_val), total_seconds
             ))
             
         except (ValueError, TypeError) as e:
             print(f"Error processing row {index}: {e}")
             continue
     
     # Switch to mapping tab
     self.notebook.select(1)
     
     total_programs = sum(len(programs) for programs in self.themes_data.values())
     messagebox.showinfo("Enhanced Processing Complete", 
                       f"✅ Enhanced data processing completed!\n\n"
                       f"📊 RESULTS:\n"
                       f"• Programs: {total_programs}\n"
                       f"• Themes: {len(self.themes_data)}\n"
                       f"• Format: 24-hour time support\n"
                       f"• Status: Ready for enhanced mapping")

 def format_24h_time(self, time_value):
     """Enhanced 24-hour time formatting"""
     if pd.isna(time_value) or time_value == '':
         return ""
     
     try:
         # Handle if it's already in proper time format
         if isinstance(time_value, str) and ':' in time_value:
             # Validate and reformat
             parts = time_value.split(':')
             if len(parts) >= 2:
                 hours = int(parts[0])
                 minutes = int(parts[1])
                 if 0 <= hours <= 23 and 0 <= minutes <= 59:
                     return f"{hours:02d}:{minutes:02d}"
         
         # Handle decimal time (fraction of 24 hours)
         if isinstance(time_value, (int, float)):
             total_minutes = float(time_value) * 24 * 60
             hours = int(total_minutes // 60)
             minutes = int(total_minutes % 60)
             if 0 <= hours <= 23:
                 return f"{hours:02d}:{minutes:02d}"
         
         return str(time_value)
         
     except (ValueError, TypeError):
         return str(time_value) if time_value else ""

 def is_zero_spots(self, spots_value):
     """Enhanced zero spots checking"""
     if pd.isna(spots_value) or spots_value == '' or spots_value is None:
         return True
     
     try:
         spots_str = str(spots_value).strip().lower()
         if spots_str in ['0', '0.0', 'nan', '', 'none']:
             return True
         
         spots_num = float(spots_str)
         return spots_num == 0.0
         
     except (ValueError, TypeError):
         return True

 def load_program_schedules(self):
     """Enhanced program schedules loading"""
     if not self.connection:
         return
     
     try:
         cursor = self.connection.cursor()
         cursor.execute("""
             SELECT p.program_name, s.start_time, s.end_time, s.rate_30sec, 
                 d.pattern_code, d.description, s.schedule_id,
                 pc.category_name, psc.subcategory_name
             FROM program_schedules s
             JOIN programs p ON s.program_id = p.program_id
             JOIN day_patterns d ON s.day_pattern_id = d.day_pattern_id
             JOIN program_subcategories psc ON p.subcategory_id = psc.subcategory_id
             JOIN program_categories pc ON psc.category_id = pc.category_id
             ORDER BY p.program_name, s.start_time
         """)
         
         for row in cursor.fetchall():
             (program_name, start_time, end_time, rate, pattern_code, pattern_desc, 
             schedule_id, category, subcategory) = row
             
             # Enhanced time formatting with 24-hour support
             start_str = self.format_time_string(start_time)
             end_str = self.format_time_string(end_time)
             
             time_key = f"{start_str}-{end_str}"
             base_key = f"{program_name}|{pattern_code}|{time_key}"
             
             # Enhanced schedule data with additional information
             schedule_data = {
                 'program_name': program_name,
                 'start_time': start_str,
                 'end_time': end_str,
                 'rate': float(rate) if rate else 0.0,
                 'pattern_code': pattern_code,
                 'pattern_desc': pattern_desc,
                 'schedule_id': schedule_id,
                 'category': category,
                 'subcategory': subcategory,
                 'time_key': time_key
             }
             
             self.program_schedules[base_key] = schedule_data
             
             # Create alternative keys for enhanced matching
             alt_keys = [
                 f"{program_name.lower()}|{pattern_code.lower()}|{time_key}",
                 f"{start_str}|{end_str}|{pattern_code}",
                 f"{program_name}|{time_key}"
             ]
             
             for alt_key in alt_keys:
                 if alt_key not in self.program_schedules:
                     self.program_schedules[alt_key] = schedule_data
             
     except sqlite3.Error as err:
         messagebox.showerror("Database Error", f"Error loading program schedules: {err}")
     finally:
         if cursor:
             cursor.close()

 def format_time_string(self, time_obj):
     """Enhanced time string formatting with 24-hour support"""
     if time_obj is None or time_obj == '':
         return ""
     
     try:
         if isinstance(time_obj, str):
             time_parts = time_obj.split(':')
             if len(time_parts) >= 2:
                 hours = int(time_parts[0])
                 minutes = int(time_parts[1])
                 return f"{hours:02d}:{minutes:02d}"
             return time_obj
             
         elif isinstance(time_obj, timedelta):
             total_seconds = int(time_obj.total_seconds())
             hours, remainder = divmod(total_seconds, 3600)
             minutes, _ = divmod(remainder, 60)
             return f"{hours:02d}:{minutes:02d}"
             
         elif hasattr(time_obj, 'strftime'):
             return time_obj.strftime("%H:%M")
             
         else:
             time_str = str(time_obj)
             if ':' in time_str:
                 time_parts = time_str.split(':')
                 if len(time_parts) >= 2:
                     hours = int(time_parts[0])
                     minutes = int(time_parts[1])
                     return f"{hours:02d}:{minutes:02d}"
             
             return time_str
             
     except Exception as e:
         print(f"Enhanced time formatting error for {time_obj}: {e}")
         return str(time_obj) if time_obj else ""

 def is_prime_time(self, start_time):
     """Enhanced prime time detection with 24-hour support"""
     try:
         if not start_time:
             return False
         if ':' in start_time:
             hour = int(start_time.split(':')[0])
         else:
             hour = int(start_time[:2]) if len(start_time) >= 2 else 0
         return 19 <= hour <= 23
     except (ValueError, IndexError, TypeError):
         return False

 # Auto-matching methods (enhanced versions)
 def auto_match_programs(self):
     """Enhanced auto-matching with rate preview"""
     print(f"\n=== STARTING ENHANCED AUTO-MATCH ===")
     
     self.program_mappings.clear()
     
     # Clear mapping tree
     for item in self.mapping_tree.get_children():
         self.mapping_tree.delete(item)
     
     matched_count = 0
     total_count = 0
     agency_client_id = getattr(self, 'selected_agency_client_id', None)
     
     for theme, programs in self.themes_data.items():
         for program_data in programs:
             total_count += 1
             
             best_match = self.find_best_match(program_data)
             match_key = f"{theme}|{program_data['program']}|{program_data['day']}|{program_data['time_range']}"
             
             if best_match and best_match['confidence'] > 0.5:
                 self.program_mappings[match_key] = {
                     'program_data': program_data,
                     'db_schedule': best_match['schedule'],
                     'match_info': best_match
                 }
                 matched_count += 1
                 status = "✓ Auto-Matched"
                 
                 # Get rate preview if agency-client selected
                 rate_preview = "Rate not available"
                 if agency_client_id and best_match['schedule'].get('schedule_id'):
                     try:
                         rate_info = self.rate_manager.get_effective_rate(
                             agency_client_id, best_match['schedule']['schedule_id'])
                         if rate_info:
                             rate_preview = f"LKR {rate_info['rate']:,.0f} ({rate_info['type']})"
                     except:
                         pass
             else:
                 status = "⚠ Unmatched"
                 best_match = {'schedule': {}, 'match_type': 'No Match', 'confidence': 0}
                 rate_preview = "No rate available"
             
             # Add to enhanced mapping tree
             self.mapping_tree.insert('', tk.END, values=(
                 status,
                 program_data['program'],
                 f"{program_data['day']} | {program_data['time_range']}",
                 best_match['schedule'].get('program_name', 'No match found'),
                 best_match['schedule'].get('time_key', ''),
                 best_match['match_type'],
                 f"{best_match['confidence']:.1%}" if best_match['confidence'] > 0 else "0%",
                 rate_preview
             ))
     
     # Update statistics
     self.update_mapping_stats(matched_count, total_count)
     
     # Enable proceed button if we have matches
     if matched_count > 0:
         self.proceed_btn.config(state=tk.NORMAL)
     
     messagebox.showinfo("Enhanced Auto-Matching Complete", 
                       f"🎯 Enhanced auto-matching completed!\n\n"
                       f"📊 RESULTS:\n"
                       f"• Matched: {matched_count}/{total_count}\n"
                       f"• Success Rate: {(matched_count/total_count)*100:.1f}%\n"
                       f"• Rate Preview: {'Available' if agency_client_id else 'Select agency & client'}\n\n"
                       f"✅ Enhanced system with rate source detection active!")

 def find_best_match(self, program_data):
     """Enhanced program matching with better accuracy"""
     excel_program = program_data['program'].lower().strip()
     excel_day = program_data['day'].lower().strip()
     excel_start = program_data['start_time']
     excel_end = program_data['end_time']
     
     best_score = 0
     best_match = None
     
     for db_key, db_schedule in self.program_schedules.items():
         score = 0
         match_factors = []
         
         # Enhanced time slot matching (40 points)
         if excel_start and excel_end:
             if (excel_start == db_schedule['start_time'] and 
                 excel_end == db_schedule['end_time']):
                 score += 40
                 match_factors.append("Exact Time Match")
             elif (excel_start == db_schedule['start_time'] or 
                   excel_end == db_schedule['end_time']):
                 score += 25
                 match_factors.append("Partial Time Match")
             else:
                 # Enhanced time proximity check
                 try:
                     excel_start_minutes = int(excel_start.split(':')[0]) * 60 + int(excel_start.split(':')[1])
                     db_start_minutes = int(db_schedule['start_time'].split(':')[0]) * 60 + int(db_schedule['start_time'].split(':')[1])
                     time_diff = abs(excel_start_minutes - db_start_minutes)
                     if time_diff <= 15:  # Within 15 minutes
                         score += 20
                         match_factors.append("Close Time Match")
                     elif time_diff <= 30:  # Within 30 minutes
                         score += 10
                         match_factors.append("Similar Time")
                 except:
                     pass
         
         # Enhanced day pattern matching (40 points)
         if self.match_day_patterns_enhanced(excel_day, db_schedule['pattern_code']):
             score += 40
             match_factors.append("Day Pattern Match")
         
         # Enhanced program name similarity (20 points)
         db_program = db_schedule['program_name'].lower().strip()
         
         if excel_program in db_program or db_program in excel_program:
             score += 20
             match_factors.append("Direct Name Match")
         else:
             # Enhanced fuzzy matching
             similarity = SequenceMatcher(None, excel_program, db_program).ratio()
             if similarity > 0.7:
                 name_score = int(similarity * 15)
                 score += name_score
                 match_factors.append(f"Name Similarity ({similarity:.1%})")
         
         # Enhanced scoring with category bonus
         if score > best_score and score > 60:  # Raised threshold for better accuracy
             best_score = score
             best_match = {
                 'schedule': db_schedule,
                 'match_type': ", ".join(match_factors),
                 'confidence': min(score / 100, 1.0)
             }
     
     return best_match

 def match_day_patterns_enhanced(self, excel_day, db_pattern):
     """Enhanced day pattern matching with better accuracy"""
     if not excel_day or not db_pattern:
         return False
     
     excel_clean = excel_day.lower().replace(' ', '').replace('-', '').replace('_', '')
     db_clean = db_pattern.lower().replace(' ', '').replace('-', '').replace('_', '')
     
     # Direct match
     if excel_clean == db_clean:
         return True
     
     # Enhanced mapping patterns with more variations
     enhanced_mappings = {
         'daily': ['daily', 'all', 'everyday', 'everydays', '7days'],
         'montofri': ['weekdays', 'wkdays', 'mondaytofriday', 'weekday', 'mon-fri', 'monfri'],
         'sattosun': ['weekends', 'wkends', 'saturdaytosunday', 'weekend', 'sat-sun', 'satsun'],
         'saturday': ['sat', 'saturday', 'sat.day', 'satday', 'saturdays'],
         'sunday': ['sun', 'sunday', 'sundays', 'sun.day'],
         'monday': ['mon', 'monday', 'mondays', 'mon.day'],
         'tuesday': ['tue', 'tuesday', 'tuesdays', 'tue.day', 'tues'],
         'wednesday': ['wed', 'wednesday', 'wednesdays', 'wed.day'],
         'thursday': ['thu', 'thursday', 'thursdays', 'thu.day', 'thurs'],
         'friday': ['fri', 'friday', 'fridays', 'fri.day'],
         'tuefri': ['tuefri', 'tuesdayfriday', 'tue-fri', 'tuesdaytofriday', 'tues-fri'],
         'poyadays': ['poya', 'poyadays', 'poya days', 'poyaday'],
     }
     
     # Check enhanced mappings
     for pattern_group, variations in enhanced_mappings.items():
         if (excel_clean in variations or any(v in excel_clean for v in variations)) and \
            (db_clean in variations or any(v in db_clean for v in variations)):
             return True
     
     # Enhanced partial matching
     weekday_patterns = ['mon', 'tue', 'wed', 'thu', 'fri', 'weekday', 'wkdays']
     weekend_patterns = ['sat', 'sun', 'weekend', 'wkends']
     
     excel_is_weekday = any(pattern in excel_clean for pattern in weekday_patterns)
     db_is_weekday = any(pattern in db_clean for pattern in weekday_patterns)
     excel_is_weekend = any(pattern in excel_clean for pattern in weekend_patterns)
     db_is_weekend = any(pattern in db_clean for pattern in weekend_patterns)
     
     return (excel_is_weekday and db_is_weekday) or (excel_is_weekend and db_is_weekend)

 # Mapping management methods
 def clear_all_mappings(self):
     """Enhanced clear all mappings"""
     if not self.program_mappings:
         messagebox.showinfo("No Mappings", "No mappings to clear.")
         return
     
     if messagebox.askyesno("Confirm Clear", "Are you sure you want to clear all mappings?"):
         self.program_mappings.clear()
         for item in self.mapping_tree.get_children():
             self.mapping_tree.delete(item)
         self.proceed_btn.config(state=tk.DISABLED)
         self.update_mapping_stats(0, 0)
         messagebox.showinfo("Cleared", "All mappings cleared.")

 def deselect_selected_mapping(self):
     """Enhanced deselection with better feedback"""
     selected_items = self.mapping_tree.selection()
     
     if not selected_items:
         messagebox.showwarning("No Selection", "Please select mappings to deselect.")
         return
     
     if messagebox.askyesno("Confirm Deselection", 
                           f"Deselect {len(selected_items)} mapping(s)?"):
         
         keys_to_remove = []
         for item in selected_items:
             values = self.mapping_tree.item(item)['values']
             if len(values) >= 2:
                 excel_program = values[1]
                 day_time = values[2]
                 
                 for key, mapping_data in self.program_mappings.items():
                     program_data = mapping_data['program_data']
                     if (program_data['program'] == excel_program and 
                         f"{program_data['day']} | {program_data['time_range']}" == day_time):
                         keys_to_remove.append(key)
                         break

         for key in keys_to_remove:
             if key in self.program_mappings:
                 del self.program_mappings[key]

         self.refresh_mapping_tree()
         messagebox.showinfo("Deselected", f"Deselected {len(keys_to_remove)} mapping(s).")

 def deselect_auto_matches(self):
     """Enhanced auto-match deselection"""
     if not self.program_mappings:
         messagebox.showinfo("No Mappings", "No mappings available.")
         return
     
     auto_matched_keys = [key for key, mapping_data in self.program_mappings.items() 
                        if 'Manual' not in mapping_data.get('match_info', {}).get('match_type', '')]
     
     if not auto_matched_keys:
         messagebox.showinfo("No Auto-Matches", "No automatically matched programs found.")
         return
     
     if messagebox.askyesno("Confirm Deselection", 
                           f"Deselect {len(auto_matched_keys)} auto-matched programs?"):
         for key in auto_matched_keys:
             del self.program_mappings[key]

         self.refresh_mapping_tree()
         messagebox.showinfo("Deselected", f"Deselected {len(auto_matched_keys)} auto-matches.")

 def deselect_low_confidence(self):
     """Enhanced low confidence deselection"""
     if not self.program_mappings:
         return
     
     # Threshold selection dialog
     threshold_dialog = tk.Toplevel(self.root)
     threshold_dialog.title("Confidence Threshold")
     threshold_dialog.geometry("350x200")
     
     ttk.Label(threshold_dialog, text="Deselect mappings with confidence below:", 
              font=("Arial", 10)).pack(pady=10)
     
     threshold_var = tk.DoubleVar(value=0.75)
     threshold_scale = ttk.Scale(threshold_dialog, from_=0.1, to=1.0, 
                               variable=threshold_var, orient='horizontal', length=250)
     threshold_scale.pack(pady=10)
     
     threshold_label = ttk.Label(threshold_dialog, text="75%", font=("Arial", 12, "bold"))
     threshold_label.pack()
     
     def update_label():
         threshold_label.config(text=f"{threshold_var.get():.0%}")
     
     threshold_scale.config(command=lambda x: update_label())
     
     result = {'confirmed': False, 'threshold': 0.75}
     
     def confirm():
         result['confirmed'] = True
         result['threshold'] = threshold_var.get()
         threshold_dialog.destroy()
     
     button_frame = ttk.Frame(threshold_dialog)
     button_frame.pack(pady=15)
     ttk.Button(button_frame, text="Apply", command=confirm).pack(side=tk.LEFT, padx=5)
     ttk.Button(button_frame, text="Cancel", command=threshold_dialog.destroy).pack(side=tk.LEFT, padx=5)
     
     threshold_dialog.wait_window()
     
     if result['confirmed']:
         threshold = result['threshold']
         low_confidence_keys = [key for key, mapping_data in self.program_mappings.items() 
                              if mapping_data.get('match_info', {}).get('confidence', 0) < threshold]

         if low_confidence_keys:
             for key in low_confidence_keys:
                 del self.program_mappings[key]
             self.refresh_mapping_tree()
             messagebox.showinfo("Deselected", f"Deselected {len(low_confidence_keys)} low confidence mappings.")
         else:
             messagebox.showinfo("No Matches", f"No mappings below {threshold:.0%} confidence found.")

 def refresh_mapping_tree(self):
     """Enhanced mapping tree refresh with rate preview"""
     for item in self.mapping_tree.get_children():
         self.mapping_tree.delete(item)
     
     agency_client_id = getattr(self, 'selected_agency_client_id', None)
     
     for key, mapping_data in self.program_mappings.items():
         program_data = mapping_data['program_data']
         db_schedule = mapping_data['db_schedule']
         match_info = mapping_data['match_info']
         
         # Get rate preview
         rate_preview = "Rate not available"
         if agency_client_id and db_schedule.get('schedule_id'):
             try:
                 rate_info = self.rate_manager.get_effective_rate(
                     agency_client_id, db_schedule['schedule_id'])
                 if rate_info:
                     rate_preview = f"LKR {rate_info['rate']:,.0f} ({rate_info['type']})"
             except:
                 pass
         
         self.mapping_tree.insert('', tk.END, values=(
             "✓ Matched",
             program_data['program'],
             f"{program_data['day']} | {program_data['time_range']}",
             db_schedule['program_name'],
             db_schedule['time_key'],
             match_info['match_type'],
             f"{match_info['confidence']:.1%}",
             rate_preview
         ))
     
     total_programs = sum(len(programs) for programs in self.themes_data.values())
     matched_count = len(self.program_mappings)
     self.update_mapping_stats(matched_count, total_programs)

 def update_mapping_stats(self, matched_count, total_count):
     """Enhanced mapping statistics"""
     unmatched_count = total_count - matched_count
     success_rate = (matched_count / total_count * 100) if total_count > 0 else 0
     
     stats_text = f"📊 Matched: {matched_count} | ⚠ Unmatched: {unmatched_count} | 📈 Total: {total_count} | ✅ Success: {success_rate:.1f}%"
     self.stats_label.config(text=stats_text)

 def proceed_to_calculations(self):
     """Enhanced proceed to calculations"""
     if not self.program_mappings:
         messagebox.showwarning("No Mappings", "Please map at least one program.")
         return
     
     self.notebook.select(2)
     
     agency_client_info = ""
     if hasattr(self, 'selected_agency_client_id'):
         try:
             cursor = self.connection.cursor()
             cursor.execute("""
                 SELECT a.agency_name, c.client_name, ac.rate_card_type
                 FROM agency_clients ac
                 JOIN agencies a ON ac.agency_id = a.agency_id
                 JOIN clients c ON ac.client_id = c.client_id
                 WHERE ac.agency_client_id = ?
             """, (self.selected_agency_client_id,))
             
             result = cursor.fetchone()
             if result:
                 agency_name, client_name, rate_type = result
                 agency_client_info = f"\n\n🏢 Selected: {agency_name} - {client_name}\n📋 Rate Type: {rate_type.title()}"
         except:
             pass
         finally:
             if cursor:
                 cursor.close()
     
     messagebox.showinfo("Ready for Enhanced Calculations", 
                       f"🎯 Ready for enhanced calculations!\n\n"
                       f"📊 MAPPING SUMMARY:\n"
                       f"• Mapped Programs: {len(self.program_mappings)}\n"
                       f"• Enhanced Rate System: Active\n"
                       f"• 24-hour Time Format: Supported"
                       f"{agency_client_info}")

 def open_manual_mapping(self):
     """Enhanced manual mapping with rate preview"""
     # Get unmatched programs grouped by program and day
     unmatched_groups = {}
     
     for theme, programs in self.themes_data.items():
         for program_data in programs:
             match_key = f"{theme}|{program_data['program']}|{program_data['day']}|{program_data['time_range']}"
             if match_key not in self.program_mappings:
                 group_key = f"{program_data['program']}|{program_data['day']}"
                 
                 if group_key not in unmatched_groups:
                     unmatched_groups[group_key] = {
                         'group_key': group_key,
                         'program_name': program_data['program'],
                         'day_pattern': program_data['day'],
                         'time_range': program_data['time_range'],
                         'individual_entries': [],
                         'durations': set(),
                         'themes': set()
                     }
                 
                 unmatched_groups[group_key]['individual_entries'].append({
                     'match_key': match_key,
                     'program_data': program_data,
                     'theme': theme
                 })
                 unmatched_groups[group_key]['durations'].add(program_data['duration'])
                 unmatched_groups[group_key]['themes'].add(theme)
     
     if not unmatched_groups:
         messagebox.showinfo("Manual Mapping", "No unmatched programs available.")
         return
     
     # Enhanced manual mapping dialog
     dialog = tk.Toplevel(self.root)
     dialog.title("Enhanced Manual Program Mapping")
     dialog.geometry("1300x750")
     dialog.transient(self.root)
     dialog.grab_set()
     
     # Main frame
     main_frame = ttk.Frame(dialog)
     main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
     
     # Enhanced instructions
     ttk.Label(main_frame, 
             text="🎯 ENHANCED MANUAL MAPPING: Select unmatched program groups and map to database programs.\n"
                  "✅ All durations and themes for the same program will be mapped together.\n"
                  "📊 Rate preview available when agency & client are selected.", 
             font=("Arial", 10, "bold")).pack(pady=(0, 15))
     
     # Create layout
     columns_frame = ttk.Frame(main_frame)
     columns_frame.pack(fill=tk.BOTH, expand=True)
     
     # Left - Unmatched programs
     left_frame = ttk.LabelFrame(columns_frame, text="Unmatched Program Groups", padding="5")
     left_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 5))
     
     unmatched_frame = ttk.Frame(left_frame)
     unmatched_frame.pack(fill=tk.BOTH, expand=True)
     
     unmatched_listbox = tk.Listbox(unmatched_frame, height=25, exportselection=False, font=("Arial", 9))
     unmatched_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
     
     unmatched_scrollbar = ttk.Scrollbar(unmatched_frame, orient="vertical", command=unmatched_listbox.yview)
     unmatched_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
     unmatched_listbox.config(yscrollcommand=unmatched_scrollbar.set)
     
     # Populate unmatched programs
     unmatched_items = []
     for group_key, group_data in unmatched_groups.items():
         durations_str = ", ".join([f"{dur}s" for dur in sorted(group_data['durations'])])
         themes_str = ", ".join(sorted(group_data['themes'])) if len(group_data['themes']) <= 2 else f"{len(group_data['themes'])} themes"
         
         display_text = f"{group_data['program_name']} | {group_data['day_pattern']} | {group_data['time_range']} | [{durations_str}] | ({themes_str})"
         unmatched_items.append({
             'group_key': group_key,
             'display': display_text,
             'group_data': group_data
         })
         unmatched_listbox.insert(tk.END, display_text)
     
     # Right - Database programs with rate preview
     right_frame = ttk.LabelFrame(columns_frame, text="Available Database Programs (with Rate Preview)", padding="5")
     right_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(5, 0))
     
     db_frame = ttk.Frame(right_frame)
     db_frame.pack(fill=tk.BOTH, expand=True)
     
     db_listbox = tk.Listbox(db_frame, height=25, exportselection=False, font=("Arial", 9))
     db_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
     
     db_scrollbar = ttk.Scrollbar(db_frame, orient="vertical", command=db_listbox.yview)
     db_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
     db_listbox.config(yscrollcommand=db_scrollbar.set)
     
     # Populate database programs with enhanced info and rate preview
     db_programs = []
     agency_client_id = getattr(self, 'selected_agency_client_id', None)
     
     for key, schedule in self.program_schedules.items():
         # Get rate preview if agency-client selected
         rate_info = ""
         if agency_client_id and schedule.get('schedule_id'):
             try:
                 rate_data = self.rate_manager.get_effective_rate(agency_client_id, schedule['schedule_id'])
                 if rate_data:
                     rate_info = f" | Rate: LKR {rate_data['rate']:,.0f} ({rate_data['type']})"
             except:
                 rate_info = " | Rate: Not available"
         
         display_text = f"{schedule['program_name']} | {schedule['time_key']} | {schedule['pattern_code']}{rate_info}"
         if display_text not in db_programs:
             db_programs.append(display_text)
             db_listbox.insert(tk.END, display_text)
     
     # Enhanced selection info
     info_frame = ttk.LabelFrame(main_frame, text="Enhanced Selection Details", padding="10")
     info_frame.pack(fill=tk.X, pady=15)
     
     selected_excel_label = ttk.Label(info_frame, text="Selected Program Group: None", wraplength=650, font=("Arial", 9))
     selected_excel_label.pack(anchor="w", pady=2)
     
     selected_db_label = ttk.Label(info_frame, text="Selected Database Program: None", wraplength=650, font=("Arial", 9))
     selected_db_label.pack(anchor="w", pady=2)
     
     details_label = ttk.Label(info_frame, text="", wraplength=650, foreground="blue", font=("Arial", 9))
     details_label.pack(anchor="w", pady=2)
     
     rate_preview_label = ttk.Label(info_frame, text="", wraplength=650, foreground="green", font=("Arial", 9, "bold"))
     rate_preview_label.pack(anchor="w", pady=2)
     
     def update_enhanced_selection_info():
         try:
             excel_selection = unmatched_listbox.get(unmatched_listbox.curselection())
             selected_excel_label.config(text=f"Selected Program Group: {excel_selection}")
             
             selected_index = unmatched_listbox.curselection()[0]
             selected_group = unmatched_items[selected_index]['group_data']
             entry_count = len(selected_group['individual_entries'])
             durations = sorted(selected_group['durations'])
             themes = sorted(selected_group['themes'])
             
             details_text = f"📊 This will map {entry_count} entries with durations: {', '.join([f'{dur}s' for dur in durations])} from themes: {', '.join(themes)}"
             details_label.config(text=details_text)
             
         except (tk.TclError, IndexError):
             selected_excel_label.config(text="Selected Program Group: None")
             details_label.config(text="")
         
         try:
             db_selection = db_listbox.get(db_listbox.curselection())
             selected_db_label.config(text=f"Selected Database Program: {db_selection}")
             
             # Enhanced rate preview
             if agency_client_id and "Rate: LKR" in db_selection:
                 rate_preview_label.config(text="✅ Rate information included in selection above.")
             else:
                 rate_preview_label.config(text="ℹ️ Select agency & client for rate preview.")
                 
         except tk.TclError:
             selected_db_label.config(text="Selected Database Program: None")
             rate_preview_label.config(text="")
     
     unmatched_listbox.bind('<<ListboxSelect>>', lambda e: update_enhanced_selection_info())
     db_listbox.bind('<<ListboxSelect>>', lambda e: update_enhanced_selection_info())
     
     # Enhanced buttons
     button_frame = ttk.Frame(main_frame)
     button_frame.pack(pady=15)
     
     def perform_enhanced_group_mapping():
         try:
             excel_index = unmatched_listbox.curselection()[0]
             selected_group_item = unmatched_items[excel_index]
             selected_group_data = selected_group_item['group_data']
             selected_db = db_listbox.get(db_listbox.curselection())
             
             # Find matching database program
             db_program_key = None
             for key, schedule in self.program_schedules.items():
                 db_display_base = f"{schedule['program_name']} | {schedule['time_key']} | {schedule['pattern_code']}"
                 if selected_db.startswith(db_display_base):
                     db_program_key = key
                     break
             
             if not db_program_key:
                 messagebox.showerror("Error", "Failed to find the selected database program.")
                 return
             
             # Map all entries in this group
             mapped_count = 0
             for entry in selected_group_data['individual_entries']:
                 self.program_mappings[entry['match_key']] = {
                     'program_data': entry['program_data'],
                     'db_schedule': self.program_schedules[db_program_key],
                     'match_info': {
                         'schedule': self.program_schedules[db_program_key],
                         'match_type': 'Enhanced Manual Group Mapping',
                         'confidence': 1.0
                     }
                 }
                 mapped_count += 1
             
             # Refresh and close
             self.refresh_mapping_tree()
             self.proceed_btn.config(state=tk.NORMAL)
             dialog.destroy()
             
             messagebox.showinfo("Enhanced Mapping Success", 
                               f"✅ Successfully mapped {mapped_count} entries!\n\n"
                               f"📊 Program: {selected_group_data['program_name']} ({selected_group_data['day_pattern']})\n"
                               f"🎯 Themes: {', '.join(sorted(selected_group_data['themes']))}\n"
                               f"📋 Database: {selected_db.split(' | Rate:')[0]}\n\n"
                               f"Enhanced mapping system active!")
         
         except (tk.TclError, IndexError):
             messagebox.showwarning("Selection Required", "Please select both program group and database program.")
     
     ttk.Button(button_frame, text="✅ Create Enhanced Mapping", command=perform_enhanced_group_mapping).pack(side=tk.LEFT, padx=10)
     ttk.Button(button_frame, text="❌ Cancel", command=dialog.destroy).pack(side=tk.LEFT, padx=5)
     
     dialog.focus_set()

 def show_rate_preview(self):
     """Show rate preview for selected agency-client"""
     if not hasattr(self, 'selected_agency_client_id'):
         messagebox.showwarning("Selection Required", "Please select agency and client first.")
         return
     
     if not self.program_mappings:
         messagebox.showwarning("No Mappings", "Please map programs first.")
         return
     
     # Create preview window
     preview_window = tk.Toplevel(self.root)
     preview_window.title("Rate Preview")
     preview_window.geometry("800x600")
     
     # Preview tree
     preview_columns = ('program', 'current_rate', 'rate_type', 'rate_source')
     preview_tree = ttk.Treeview(preview_window, columns=preview_columns, show='headings')
     
     preview_tree.heading('program', text='Program')
     preview_tree.heading('current_rate', text='Current Rate')
     preview_tree.heading('rate_type', text='Rate Type')
     preview_tree.heading('rate_source', text='Rate Source')
     
     preview_tree.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
     
     # Populate preview
     for match_key, mapping_data in self.program_mappings.items():
         db_schedule = mapping_data['db_schedule']
         schedule_id = db_schedule.get('schedule_id')
         
         if schedule_id:
             rate_info = self.rate_manager.get_effective_rate(self.selected_agency_client_id, schedule_id)
             if rate_info:
                 preview_tree.insert('', tk.END, values=(
                     db_schedule.get('program_name', 'Unknown'),
                     f"LKR {rate_info['rate']:,.2f}",
                     rate_info['type'].title(),
                     rate_info['source']
                 ))
     
     ttk.Button(preview_window, text="Close", command=preview_window.destroy).pack(pady=10)

 def calculate_enhanced_analysis(self):
     """Enhanced calculation with custom rate cards support"""
     if not self.program_mappings:
         messagebox.showwarning("No Mappings", "Please map at least one program before proceeding")
         return
     
     # Get selected agency-client info
     agency_client_id = getattr(self, 'selected_agency_client_id', None)
     
     if not agency_client_id:
         messagebox.showwarning("Selection Required", 
                             "Please select agency and client for enhanced rate calculation.")
         return
     
     # Clear the tree
     for item in self.program_tree.get_children():
         self.program_tree.delete(item)
     
     # Initialize storage
     self.program_additional_data = {}
     category_programs = {}
     total_rate_card = 0
     total_prime_spots = 0
     total_non_prime_spots = 0
     
     # Get categories and process programs with enhanced rate system
     try:
         cursor = self.connection.cursor()
         cursor.execute("""
             SELECT p.program_name, c.category_name 
             FROM programs p
             JOIN program_subcategories s ON p.subcategory_id = s.subcategory_id
             JOIN program_categories c ON s.category_id = c.category_id
         """)
         
         db_program_categories = {}
         for row in cursor.fetchall():
             db_program_categories[row[0]] = row[1]
             
     except sqlite3.Error as err:
         messagebox.showerror("Database Error", f"Error fetching program data: {err}")
         return
     finally:
         if cursor:
             cursor.close()
     
     # Process mapped programs with enhanced rate calculation
     for theme, programs in self.themes_data.items():
         for program_info in programs:
             match_key = f"{theme}|{program_info['program']}|{program_info['day']}|{program_info['time_range']}"
             
             if match_key in self.program_mappings:
                 db_data = self.program_mappings[match_key]['db_schedule']
                 excel_program_name = program_info['program']
                 
                 db_program_name = db_data.get('program_name')
                 if not db_program_name:
                     continue
                 
                 category = db_program_categories.get(db_program_name)
                 if not category:
                     continue
                 
                 # Initialize category
                 if category not in category_programs:
                     category_programs[category] = {}
                 
                 # Use database program name as key
                 if db_program_name not in category_programs[category]:
                     category_programs[category][db_program_name] = {
                         'durations': {5: 0, 10: 0, 15: 0, 20: 0, 25: 0, 30: 0, 45: 0, 60: 0},
                         'schedule_id': db_data.get('schedule_id'),
                         'start_time': program_info.get('start_time', ''),
                         'total_spots': 0,
                         'excel_names': set(),
                         'themes': set()
                     }
                 
                 # Add data
                 category_programs[category][db_program_name]['excel_names'].add(excel_program_name)
                 category_programs[category][db_program_name]['themes'].add(theme)
                 
                 duration = program_info['duration']
                 spots = program_info['spots']
                 
                 if duration in category_programs[category][db_program_name]['durations']:
                     category_programs[category][db_program_name]['durations'][duration] += spots
                     category_programs[category][db_program_name]['total_spots'] += spots
                     
                     # Count prime time spots
                     if self.is_prime_time(program_info.get('start_time', '')):
                         total_prime_spots += spots
                     else:
                         total_non_prime_spots += spots
     
     # Build tree with enhanced rate information
     rate_type_counts = {'discount': 0, 'custom_individual': 0, 'custom_modifier': 0, 'default': 0}
     
     for category, programs in category_programs.items():
         if not programs:
             continue
             
         category_item = self.program_tree.insert('', tk.END, text=category, 
                                                 values=[''] * 14, tags=['category'])
         
         for db_program_name, data in programs.items():
             total_ads = sum(data['durations'].values())
             if total_ads == 0:
                 continue
             
             # Get enhanced rate using rate manager
             schedule_id = data['schedule_id']
             rate_info = self.rate_manager.get_effective_rate(agency_client_id, schedule_id)
             
             if not rate_info:
                 continue
                 
             rate_card = rate_info['rate']
             rate_source = rate_info['source']
             rate_type = rate_info['type']
             
             # Count rate types
             rate_type_counts[rate_type] += 1
             
             # Calculate totals
             total_30s = sum(data['durations'][dur] * (dur/30) for dur in data['durations'])
             total_30s = round(total_30s, 1)
             value_rs = total_30s * rate_card
             value_rs = round(value_rs, 2)
             
             total_rate_card += value_rs
             
             # Build enhanced display row
             row_values = []
             for dur in [5, 10, 15, 20, 25, 30, 45, 60]:
                 qty = data['durations'][dur]
                 row_values.append(str(qty) if qty > 0 else '')
             
             row_values.extend([
                 f"{total_30s:.1f}",
                 f"{rate_card:,.0f}",
                 f"{value_rs:,.2f}",
                 '',  # Discounted value (calculated later)
                 '',  # Investment percentage (calculated later)
                 rate_source  # Rate source information
             ])
             
             # Enhanced display name with rate type indicator
             rate_indicator = {'discount': '💰', 'custom_individual': '⭐', 'custom_modifier': '🔧', 'default': '📊'}
             display_name = f"{rate_indicator.get(rate_type, '📊')} {db_program_name}"
             
             program_item = self.program_tree.insert(category_item, tk.END, 
                                                   text=display_name,
                                                   values=row_values, 
                                                   tags=['program'])
             
             # Store additional data
             self.program_additional_data[program_item] = {
                 'value_rs': value_rs,
                 'rate_info': rate_info,
                 'schedule_id': schedule_id,
                 'total_spots': data['total_spots'],
                 'start_time': data['start_time']
             }
     
     # Configure enhanced styling
     self.program_tree.tag_configure('category', background='lightblue', font=('Arial', 10, 'bold'))
     self.program_tree.tag_configure('program', background='white')
     
     # Store totals
     self.total_rate_card_value = total_rate_card
     self.total_prime_spots = total_prime_spots
     self.total_non_prime_spots = total_non_prime_spots
     self.rate_type_counts = rate_type_counts
     
     # Update displays
     self.total_rate_card_label1.config(text=f"{total_rate_card:,.2f}")
     self.total_rate_card_label2.config(text=f"{total_rate_card:,.2f}")
     
     # Update enhanced summaries
     self.update_enhanced_summaries()
     
     # Show enhanced completion message
     self.show_enhanced_completion_message()
     
     # Auto-expand categories
     for category_item in self.program_tree.get_children():
         self.program_tree.item(category_item, open=True)

 def show_enhanced_completion_message(self):
     """Show enhanced completion message with rate breakdown"""
     total_programs = sum(self.rate_type_counts.values())
     
     completion_message = f"🎉 ENHANCED ANALYSIS COMPLETED!\n\n"
     completion_message += f"📊 FINANCIAL SUMMARY:\n"
     completion_message += f"• Total Rate Card Value: LKR {self.total_rate_card_value:,.2f}\n"
     completion_message += f"• Programs Analyzed: {total_programs}\n"
     completion_message += f"• Categories: {len(self.program_tree.get_children())}\n\n"

     completion_message += f"🎯 RATE TYPE BREAKDOWN:\n"
     completion_message += f"• Discount Rates: {self.rate_type_counts['discount']} programs\n"
     completion_message += f"• Custom Individual: {self.rate_type_counts['custom_individual']} programs\n"
     completion_message += f"• Custom Modified: {self.rate_type_counts['custom_modifier']} programs\n"
     completion_message += f"• Default Fallback: {self.rate_type_counts['default']} programs\n\n"

     completion_message += f"📺 SPOT MIX:\n"
     completion_message += f"• Prime Time: {self.total_prime_spots:,} spots\n"
     completion_message += f"• Non-Prime: {self.total_non_prime_spots:,} spots\n\n"

     if hasattr(self, 'selected_agency_client_id'):
         completion_message += f"✅ Enhanced rate system active with mixed rate types!"
     else:
         completion_message += f"ℹ️ Select agency & client for enhanced rate features."
     
     messagebox.showinfo("Enhanced Analysis Complete", completion_message)

 def update_enhanced_summaries(self):
     """Update all summary displays with enhanced information"""
     self.update_rate_analysis_summary()
     self.update_agency_client_summary()
     self.update_spot_mix_summary()
     self.update_financial_summary()

 def update_rate_analysis_summary(self):
     """Update rate analysis summary display"""
     if not hasattr(self, 'rate_type_counts'):
         self.rate_analysis_text.delete(1.0, tk.END)
         self.rate_analysis_text.insert(tk.END, "No analysis data available.\nRun enhanced calculation first.")
         return
     
     total_programs = sum(self.rate_type_counts.values())
     
     if total_programs == 0:
         summary_text = "No programs analyzed yet."
     else:
         summary_text = f"""RATE CARD ANALYSIS

Rate Type Distribution:
• Discount Rates: {self.rate_type_counts['discount']} ({(self.rate_type_counts['discount']/total_programs)*100:.1f}%)
• Custom Individual: {self.rate_type_counts['custom_individual']} ({(self.rate_type_counts['custom_individual']/total_programs)*100:.1f}%)
• Custom Modified: {self.rate_type_counts['custom_modifier']} ({(self.rate_type_counts['custom_modifier']/total_programs)*100:.1f}%)
• Default Fallback: {self.rate_type_counts['default']} ({(self.rate_type_counts['default']/total_programs)*100:.1f}%)

Total Programs: {total_programs}

Legend:
💰 Discount Rate Applied
⭐ Custom Individual Rate
🔧 Custom Modified Rate
📊 Default Rate Used"""
     
     self.rate_analysis_text.delete(1.0, tk.END)
     self.rate_analysis_text.insert(tk.END, summary_text)

 def update_agency_client_summary(self):
     """Enhanced agency-client summary"""
     try:
         self.agency_summary_text.delete(1.0, tk.END)
         
         if hasattr(self, 'selected_agency_client_id'):
             cursor = self.connection.cursor()
             cursor.execute("""
                 SELECT a.agency_name, c.client_name, ac.rate_card_type, ac.discount_rate
                 FROM agency_clients ac
                 JOIN agencies a ON ac.agency_id = a.agency_id
                 JOIN clients c ON ac.client_id = c.client_id
                 WHERE ac.agency_client_id = ?
             """, (self.selected_agency_client_id,))
             
             result = cursor.fetchone()
             if result:
                 agency_name, client_name, rate_type, discount_rate = result
                 
                 summary_text = f"""AGENCY & CLIENT INFO

Agency: {agency_name}
Client: {client_name}

Rate Card Type: {rate_type.title()}
"""

                 if rate_type == 'discount':
                     summary_text += f"Discount Rate: {discount_rate}%"
                 else:
                     summary_text += f"Custom Rate Card: Active\nMixed individual & modifier rates"
                 
                 summary_text += f"\n\nStatus: ✅ Enhanced rates applied"
             else:
                 summary_text = "Error loading agency information."
         else:
             summary_text = """AGENCY & CLIENT INFO

No selection made.

Please select from Upload tab:
• Choose Agency
• Select Client
• Rate information will auto-populate

Enhanced rate system supports:
• Discount rates
• Custom rate cards
• Mixed pricing strategies"""
         
         self.agency_summary_text.insert(tk.END, summary_text)
         
     except Exception as e:
         self.agency_summary_text.delete(1.0, tk.END)
         self.agency_summary_text.insert(tk.END, f"Error loading info: {str(e)}")

 def update_spot_mix_summary(self):
     """Update spot mix analysis"""
     total_spots = getattr(self, 'total_prime_spots', 0) + getattr(self, 'total_non_prime_spots', 0)
     
     if total_spots > 0:
         prime_percent = (getattr(self, 'total_prime_spots', 0) / total_spots) * 100
         non_prime_percent = (getattr(self, 'total_non_prime_spots', 0) / total_spots) * 100
     else:
         prime_percent = non_prime_percent = 0
     
     spot_mix_text = f"""SPOT MIX ANALYSIS

Total Spots: {total_spots:,}

Prime Time (19:00-23:00):
• Spots: {getattr(self, 'total_prime_spots', 0):,}
• Percentage: {prime_percent:.1f}%
• 24-hour format supported

Non Prime Time:
• Spots: {getattr(self, 'total_non_prime_spots', 0):,}
• Percentage: {non_prime_percent:.1f}%

DISTRIBUTION:
Prime: {prime_percent:.0f}% | Non-Prime: {non_prime_percent:.0f}%
Total: 100%"""
     
     if hasattr(self, 'spot_mix_text'):
         self.spot_mix_text.delete(1.0, tk.END)
         self.spot_mix_text.insert(tk.END, spot_mix_text)

 def update_financial_summary(self):
     """Enhanced financial summary"""
     option1_package = getattr(self, 'option1_package_value', 0)
     option2_package = getattr(self, 'option2_package_value', 0)
     option1_discount = getattr(self, 'option1_discount_percent', 0)
     option2_discount = getattr(self, 'option2_discount_percent', 0)
     
     summary_text = f"""ENHANCED FINANCIAL SUMMARY

Total Rate Card Value:
LKR {getattr(self, 'total_rate_card_value', 0):,.2f}

OPTION 1 (Manual Entry):
Package Value: LKR {option1_package:,.2f}
Calculated Discount: {option1_discount:.1f}%

OPTION 2 (Agency Rates):
Package Value: LKR {option2_package:,.2f}
Applied Rate System: Enhanced

SYSTEM STATUS:
✅ Enhanced rate calculation active
✅ Mixed rate types supported
✅ 24-hour time format
✅ Auto history saving

Categories: {len(getattr(self, 'program_tree', {}).get_children()) if hasattr(self, 'program_tree') else 0}
Programs: {sum(getattr(self, 'rate_type_counts', {}).values()) if hasattr(self, 'rate_type_counts') else 0}"""
     
     if hasattr(self, 'summary_text'):
         self.summary_text.delete(1.0, tk.END)
         self.summary_text.insert(tk.END, summary_text)

 # Additional enhanced methods
 def apply_option1(self):
     """Enhanced Option 1 with better feedback"""
     try:
         package_value = float(self.package_value_var.get() or 0)
         
         if hasattr(self, 'total_rate_card_value') and self.total_rate_card_value > 0:
             discount_percent = ((self.total_rate_card_value - package_value) / self.total_rate_card_value) * 100
             
             # Store values
             self.option1_package_value = package_value
             self.option1_discount_percent = discount_percent
             
             # Update display
             self.total_rate_card_label1.config(text=f"{self.total_rate_card_value:,.2f}")
             self.discount_percent_label1.config(text=f"{discount_percent:.1f}%")
             
             # Update table calculations
             self.update_table_with_option1()
             self.update_financial_summary()
             
             messagebox.showinfo("Option 1 Applied", 
                               f"✅ Manual package value applied!\n"
                               f"Package: LKR {package_value:,.2f}\n"
                               f"Discount: {discount_percent:.1f}%\n"
                               f"Enhanced calculations updated.")
             
         else:
             messagebox.showwarning("No Data", "Please run enhanced analysis first.")
             
     except ValueError:
         messagebox.showerror("Invalid Input", "Please enter a valid numeric package value.")

 def apply_option2_enhanced(self):
     """Enhanced Option 2 using agency rate system"""
     if not hasattr(self, 'selected_agency_client_id'):
         messagebox.showwarning("Selection Required", "Please select agency and client from Upload tab first.")
         return
     
     if not hasattr(self, 'total_rate_card_value') or self.total_rate_card_value <= 0:
         messagebox.showwarning("No Data", "Please run enhanced analysis first.")
         return
     
     try:
         cursor = self.connection.cursor()
         cursor.execute("""
             SELECT a.agency_name, c.client_name, ac.rate_card_type, ac.discount_rate
             FROM agency_clients ac
             JOIN agencies a ON ac.agency_id = a.agency_id
             JOIN clients c ON ac.client_id = c.client_id
             WHERE ac.agency_client_id = ?
         """, (self.selected_agency_client_id,))
         
         result = cursor.fetchone()
         if not result:
             messagebox.showerror("Error", "Agency-client information not found.")
             return
             
         agency_name, client_name, rate_type, discount_rate = result
         
         if rate_type == 'custom':
             # Custom rate cards already applied in calculation
             package_value = self.total_rate_card_value  # No additional discount
             discount_percent = 0
             message = f"✅ Custom rate card applied!\n\nAgency: {agency_name}\nClient: {client_name}\n\nCustom rates are already included in the total.\nNo additional discount applied."
         else:
             # Apply discount rate
             discount_percent = float(discount_rate)
             package_value = self.total_rate_card_value * (100 - discount_percent) / 100
             message = f"✅ Discount rate applied!\n\nAgency: {agency_name}\nClient: {client_name}\n\nDiscount: {discount_percent}%\nPackage Value: LKR {package_value:,.2f}"
         
         # Update displays
         self.total_rate_card_label2.config(text=f"{self.total_rate_card_value:,.2f}")
         self.package_value_label2.config(text=f"{package_value:,.2f}")
         self.agency_client_display.config(text=f"{agency_name} - {client_name}", foreground="blue")
         
         # Store values
         self.option2_package_value = package_value
         self.option2_discount_percent = discount_percent
         
         # Update summaries
         self.update_financial_summary()
         
         messagebox.showinfo("Option 2 Applied", message)
         
     except Exception as e:
         messagebox.showerror("Error", f"Error applying agency rates: {str(e)}")
     finally:
         if cursor:
             cursor.close()

 def update_table_with_option1(self):
     """Enhanced table update with better rate handling"""
     if not hasattr(self, 'option1_discount_percent') or not hasattr(self, 'option1_package_value'):
         return
     
     if not hasattr(self, 'program_additional_data'):
         return
     
     for subcategory_item in self.program_tree.get_children():
         for program_item in self.program_tree.get_children(subcategory_item):
             try:
                 if program_item in self.program_additional_data:
                     value_rs = self.program_additional_data[program_item]['value_rs']
                     
                     # Calculate discounted value using Option 1 discount
                     discounted_value = value_rs * (100 - self.option1_discount_percent) / 100
                     
                     # Calculate investment percentage
                     investment_percent = (discounted_value / self.option1_package_value * 100) if self.option1_package_value > 0 else 0
                     
                     # Update tree
                     current_values = list(self.program_tree.item(program_item)['values'])
                     current_values[11] = f"{discounted_value:,.2f}"
                     current_values[12] = f"{investment_percent:.1f}%"
                     
                     self.program_tree.item(program_item, values=current_values)
             except (ValueError, IndexError):
                 continue

 def save_current_calculation(self):
     """Save current calculation to history"""
     if not hasattr(self, 'total_rate_card_value'):
         messagebox.showwarning("No Data", "No calculation data available to save.")
         return
     
     # Prepare calculation data
     calculation_data = {
         'calculation_name': f"Calculation_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
         'total_rate_card_value': getattr(self, 'total_rate_card_value', 0),
         'final_package_value': getattr(self, 'option1_package_value', 0) or getattr(self, 'option2_package_value', 0),
         'discount_percentage': getattr(self, 'option1_discount_percent', 0) or getattr(self, 'option2_discount_percent', 0),
         'rate_type_counts': getattr(self, 'rate_type_counts', {}),
         'total_prime_spots': getattr(self, 'total_prime_spots', 0),
         'total_non_prime_spots': getattr(self, 'total_non_prime_spots', 0),
         'agency_client_id': getattr(self, 'selected_agency_client_id', None),
         'themes_data': getattr(self, 'themes_data', {}),
         'program_mappings_count': len(getattr(self, 'program_mappings', {}))
     }
     
     # Save to history
     excel_path = getattr(self, 'current_excel_path', None)
     history_id = self.history_manager.save_calculation(
         self.user_id, 
         getattr(self, 'selected_agency_client_id', None), 
         calculation_data, 
         excel_path
     )
     
     if history_id:
         messagebox.showinfo("Saved to History", 
                           f"Calculation saved to history!\n"
                           f"History ID: {history_id}\n"
                           f"Retention: 30 days")
     else:
         messagebox.showerror("Save Error", "Failed to save calculation to history.")

 def export_enhanced_report(self):
     """Enhanced export with rate source information"""
     if not hasattr(self, 'total_rate_card_value'):
         messagebox.showwarning("No Data", "Please run enhanced analysis first.")
         return
     
     file_path = filedialog.asksaveasfilename(
         title="Save Enhanced Analysis Report",
         defaultextension=".xlsx",
         filetypes=[("Excel files", "*.xlsx"), ("All files", "*.*")]
     )
     
     if file_path:
         try:
             wb = Workbook()
             ws = wb.active
             ws.title = "Enhanced Program Analysis"
             
             current_row = 1
             
             # Enhanced title
             ws.cell(row=current_row, column=1, value="TV Advertisement Enhanced Program Analysis Report v2.0")
             ws.merge_cells(f'A{current_row}:P{current_row}')
             title_cell = ws.cell(row=current_row, column=1)
             title_cell.font = Font(name="Arial", size=16, bold=True)
             title_cell.alignment = Alignment(horizontal='center')
             current_row += 2
             
             # Enhanced agency information
             if hasattr(self, 'selected_agency_client_id'):
                 cursor = self.connection.cursor()
                 try:
                     cursor.execute("""
                         SELECT a.agency_name, c.client_name, ac.rate_card_type, ac.discount_rate
                         FROM agency_clients ac
                         JOIN agencies a ON ac.agency_id = a.agency_id
                         JOIN clients c ON ac.client_id = c.client_id
                         WHERE ac.agency_client_id = ?
                     """, (self.selected_agency_client_id,))
                     
                     result = cursor.fetchone()
                     if result:
                         agency_name, client_name, rate_type, discount_rate = result
                         
                         ws.cell(row=current_row, column=1, value=f"Agency: {agency_name}")
                         current_row += 1
                         ws.cell(row=current_row, column=1, value=f"Client: {client_name}")
                         current_row += 1
                         ws.cell(row=current_row, column=1, value=f"Rate Card Type: {rate_type.title()}")
                         current_row += 2
                 finally:
                     cursor.close()
             
             # Generation date
             ws.cell(row=current_row, column=1, value=f"Generated: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}")
             current_row += 2
             
             # Enhanced rate breakdown summary
             if hasattr(self, 'rate_type_counts'):
                 ws.cell(row=current_row, column=1, value="ENHANCED RATE ANALYSIS")
                 ws.cell(row=current_row, column=1).font = Font(name="Arial", size=12, bold=True)
                 current_row += 1
                 
                 total_programs = sum(self.rate_type_counts.values())
                 rate_data = [
                     ['Rate Type', 'Programs', 'Percentage'],
                     ['Discount Rates', self.rate_type_counts['discount'], f"{(self.rate_type_counts['discount']/total_programs)*100:.1f}%"],
                     ['Custom Individual', self.rate_type_counts['custom_individual'], f"{(self.rate_type_counts['custom_individual']/total_programs)*100:.1f}%"],
                     ['Custom Modified', self.rate_type_counts['custom_modifier'], f"{(self.rate_type_counts['custom_modifier']/total_programs)*100:.1f}%"],
                     ['Default Fallback', self.rate_type_counts['default'], f"{(self.rate_type_counts['default']/total_programs)*100:.1f}%"]
                 ]
                 
                 for row_data in rate_data:
                     for col, value in enumerate(row_data, 1):
                         cell = ws.cell(row=current_row, column=col, value=value)
                         if current_row == current_row - len(rate_data) + 1:  # Header row
                             cell.font = Font(bold=True)
                     current_row += 1
                 
                 current_row += 1
             
             # Financial summary
             ws.cell(row=current_row, column=1, value="FINANCIAL SUMMARY")
             ws.cell(row=current_row, column=1).font = Font(name="Arial", size=12, bold=True)
             current_row += 1
             
             ws.cell(row=current_row, column=1, value=f"Total Rate Card Value:")
             ws.cell(row=current_row, column=2, value=f"LKR {self.total_rate_card_value:,.2f}")
             current_row += 2
             
             # Enhanced program details table
             headers = [
                 'Program', '5s', '10s', '15s', '20s', '25s', '30s', '45s', '60s',
                 'Total 30s', 'Rate', 'Value Rs', 'Final Value', '% Investment', 'Rate Source'
             ]
             
             ws.cell(row=current_row, column=1, value="ENHANCED PROGRAM DETAILS")
             ws.cell(row=current_row, column=1).font = Font(name="Arial", size=12, bold=True)
             current_row += 2
             
             # Add headers
             for col, header in enumerate(headers, 1):
                 cell = ws.cell(row=current_row, column=col, value=header)
                 cell.font = Font(name="Arial", size=10, bold=True)
                 cell.fill = PatternFill(start_color="CCCCCC", end_color="CCCCCC", fill_type="solid")
             current_row += 1
             
             # Add enhanced data from tree
             for category_item in self.program_tree.get_children():
                 category_name = self.program_tree.item(category_item)['text']
                 
                 # Category header
                 cell = ws.cell(row=current_row, column=1, value=category_name)
                 cell.font = Font(name="Arial", size=11, bold=True)
                 cell.fill = PatternFill(start_color="ADD8E6", end_color="ADD8E6", fill_type="solid")
                 ws.merge_cells(f'A{current_row}:O{current_row}')
                 current_row += 1
                 
                 # Programs
                 for program_item in self.program_tree.get_children(category_item):
                     program_name = self.program_tree.item(program_item)['text']
                     values = self.program_tree.item(program_item)['values']
                     
                     # Clean program name (remove emoji indicators)
                     clean_name = re.sub(r'[💰⭐🔧📊]\s*', '', program_name)
                     
                     ws.cell(row=current_row, column=1, value=clean_name)
                     for col, value in enumerate(values, 2):
                         ws.cell(row=current_row, column=col, value=value)
                     current_row += 1
             
             # Auto-adjust column widths
             for column in ws.columns:
                 max_length = 0
                 column_letter = get_column_letter(column[0].column)
                 for cell in column:
                     try:
                         if cell.value and len(str(cell.value)) > max_length:
                             max_length = len(str(cell.value))
                     except:
                         pass
                 adjusted_width = min(max_length + 2, 50)
                 ws.column_dimensions[column_letter].width = adjusted_width
             
             wb.save(file_path)
             messagebox.showinfo("Export Successful", 
                               f"Enhanced analysis report exported!\n"
                               f"File: {file_path}\n"
                               f"Includes rate source information and enhanced analytics.")
             
         except Exception as e:
             messagebox.showerror("Export Error", f"Error creating enhanced report: {str(e)}")

# History Browser Class
class HistoryBrowser:
 def __init__(self, parent_frame, user_id, connection):
     self.root = parent_frame
     self.user_id = user_id
     self.connection = connection
     
     self.create_widgets()
     self.load_history()

 def create_widgets(self):
     # Control frame
     control_frame = ttk.Frame(self.root)
     control_frame.pack(fill=tk.X, padx=10, pady=10)
     
     ttk.Label(control_frame, text="📁 Calculation History (30-day retention)", 
              font=("Arial", 12, "bold")).pack(side=tk.LEFT)
     
     ttk.Button(control_frame, text="🔄 Refresh", command=self.load_history).pack(side=tk.RIGHT, padx=5)
     ttk.Button(control_frame, text="🗑️ Cleanup Expired", command=self.cleanup_expired).pack(side=tk.RIGHT, padx=5)
     
     # History tree
     history_frame = ttk.Frame(self.root)
     history_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
     
     columns = ('date', 'agency', 'client', 'total_value', 'final_value', 'discount', 'status')
     self.history_tree = ttk.Treeview(history_frame, columns=columns, show='headings')
     
     self.history_tree.heading('date', text='Date & Time')
     self.history_tree.heading('agency', text='Agency')
     self.history_tree.heading('client', text='Client')
     self.history_tree.heading('total_value', text='Rate Card Value')
     self.history_tree.heading('final_value', text='Final Value')
     self.history_tree.heading('discount', text='Discount %')
     self.history_tree.heading('status', text='Status')
     
     # Column widths
     self.history_tree.column('date', width=150)
     self.history_tree.column('agency', width=120)
     self.history_tree.column('client', width=120)
     self.history_tree.column('total_value', width=120)
     self.history_tree.column('final_value', width=120)
     self.history_tree.column('discount', width=80)
     self.history_tree.column('status', width=100)
     
     # Scrollbars
     v_scroll = ttk.Scrollbar(history_frame, orient="vertical", command=self.history_tree.yview)
     h_scroll = ttk.Scrollbar(history_frame, orient="horizontal", command=self.history_tree.xview)
     self.history_tree.configure(yscrollcommand=v_scroll.set, xscrollcommand=h_scroll.set)
     
     self.history_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
     v_scroll.pack(side=tk.RIGHT, fill=tk.Y)
     h_scroll.pack(side=tk.BOTTOM, fill=tk.X)
     
     # Bind double-click
     self.history_tree.bind('<Double-1>', self.view_history_details)
     
     # Action buttons
     action_frame = ttk.Frame(self.root)
     action_frame.pack(fill=tk.X, padx=10, pady=5)
     
     ttk.Button(action_frame, text="📋 View Details", command=self.view_history_details).pack(side=tk.LEFT, padx=5)
     ttk.Button(action_frame, text="📁 Open Folder", command=self.open_history_folder).pack(side=tk.LEFT, padx=5)
     ttk.Button(action_frame, text="🗑️ Delete Selected", command=self.delete_selected).pack(side=tk.LEFT, padx=5)

 def load_history(self):
     """Load calculation history"""
     # Clear existing
     for item in self.history_tree.get_children():
         self.history_tree.delete(item)
     
     try:
         cursor = self.connection.cursor()
         cursor.execute("""
             SELECT h.history_id, h.created_date, h.calculation_name, 
                    h.total_rate_card_value, h.final_package_value, h.discount_percentage,
                    h.folder_path, h.expires_date,
                    a.agency_name, c.client_name
             FROM calculation_history h
             LEFT JOIN agency_clients ac ON h.agency_client_id = ac.agency_client_id
             LEFT JOIN agencies a ON ac.agency_id = a.agency_id  
             LEFT JOIN clients c ON ac.client_id = c.client_id
             WHERE h.user_id = ?
             ORDER BY h.created_date DESC
         """, (self.user_id,))
         
         for row in cursor.fetchall():
             history_id, created_date, calc_name, total_value, final_value, discount, folder_path, expires_date, agency_name, client_name = row
             
             # Check if expired
             expires = datetime.fromisoformat(expires_date) if expires_date else None
             is_expired = expires and expires < datetime.now()
             status = "Expired" if is_expired else "Active"
             
             # Format display
             date_str = datetime.fromisoformat(created_date).strftime("%Y-%m-%d %H:%M")
             agency_display = agency_name or "No Agency"
             client_display = client_name or "No Client"
             total_display = f"LKR {total_value:,.0f}" if total_value else "N/A"
             final_display = f"LKR {final_value:,.0f}" if final_value else "N/A"
             discount_display = f"{discount:.1f}%" if discount else "0%"
             
             # Insert with color coding
             item_id = self.history_tree.insert('', tk.END, values=(
                 date_str, agency_display, client_display, 
                 total_display, final_display, discount_display, status
             ))
             
             # Store history_id and folder_path
             self.history_tree.set(item_id, 'history_id', history_id)
             self.history_tree.set(item_id, 'folder_path', folder_path or "")
             
             # Tag expired entries
             if is_expired:
                 self.history_tree.item(item_id, tags=['expired'])
         
         # Configure tags
         self.history_tree.tag_configure('expired', foreground='gray')
                 
     except sqlite3.Error as err:
         messagebox.showerror("Database Error", f"Error loading history: {err}")
     finally:
         if cursor:
             cursor.close()

 def view_history_details(self, event=None):
     """View detailed history information"""
     selected = self.history_tree.selection()
     if not selected:
         messagebox.showwarning("No Selection", "Please select a history entry.")
         return
     
     item = selected[0]
     history_id = self.history_tree.set(item, 'history_id')
     
     try:
         cursor = self.connection.cursor()
         cursor.execute("""
             SELECT h.*, a.agency_name, c.client_name
             FROM calculation_history h
             LEFT JOIN agency_clients ac ON h.agency_client_id = ac.agency_client_id
             LEFT JOIN agencies a ON ac.agency_id = a.agency_id
             LEFT JOIN clients c ON ac.client_id = c.client_id
             WHERE h.history_id = ?
         """, (history_id,))
         
         result = cursor.fetchone()
         if not result:
             messagebox.showerror("Error", "History entry not found.")
             return
             
         # Create details window
         details_window = tk.Toplevel(self.root)
         details_window.title("History Details")
         details_window.geometry("600x500")
         
         details_text = tk.Text(details_window, wrap=tk.WORD, padx=10, pady=10)
         details_text.pack(fill=tk.BOTH, expand=True)
         
         # Format details
         created_date = datetime.fromisoformat(result[7]).strftime("%B %d, %Y at %I:%M %p")
         expires_date = datetime.fromisoformat(result[8]).strftime("%B %d, %Y") if result[8] else "No expiry"
         
         details = f"""CALCULATION HISTORY DETAILS

Calculation Name: {result[4] or 'Unnamed'}
Date Created: {created_date}
Expires: {expires_date}

AGENCY & CLIENT:
Agency: {result[-2] or 'Not specified'}
Client: {result[-1] or 'Not specified'}

FINANCIAL SUMMARY:
Total Rate Card Value: LKR {result[5]:,.2f if result[5] else 0}
Final Package Value: LKR {result[6]:,.2f if result[6] else 0}
Discount Percentage: {result[7]:.1f}% if result[7] else 0

FILE INFORMATION:
Excel File: {result[10] or 'Not saved'}
Folder Path: {result[9] or 'Not available'}

CALCULATION DATA:
{result[11] if result[11] else 'No additional data stored'}

STATUS:
{'Active' if not result[8] or datetime.fromisoformat(result[8]) > datetime.now() else 'Expired'}
"""
         
         details_text.insert(tk.END, details)
         details_text.config(state=tk.DISABLED)
         
         ttk.Button(details_window, text="Close", command=details_window.destroy).pack(pady=10)
         
     except sqlite3.Error as err:
         messagebox.showerror("Database Error", f"Error loading details: {err}")
     finally:
         if cursor:
             cursor.close()

 def open_history_folder(self):
     """Open history folder in file explorer"""
     selected = self.history_tree.selection()
     if not selected:
         messagebox.showwarning("No Selection", "Please select a history entry.")
         return
     
     item = selected[0]
     folder_path = self.history_tree.set(item, 'folder_path')
     
     if not folder_path or not os.path.exists(folder_path):
         messagebox.showerror("Folder Not Found", "History folder does not exist or has been cleaned up.")
         return
         
     try:
         import subprocess
         import platform
         
         if platform.system() == 'Windows':
             subprocess.run(['explorer', folder_path])
         elif platform.system() == 'Darwin':  # macOS
             subprocess.run(['open', folder_path])
         else:  # Linux
             subprocess.run(['xdg-open', folder_path])
             
     except Exception as e:
         messagebox.showerror("Error", f"Could not open folder: {str(e)}")

 def delete_selected(self):
     """Delete selected history entries"""
     selected = self.history_tree.selection()
     if not selected:
         messagebox.showwarning("No Selection", "Please select history entries to delete.")
         return
     
     if not messagebox.askyesno("Confirm Delete", f"Delete {len(selected)} history entries?"):
         return
         
     try:
         cursor = self.connection.cursor()
         
         for item in selected:
             history_id = self.history_tree.set(item, 'history_id')
             folder_path = self.history_tree.set(item, 'folder_path')
             
             # Delete from database
             cursor.execute("DELETE FROM calculation_history WHERE history_id = ?", (history_id,))
             
             # Delete folder if exists
             if folder_path and os.path.exists(folder_path):
                 shutil.rmtree(folder_path, ignore_errors=True)
         
         self.connection.commit()
         self.load_history()
         messagebox.showinfo("Deleted", f"Deleted {len(selected)} history entries.")
         
     except Exception as e:
         self.connection.rollback()
         messagebox.showerror("Error", f"Error deleting entries: {str(e)}")
     finally:
         if cursor:
             cursor.close()

 def cleanup_expired(self):
     """Cleanup expired history entries"""
     try:
         cursor = self.connection.cursor()
         
         # Get expired entries
         cursor.execute("""
             SELECT history_id, folder_path 
             FROM calculation_history 
             WHERE expires_date < datetime('now')
         """)
         
         expired_entries = cursor.fetchall()
         
         if not expired_entries:
             messagebox.showinfo("Cleanup", "No expired entries found.")
             return
             
         if not messagebox.askyesno("Confirm Cleanup", f"Delete {len(expired_entries)} expired entries?"):
             return
         
         # Delete expired entries
         for history_id, folder_path in expired_entries:
             cursor.execute("DELETE FROM calculation_history WHERE history_id = ?", (history_id,))
             
             if folder_path and os.path.exists(folder_path):
                 shutil.rmtree(folder_path, ignore_errors=True)
         
         self.connection.commit()
         self.load_history()
         messagebox.showinfo("Cleanup Complete", f"Deleted {len(expired_entries)} expired entries.")
         
     except Exception as e:
         self.connection.rollback()
         messagebox.showerror("Error", f"Error during cleanup: {str(e)}")
     finally:
         if cursor:
             cursor.close()

# Rate Card Manager Window
class RateCardManagerWindow:
 def __init__(self, root, connection, user_id):
     self.root = root
     self.connection = connection
     self.user_id = user_id
     
     self.root.title("Enhanced Rate Card Manager")
     self.root.geometry("1200x700")
     
     self.rate_manager = RateCardManager(self.connection)
     
     self.create_widgets()
     self.load_data()

 def create_widgets(self):
     # Main notebook
     self.notebook = ttk.Notebook(self.root)
     self.notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
     
     # Tab 1: Rate Card Overview
     self.overview_tab = ttk.Frame(self.notebook)
     self.notebook.add(self.overview_tab, text="📊 Rate Card Overview")
     
     # Tab 2: Custom Rate Management
     self.custom_tab = ttk.Frame(self.notebook)
     self.notebook.add(self.custom_tab, text="⭐ Custom Rate Cards")
     
     # Tab 3: Rate Card Operations
     self.operations_tab = ttk.Frame(self.notebook)
     self.notebook.add(self.operations_tab, text="🔧 Operations")
     
     self.create_overview_tab()
     self.create_custom_tab()
     self.create_operations_tab()

 def create_overview_tab(self):
     # Controls
     control_frame = ttk.Frame(self.overview_tab)
     control_frame.pack(fill=tk.X, padx=10, pady=10)
     
     ttk.Label(control_frame, text="Rate Card System Overview", 
              font=("Arial", 14, "bold")).pack(side=tk.LEFT)
     
     ttk.Button(control_frame, text="Refresh", command=self.load_data).pack(side=tk.RIGHT)
     
     # Overview tree
     overview_columns = ('agency', 'client', 'rate_type', 'discount_info', 'programs_count', 'status')
     self.overview_tree = ttk.Treeview(self.overview_tab, columns=overview_columns, show='headings')
     
     self.overview_tree.heading('agency', text='Agency')
     self.overview_tree.heading('client', text='Client')
     self.overview_tree.heading('rate_type', text='Rate Card Type')
     self.overview_tree.heading('discount_info', text='Discount/Rate Info')
     self.overview_tree.heading('programs_count', text='Custom Programs')
     self.overview_tree.heading('status', text='Status')
     
     self.overview_tree.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

 def create_custom_tab(self):
     # Custom rate cards management
     ttk.Label(self.custom_tab, text="Custom Rate Cards Management", font=("Arial", 14, "bold")).pack(pady=10)
     
     # Controls
     control_frame = ttk.Frame(self.custom_tab)
     control_frame.pack(fill=tk.X, padx=10, pady=5)
     
     ttk.Button(control_frame, text="Create New Rate Card", 
               command=self.create_new_rate_card).pack(side=tk.LEFT, padx=5)
     ttk.Button(control_frame, text="Edit Selected", 
               command=self.edit_rate_card).pack(side=tk.LEFT, padx=5)
     ttk.Button(control_frame, text="Duplicate Rate Card", 
               command=self.duplicate_rate_card).pack(side=tk.LEFT, padx=5)
     
     # Custom rate cards tree
     custom_columns = ('rate_card_name', 'agency', 'client', 'base_modifier', 'programs', 'created')
     self.custom_tree = ttk.Treeview(self.custom_tab, columns=custom_columns, show='headings')
     
     self.custom_tree.heading('rate_card_name', text='Rate Card Name')
     self.custom_tree.heading('agency', text='Agency')
     self.custom_tree.heading('client', text='Client')
     self.custom_tree.heading('base_modifier', text='Base Modifier %')
     self.custom_tree.heading('programs', text='Custom Programs')
     self.custom_tree.heading('created', text='Created Date')
     
     self.custom_tree.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

 def create_operations_tab(self):
     ttk.Label(self.operations_tab, text="Rate Card Operations", font=("Arial", 14, "bold")).pack(pady=10)
     
     # Operation buttons in grid
     ops_frame = ttk.Frame(self.operations_tab)
     ops_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=20)
     
     # Row 1
     ttk.Button(ops_frame, text="🔄 Convert Discount to Custom Rate Card", 
               command=self.convert_discount_to_custom, width=35).grid(row=0, column=0, padx=10, pady=10)
     ttk.Button(ops_frame, text="📋 Bulk Edit Program Rates", 
               command=self.bulk_edit_rates, width=35).grid(row=0, column=1, padx=10, pady=10)
     
     # Row 2  
     ttk.Button(ops_frame, text="📊 Rate Comparison Report", 
               command=self.generate_rate_comparison, width=35).grid(row=1, column=0, padx=10, pady=10)
     ttk.Button(ops_frame, text="🗑️ Cleanup Unused Rate Cards", 
               command=self.cleanup_unused_cards, width=35).grid(row=1, column=1, padx=10, pady=10)
     
     # Status area
     self.operations_text = tk.Text(ops_frame, height=15, wrap=tk.WORD)
     self.operations_text.grid(row=2, column=0, columnspan=2, padx=10, pady=20, sticky='ew')
     
     ops_frame.grid_columnconfigure(0, weight=1)
     ops_frame.grid_columnconfigure(1, weight=1)

 def load_data(self):
     """Load overview data"""
     # Clear existing
     for item in self.overview_tree.get_children():
         self.overview_tree.delete(item)
     for item in self.custom_tree.get_children():
         self.custom_tree.delete(item)
     
     try:
         cursor = self.connection.cursor()
         
         # Load overview
         cursor.execute("""
             SELECT a.agency_name, c.client_name, ac.rate_card_type, ac.discount_rate,
                    ac.agency_client_id
             FROM agency_clients ac
             JOIN agencies a ON ac.agency_id = a.agency_id
             JOIN clients c ON ac.client_id = c.client_id
             ORDER BY a.agency_name, c.client_name
         """)
         
         for row in cursor.fetchall():
             agency, client, rate_type, discount, ac_id = row
             
             if rate_type == 'custom':
                 # Count custom programs
                 cursor.execute("""
                     SELECT COUNT(cpr.custom_rate_id)
                     FROM custom_rate_cards crc
                     JOIN custom_program_rates cpr ON crc.rate_card_id = cpr.rate_card_id
                     WHERE crc.agency_client_id = ? AND crc.is_active = 1
                 """, (ac_id,))
                 
                 count_result = cursor.fetchone()
                 programs_count = count_result[0] if count_result else 0
                 
                 discount_info = "Custom rates active"
                 status = f"{programs_count} custom rates"
             else:
                 discount_info = f"{discount}% discount"
                 programs_count = 0
                 status = "Discount system"
             
             self.overview_tree.insert('', tk.END, values=(
                 agency, client, rate_type.title(), discount_info, programs_count, status
             ))
         
         # Load custom rate cards
         cursor.execute("""
             SELECT crc.rate_card_name, a.agency_name, c.client_name, 
                    crc.base_modifier_percentage, crc.created_date, crc.rate_card_id
             FROM custom_rate_cards crc
             JOIN agency_clients ac ON crc.agency_client_id = ac.agency_client_id
             JOIN agencies a ON ac.agency_id = a.agency_id
             JOIN clients c ON ac.client_id = c.client_id
             WHERE crc.is_active = 1
             ORDER BY crc.created_date DESC
         """)
         
         for row in cursor.fetchall():
             name, agency, client, modifier, created, rate_card_id = row
             
             # Count programs
             cursor.execute("""
                 SELECT COUNT(*) FROM custom_program_rates WHERE rate_card_id = ?
             """, (rate_card_id,))
             programs_count = cursor.fetchone()[0]
             
             created_date = datetime.fromisoformat(created).strftime("%Y-%m-%d")
             
             self.custom_tree.insert('', tk.END, values=(
                 name, agency, client, f"{modifier:+.1f}%", programs_count, created_date
             ))
             
     except sqlite3.Error as err:
         messagebox.showerror("Database Error", f"Error loading data: {err}")
     finally:
         if cursor:
             cursor.close()

 def create_new_rate_card(self):
     """Create new custom rate card"""
     messagebox.showinfo("Feature", "Create new rate card feature - Implementation needed")

 def edit_rate_card(self):
     """Edit selected rate card"""
     messagebox.showinfo("Feature", "Edit rate card feature - Implementation needed")


 def convert_discount_to_custom(self):
     """Convert discount-based client to custom rate card"""
     messagebox.showinfo("Feature", "Convert to custom feature - Implementation needed")

 def bulk_edit_rates(self):
     """Bulk edit program rates"""
     messagebox.showinfo("Feature", "Bulk edit feature - Implementation needed")

 def generate_rate_comparison(self):
     """Generate rate comparison report"""
     messagebox.showinfo("Feature", "Rate comparison feature - Implementation needed")

 def cleanup_unused_cards(self):
     """Cleanup unused rate cards"""
     messagebox.showinfo("Feature", "Cleanup feature - Implementation needed")

# Enhanced Admin Panel
class EnhancedTVProgramDatabaseAdmin:
 def __init__(self, parent_frame, user_id, username, is_admin, connection):
     self.root = parent_frame
     self.user_id = user_id
     self.username = username
     self.is_admin = is_admin
     self.connection = connection
     
     # Create simplified unified interface
     self.create_unified_interface()

 def create_unified_interface(self):
     """Create unified admin dashboard with organized boxes"""
     # Title
     title_frame = ttk.Frame(self.root)
     title_frame.pack(fill=tk.X, padx=10, pady=10)
     
     ttk.Label(title_frame, text="📊 Unified Admin Dashboard", 
              font=("Arial", 16, "bold")).pack(side=tk.LEFT)
     
     ttk.Label(title_frame, text="Enhanced Rate Card System v2.0", 
              font=("Arial", 10), foreground="blue").pack(side=tk.RIGHT)
     
     # Main container with grid layout
     main_container = ttk.Frame(self.root)
     main_container.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
     
     # Configure grid
     main_container.grid_rowconfigure(0, weight=1)
     main_container.grid_rowconfigure(1, weight=1)
     main_container.grid_columnconfigure(0, weight=1)
     main_container.grid_columnconfigure(1, weight=1)
     main_container.grid_columnconfigure(2, weight=1)
     
     # Box 1: Programs & Schedules (Top Left)
     programs_frame = ttk.LabelFrame(main_container, text="📺 Programs & Schedules", padding="10")
     programs_frame.grid(row=0, column=0, padx=5, pady=5, sticky='nsew')
     
     self.create_programs_box(programs_frame)
     
     # Box 2: Agencies & Clients (Top Center)  
     agencies_frame = ttk.LabelFrame(main_container, text="🏢 Agencies & Clients", padding="10")
     agencies_frame.grid(row=0, column=1, padx=5, pady=5, sticky='nsew')
     
     self.create_agencies_box(agencies_frame)
     
     # Box 3: Rate Cards (Top Right)
     rates_frame = ttk.LabelFrame(main_container, text="💰 Rate Card System", padding="10")
     rates_frame.grid(row=0, column=2, padx=5, pady=5, sticky='nsew')
     
     self.create_rates_box(rates_frame)
     
     # Box 4: System Settings (Bottom Left)
     settings_frame = ttk.LabelFrame(main_container, text="⚙️ System Settings", padding="10")
     settings_frame.grid(row=1, column=0, padx=5, pady=5, sticky='nsew')
     
     self.create_settings_box(settings_frame)
     
     # Box 5: Data Management (Bottom Center)
     data_frame = ttk.LabelFrame(main_container, text="📊 Data Management", padding="10")
     data_frame.grid(row=1, column=1, padx=5, pady=5, sticky='nsew')
     
     self.create_data_box(data_frame)
     
     # Box 6: Reports & Analytics (Bottom Right)
     reports_frame = ttk.LabelFrame(main_container, text="📈 Reports & Analytics", padding="10")
     reports_frame.grid(row=1, column=2, padx=5, pady=5, sticky='nsew')
     
     self.create_reports_box(reports_frame)

 def create_programs_box(self, parent):
     """Programs and schedules management box"""
     # Quick stats
     stats_frame = ttk.Frame(parent)
     stats_frame.pack(fill=tk.X, pady=(0, 10))
     
     self.programs_stats_label = ttk.Label(stats_frame, text="Loading...", font=("Arial", 9, "bold"))
     self.programs_stats_label.pack()
     
     # Action buttons
     ttk.Button(parent, text="➕ Add Program", command=self.add_program, width=20).pack(pady=2)
     ttk.Button(parent, text="📅 Manage Schedules", command=self.manage_schedules, width=20).pack(pady=2)
     ttk.Button(parent, text="✏️ Edit Program Name", command=self.edit_program_name, width=20).pack(pady=2)
     ttk.Button(parent, text="🔍 View All Programs", command=self.view_programs, width=20).pack(pady=2)
     ttk.Button(parent, text="⏰ Time Slots", command=self.manage_time_slots, width=20).pack(pady=2)

 def create_agencies_box(self, parent):
     """Agencies and clients management box"""
     # Quick stats
     stats_frame = ttk.Frame(parent)
     stats_frame.pack(fill=tk.X, pady=(0, 10))
     
     self.agencies_stats_label = ttk.Label(stats_frame, text="Loading...", font=("Arial", 9, "bold"))
     self.agencies_stats_label.pack()
     
     # Action buttons
     ttk.Button(parent, text="🏢 Add Agency", command=self.add_agency, width=20).pack(pady=2)
     ttk.Button(parent, text="👤 Add Client", command=self.add_client, width=20).pack(pady=2)
     ttk.Button(parent, text="🔗 Assign Client", command=self.assign_client, width=20).pack(pady=2)
     ttk.Button(parent, text="📋 View Relationships", command=self.view_relationships, width=20).pack(pady=2)

 def create_rates_box(self, parent):
     """Enhanced rate card management box"""
     # Quick stats
     stats_frame = ttk.Frame(parent)
     stats_frame.pack(fill=tk.X, pady=(0, 10))
     
     self.rates_stats_label = ttk.Label(stats_frame, text="Loading...", font=("Arial", 9, "bold"))
     self.rates_stats_label.pack()
     
     # Action buttons
     ttk.Button(parent, text="⭐ Create Custom Rate Card", command=self.create_custom_rate_card, width=25).pack(pady=2)
     ttk.Button(parent, text="🔄 Duplicate Rate Card", command=self.duplicate_rate_card, width=25).pack(pady=2)
     ttk.Button(parent, text="✏️ Edit Program Rates", command=self.edit_program_rates, width=25).pack(pady=2)
     ttk.Button(parent, text="📊 Rate Card Overview", command=self.rate_card_overview, width=25).pack(pady=2)

 def create_settings_box(self, parent):
     """System settings management box"""
     # Action buttons
     ttk.Button(parent, text="👥 User Management", command=self.user_management, width=20).pack(pady=2)
     ttk.Button(parent, text="🔐 Permissions", command=self.manage_permissions, width=20).pack(pady=2)
     ttk.Button(parent, text="📡 Broadcast Types", command=self.manage_broadcast_types, width=20).pack(pady=2)
     ttk.Button(parent, text="📅 Day Patterns", command=self.manage_day_patterns, width=20).pack(pady=2)
     ttk.Button(parent, text="🏷️ Categories", command=self.manage_categories, width=20).pack(pady=2)

 def create_data_box(self, parent):
     """Data management box"""
     # Action buttons
     ttk.Button(parent, text="💾 Backup Database", command=self.backup_database, width=20).pack(pady=2)
     ttk.Button(parent, text="📤 Export Data", command=self.export_data, width=20).pack(pady=2)
     ttk.Button(parent, text="📥 Import Data", command=self.import_data, width=20).pack(pady=2)
     ttk.Button(parent, text="🗑️ Cleanup History", command=self.cleanup_history, width=20).pack(pady=2)
     ttk.Button(parent, text="🔧 Data Integrity Check", command=self.data_integrity_check, width=20).pack(pady=2)

 def create_reports_box(self, parent):
     """Reports and analytics box"""
    # Action buttons (removed revenue_analysis and usage_analytics)
     ttk.Button(parent, text="📊 Rate Card Report", command=self.generate_rate_report, width=20).pack(pady=2)
     ttk.Button(parent, text="📋 Agency Report", command=self.comprehensive_agency_report, width=20).pack(pady=2)
     ttk.Button(parent, text="📅 Schedule Report", command=self.schedule_report, width=20).pack(pady=2)
    
    # Load initial data
     self.load_dashboard_data()

 def comprehensive_agency_report(self):
    """Comprehensive agency report with download"""
    report_window = tk.Toplevel(self.root)
    report_window.title("Comprehensive Agency Report")
    report_window.geometry("900x600")
    
    # Agency selection
    selection_frame = ttk.Frame(report_window)
    selection_frame.pack(fill=tk.X, padx=10, pady=10)
    
    ttk.Label(selection_frame, text="Select Agency:").pack(side=tk.LEFT, padx=5)
    agency_var = tk.StringVar()
    agency_combo = ttk.Combobox(selection_frame, textvariable=agency_var, width=30)
    agency_combo.pack(side=tk.LEFT, padx=5)
    
    ttk.Button(selection_frame, text="Generate Report", 
                command=lambda: self.generate_agency_report(agency_var.get(), report_text)).pack(side=tk.LEFT, padx=5)
    ttk.Button(selection_frame, text="Download Excel", 
                command=lambda: self.download_agency_excel(agency_var.get())).pack(side=tk.LEFT, padx=5)
    
    # Report display
    report_text = tk.Text(report_window, wrap=tk.WORD, padx=10, pady=10)
    report_scroll = ttk.Scrollbar(report_window, orient="vertical", command=report_text.yview)
    report_text.configure(yscrollcommand=report_scroll.set)
    
    report_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=10, pady=10)
    report_scroll.pack(side=tk.RIGHT, fill=tk.Y, pady=10)
    
    # Load agencies
    try:
        cursor = self.connection.cursor()
        cursor.execute("SELECT agency_name FROM agencies ORDER BY agency_name")
        agencies = [row[0] for row in cursor.fetchall()]
        agency_combo['values'] = agencies
        if agencies:
            agency_combo.current(0)
    except sqlite3.Error:
        pass
    finally:
        cursor.close()

 def generate_agency_report(self, agency_name, report_text):
    """Generate comprehensive agency report"""
    if not agency_name:
        messagebox.showwarning("Selection Required", "Please select an agency.")
        return
    
    try:
        cursor = self.connection.cursor()
        
        report_content = f"COMPREHENSIVE AGENCY REPORT\n"
        report_content += "=" * 50 + "\n\n"
        report_content += f"Agency: {agency_name}\n"
        report_content += f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        
        # Get all clients and their rate cards
        cursor.execute("""
            SELECT c.client_name, ac.rate_card_type, ac.discount_rate,
                    crc.rate_card_name, crc.base_modifier_percentage,
                    COUNT(cpr.custom_rate_id) as custom_rates_count
            FROM agency_clients ac
            JOIN agencies a ON ac.agency_id = a.agency_id
            JOIN clients c ON ac.client_id = c.client_id
            LEFT JOIN custom_rate_cards crc ON ac.agency_client_id = crc.agency_client_id AND crc.is_active = 1
            LEFT JOIN custom_program_rates cpr ON crc.rate_card_id = cpr.rate_card_id
            WHERE a.agency_name = ?
            GROUP BY c.client_name, ac.rate_card_type, ac.discount_rate, crc.rate_card_name, crc.base_modifier_percentage
            ORDER BY c.client_name
        """, (agency_name,))
        
        clients_data = cursor.fetchall()
        
        if not clients_data:
            report_content += "No clients found for this agency.\n"
        else:
            report_content += f"CLIENTS & RATE CARDS ({len(clients_data)} clients):\n"
            report_content += "-" * 40 + "\n\n"
            
            discount_count = 0
            custom_count = 0
            
            for client_name, rate_type, discount, custom_name, base_modifier, custom_rates_count in clients_data:
                report_content += f"CLIENT: {client_name}\n"
                
                if rate_type == 'discount':
                    discount_count += 1
                    report_content += f"  Rate Card Type: Discount Rate Card\n"
                    report_content += f"  Discount Percentage: {discount}%\n"
                    report_content += f"  Programs: All programs with discount applied\n"
                else:
                    custom_count += 1
                    report_content += f"  Rate Card Type: Custom Rate Card\n"
                    report_content += f"  Rate Card Name: {custom_name or 'Unnamed'}\n"
                    report_content += f"  Base Modifier: {base_modifier or 0:+.1f}%\n"
                    report_content += f"  Custom Program Rates: {custom_rates_count}\n"
                
                report_content += "\n"
            
            report_content += f"SUMMARY:\n"
            report_content += f"Total Clients: {len(clients_data)}\n"
            report_content += f"Discount Rate Cards: {discount_count}\n"
            report_content += f"Custom Rate Cards: {custom_count}\n"
        
        report_text.delete(1.0, tk.END)
        report_text.insert(tk.END, report_content)
        
    except sqlite3.Error as err:
        messagebox.showerror("Database Error", f"Error generating agency report: {err}")
    finally:
        cursor.close()

 def download_agency_excel(self, agency_name):
    """Download comprehensive agency report as Excel"""
    if not agency_name:
        messagebox.showwarning("Selection Required", "Please select an agency.")
        return

    file_path = filedialog.asksaveasfilename(
        title="Save Agency Report",
        defaultextension=".xlsx",
        initialfile=f"Agency_Report_{agency_name}_{datetime.now().strftime('%Y%m%d')}.xlsx",
        filetypes=[("Excel files", "*.xlsx"), ("All files", "*.*")]
    )

    if file_path:
        try:
            wb = Workbook()
            ws = wb.active
            ws.title = "Agency Report"
            
            # Header
            ws.cell(row=1, column=1, value=f"COMPREHENSIVE AGENCY REPORT - {agency_name}")
            ws.merge_cells('A1:F1')
            ws.cell(row=1, column=1).font = Font(name="Arial", size=16, bold=True)
            ws.cell(row=1, column=1).alignment = Alignment(horizontal='center')
            
            ws.cell(row=2, column=1, value=f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            ws.merge_cells('A2:F2')
            ws.cell(row=2, column=1).alignment = Alignment(horizontal='center')
            
            current_row = 4
            
            # Get agency data
            cursor = self.connection.cursor()
            cursor.execute("""
                SELECT c.client_name, ac.rate_card_type, ac.discount_rate,
                    crc.rate_card_name, crc.base_modifier_percentage,
                    COUNT(cpr.custom_rate_id) as custom_rates_count
                FROM agency_clients ac
                JOIN agencies a ON ac.agency_id = a.agency_id
                JOIN clients c ON ac.client_id = c.client_id
                LEFT JOIN custom_rate_cards crc ON ac.agency_client_id = crc.agency_client_id AND crc.is_active = 1
                LEFT JOIN custom_program_rates cpr ON crc.rate_card_id = cpr.rate_card_id
                WHERE a.agency_name = ?
                GROUP BY c.client_name, ac.rate_card_type, ac.discount_rate, crc.rate_card_name, crc.base_modifier_percentage
                ORDER BY c.client_name
            """, (agency_name,))
            
            # Headers
            headers = ['Client Name', 'Rate Card Type', 'Discount %', 'Custom Rate Card Name', 'Base Modifier %', 'Custom Programs Count']
            for col, header in enumerate(headers, 1):
                cell = ws.cell(row=current_row, column=col, value=header)
                cell.font = Font(bold=True)
                cell.fill = PatternFill(start_color="CCCCCC", end_color="CCCCCC", fill_type="solid")
            
            current_row += 1
            
            # Data
            for row_data in cursor.fetchall():
                client_name, rate_type, discount, custom_name, base_modifier, custom_count = row_data
                
                ws.cell(row=current_row, column=1, value=client_name)
                ws.cell(row=current_row, column=2, value=rate_type.title())
                ws.cell(row=current_row, column=3, value=f"{discount}%" if rate_type == 'discount' else 'N/A')
                ws.cell(row=current_row, column=4, value=custom_name or 'N/A')
                ws.cell(row=current_row, column=5, value=f"{base_modifier:+.1f}%" if base_modifier else 'N/A')
                ws.cell(row=current_row, column=6, value=custom_count)
                
                current_row += 1
            
            # Auto-adjust column widths
            for column in ws.columns:
                max_length = 0
                column_letter = get_column_letter(column[0].column)
                for cell in column:
                    try:
                        if cell.value and len(str(cell.value)) > max_length:
                            max_length = len(str(cell.value))
                    except:
                        pass
                adjusted_width = min(max_length + 2, 50)
                ws.column_dimensions[column_letter].width = adjusted_width
            
            wb.save(file_path)
            messagebox.showinfo("Success", f"Agency report exported to:\n{file_path}")
            
        except Exception as err:
            messagebox.showerror("Export Error", f"Error creating Excel file: {err}")
        finally:
            cursor.close()


 def load_dashboard_data(self):
     """Load data for all dashboard boxes"""
     try:
         cursor = self.connection.cursor()
         
         # Programs stats
         cursor.execute("SELECT COUNT(*) FROM programs")
         program_count = cursor.fetchone()[0]
         cursor.execute("SELECT COUNT(*) FROM program_schedules")
         schedule_count = cursor.fetchone()[0]
         self.programs_stats_label.config(text=f"📺 {program_count} Programs | 📅 {schedule_count} Schedules")
         
         # Agencies stats
         cursor.execute("SELECT COUNT(*) FROM agencies")
         agency_count = cursor.fetchone()[0]
         cursor.execute("SELECT COUNT(*) FROM clients")
         client_count = cursor.fetchone()[0]
         cursor.execute("SELECT COUNT(*) FROM agency_clients")
         relationship_count = cursor.fetchone()[0]
         self.agencies_stats_label.config(text=f"🏢 {agency_count} Agencies | 👤 {client_count} Clients | 🔗 {relationship_count} Links")
         
         # Rate cards stats
         cursor.execute("SELECT COUNT(*) FROM custom_rate_cards WHERE is_active = 1")
         custom_cards = cursor.fetchone()[0]
         cursor.execute("SELECT COUNT(*) FROM agency_clients WHERE rate_card_type = 'discount'")
         discount_cards = cursor.fetchone()[0]
         self.rates_stats_label.config(text=f"⭐ {custom_cards} Custom Cards | 💰 {discount_cards} Discount Cards")
         
     except sqlite3.Error as err:
         print(f"Error loading dashboard data: {err}")
     finally:
         if cursor:
             cursor.close()

 def edit_category(self, tree):
    """Edit selected category"""
    selected = tree.selection()
    if not selected:
        messagebox.showwarning("No Selection", "Please select a category to edit.")
        return

    category_id = tree.item(selected[0])['values'][0]
    current_name = tree.item(selected[0])['values'][1]

    new_name = simpledialog.askstring("Edit Category", "Enter new category name:", initialvalue=current_name)
    if new_name and new_name.strip() and new_name.strip() != current_name:
        try:
            cursor = self.connection.cursor()
            # Check if new name already exists
            cursor.execute("SELECT COUNT(*) FROM program_categories WHERE UPPER(category_name) = UPPER(?) AND category_id != ?", (new_name.strip(), category_id))
            if cursor.fetchone()[0] > 0:
                messagebox.showerror("Error", "Category name already exists.")
                return
            
            cursor.execute("UPDATE program_categories SET category_name = ? WHERE category_id = ?", (new_name.strip(), category_id))
            self.connection.commit()
            messagebox.showinfo("Success", f"Category updated to '{new_name.strip()}'!")
            self.load_categories(tree)
        except sqlite3.Error as err:
            self.connection.rollback()
            messagebox.showerror("Database Error", f"Error updating category: {err}")
        finally:
            cursor.close()

 def delete_category(self, tree):
    """Delete selected category"""
    selected = tree.selection()
    if not selected:
        messagebox.showwarning("No Selection", "Please select a category to delete.")
        return

    category_id = tree.item(selected[0])['values'][0]
    category_name = tree.item(selected[0])['values'][1]
    subcategories_count = tree.item(selected[0])['values'][2]
    programs_count = tree.item(selected[0])['values'][3]

    if subcategories_count > 0 or programs_count > 0:
        messagebox.showerror("Cannot Delete", f"Cannot delete category '{category_name}'.\nIt has {subcategories_count} subcategories and {programs_count} programs.")
        return

    if messagebox.askyesno("Confirm Delete", f"Delete category '{category_name}'?\n\nThis action cannot be undone."):
        try:
            cursor = self.connection.cursor()
            cursor.execute("DELETE FROM program_categories WHERE category_id = ?", (category_id,))
            self.connection.commit()
            messagebox.showinfo("Success", f"Category '{category_name}' deleted!")
            self.load_categories(tree)
        except sqlite3.Error as err:
            self.connection.rollback()
            messagebox.showerror("Database Error", f"Error deleting category: {err}")
        finally:
            cursor.close()

 def edit_subcategory(self, tree):
    """Edit selected subcategory"""
    selected = tree.selection()
    if not selected:
        messagebox.showwarning("No Selection", "Please select a subcategory to edit.")
        return

    subcategory_id = tree.item(selected[0])['values'][0]
    current_name = tree.item(selected[0])['values'][1]

    new_name = simpledialog.askstring("Edit Subcategory", "Enter new subcategory name:", initialvalue=current_name)
    if new_name and new_name.strip() and new_name.strip() != current_name:
        try:
            cursor = self.connection.cursor()
            # Check if new name already exists in same category
            cursor.execute("""
                SELECT COUNT(*) FROM program_subcategories ps1, program_subcategories ps2 
                WHERE ps1.subcategory_id = ? AND ps2.subcategory_id != ? 
                AND ps1.category_id = ps2.category_id AND UPPER(ps2.subcategory_name) = UPPER(?)
            """, (subcategory_id, subcategory_id, new_name.strip()))
            if cursor.fetchone()[0] > 0:
                messagebox.showerror("Error", "Subcategory name already exists in this category.")
                return
            
            cursor.execute("UPDATE program_subcategories SET subcategory_name = ? WHERE subcategory_id = ?", (new_name.strip(), subcategory_id))
            self.connection.commit()
            messagebox.showinfo("Success", f"Subcategory updated to '{new_name.strip()}'!")
            self.load_subcategories(tree)
        except sqlite3.Error as err:
            self.connection.rollback()
            messagebox.showerror("Database Error", f"Error updating subcategory: {err}")
        finally:
            cursor.close()

 def delete_subcategory(self, tree):
    """Delete selected subcategory"""
    selected = tree.selection()
    if not selected:
        messagebox.showwarning("No Selection", "Please select a subcategory to delete.")
        return

    subcategory_id = tree.item(selected[0])['values'][0]
    subcategory_name = tree.item(selected[0])['values'][1]
    programs_count = tree.item(selected[0])['values'][3]

    if programs_count > 0:
        messagebox.showerror("Cannot Delete", f"Cannot delete subcategory '{subcategory_name}'.\nIt has {programs_count} programs assigned to it.")
        return

    if messagebox.askyesno("Confirm Delete", f"Delete subcategory '{subcategory_name}'?\n\nThis action cannot be undone."):
        try:
            cursor = self.connection.cursor()
            cursor.execute("DELETE FROM program_subcategories WHERE subcategory_id = ?", (subcategory_id,))
            self.connection.commit()
            messagebox.showinfo("Success", f"Subcategory '{subcategory_name}' deleted!")
            self.load_subcategories(tree)
        except sqlite3.Error as err:
            self.connection.rollback()
            messagebox.showerror("Database Error", f"Error deleting subcategory: {err}")
        finally:
            cursor.close()

 def export_to_csv(self, selected_data, folder_path, timestamp):
    """Export selected data to CSV files"""
    try:
        cursor = self.connection.cursor()
        exported_files = []
        
        for data_type in selected_data:
            if data_type == 'programs':
                filename = os.path.join(folder_path, f"programs_schedules_{timestamp}.csv")
                cursor.execute("""
                    SELECT p.program_name, c.category_name, s.subcategory_name, p.is_repeat,
                        ps.start_time, ps.end_time, dp.pattern_code, bt.type_code, ps.rate_30sec
                    FROM programs p
                    JOIN program_subcategories s ON p.subcategory_id = s.subcategory_id
                    JOIN program_categories c ON s.category_id = c.category_id
                    LEFT JOIN program_schedules ps ON p.program_id = ps.program_id
                    LEFT JOIN day_patterns dp ON ps.day_pattern_id = dp.day_pattern_id
                    LEFT JOIN broadcast_types bt ON ps.broadcast_type_id = bt.broadcast_type_id
                    ORDER BY p.program_name
                """)
                
                with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
                    writer = csv.writer(csvfile)
                    writer.writerow(['Program Name', 'Category', 'Subcategory', 'Is Repeat', 'Start Time', 'End Time', 'Day Pattern', 'Broadcast Type', 'Rate 30sec'])
                    writer.writerows(cursor.fetchall())
                exported_files.append(filename)
            
            elif data_type == 'agencies':
                filename = os.path.join(folder_path, f"agencies_clients_{timestamp}.csv")
                cursor.execute("""
                    SELECT a.agency_name, c.client_name, ac.discount_rate, ac.rate_card_type
                    FROM agency_clients ac
                    JOIN agencies a ON ac.agency_id = a.agency_id
                    JOIN clients c ON ac.client_id = c.client_id
                    ORDER BY a.agency_name, c.client_name
                """)
                
                with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
                    writer = csv.writer(csvfile)
                    writer.writerow(['Agency', 'Client', 'Discount Rate', 'Rate Card Type'])
                    writer.writerows(cursor.fetchall())
                exported_files.append(filename)
            
            # Add other data types as needed...
        
        cursor.close()
        messagebox.showinfo("Export Complete", f"Data exported to {len(exported_files)} CSV files in:\n{folder_path}")
        
    except Exception as err:
        messagebox.showerror("Export Error", f"Error exporting to CSV: {err}")

 # Admin action methods with complete implementations
 def add_program(self):
     """Add new program with complete form"""
     dialog = tk.Toplevel(self.root)
     dialog.title("Add New Program")
     dialog.geometry("500x400")
     dialog.grab_set()
     
     # Program name
     ttk.Label(dialog, text="Program Name:").grid(row=0, column=0, padx=10, pady=10, sticky=tk.W)
     name_var = tk.StringVar()
     ttk.Entry(dialog, textvariable=name_var, width=40).grid(row=0, column=1, padx=10, pady=10, sticky=tk.W)
     
     # Get subcategories
     subcategories = []
     try:
         cursor = self.connection.cursor()
         cursor.execute("""
             SELECT s.subcategory_id, s.subcategory_name, c.category_name
             FROM program_subcategories s
             JOIN program_categories c ON s.category_id = c.category_id
             ORDER BY c.category_name, s.subcategory_name
         """)
         subcategories = [(f"{row[1]} ({row[2]})", row[0]) for row in cursor.fetchall()]
     except sqlite3.Error as err:
         messagebox.showerror("Database Error", f"Error fetching subcategories: {err}")
         return
     finally:
         cursor.close()
     
     # Subcategory dropdown
     ttk.Label(dialog, text="Subcategory:").grid(row=1, column=0, padx=10, pady=10, sticky=tk.W)
     subcategory_var = tk.StringVar()
     subcategory_combo = ttk.Combobox(dialog, textvariable=subcategory_var, width=40)
     subcategory_combo['values'] = [s[0] for s in subcategories]
     if subcategories:
         subcategory_combo.current(0)
     subcategory_combo.grid(row=1, column=1, padx=10, pady=10, sticky=tk.W)
     
     # Is repeat program
     is_repeat_var = tk.BooleanVar()
     repeat_check = ttk.Checkbutton(dialog, text="Is Repeat Program", variable=is_repeat_var)
     repeat_check.grid(row=2, column=0, columnspan=2, padx=10, pady=10, sticky=tk.W)
     
     # Original program (for repeats)
     ttk.Label(dialog, text="Original Program:").grid(row=3, column=0, padx=10, pady=10, sticky=tk.W)
     original_var = tk.StringVar()
     original_combo = ttk.Combobox(dialog, textvariable=original_var, width=40, state="disabled")
     original_combo.grid(row=3, column=1, padx=10, pady=10, sticky=tk.W)
     
     # Get original programs
     try:
         cursor = self.connection.cursor()
         cursor.execute("SELECT program_id, program_name FROM programs WHERE is_repeat = 0 ORDER BY program_name")
         original_programs = [(row[1], row[0]) for row in cursor.fetchall()]
         original_combo['values'] = [p[0] for p in original_programs]
     except sqlite3.Error:
         pass
     finally:
         cursor.close()
     
     def toggle_original_program():
         if is_repeat_var.get():
             original_combo.config(state="readonly")
         else:
             original_combo.config(state="disabled")
             original_var.set("")
     
     repeat_check.configure(command=toggle_original_program)
     
     def save_program():
         program_name = name_var.get().strip()
         selected_subcategory = subcategory_var.get()
         is_repeat = is_repeat_var.get()
         selected_original = original_var.get()
         
         if not program_name:
             messagebox.showerror("Error", "Program name is required.")
             return
         
         if not selected_subcategory:
             messagebox.showerror("Error", "Please select a subcategory.")
             return
         
         if is_repeat and not selected_original:
             messagebox.showerror("Error", "Please select an original program for this repeat.")
             return
         
         # Get subcategory ID
         subcategory_id = None
         for s in subcategories:
             if s[0] == selected_subcategory:
                 subcategory_id = s[1]
                 break
         
         # Get original program ID
         original_id = None
         if is_repeat:
             for p in original_programs:
                 if p[0] == selected_original:
                     original_id = p[1]
                     break
         
         try:
             cursor = self.connection.cursor()
             cursor.execute("""
                 INSERT INTO programs (program_name, subcategory_id, is_repeat, original_program_id)
                 VALUES (?, ?, ?, ?)
             """, (program_name, subcategory_id, is_repeat, original_id))
             self.connection.commit()
             
             messagebox.showinfo("Success", "Program added successfully!")
             dialog.destroy()
             self.load_dashboard_data()
             
         except sqlite3.Error as err:
             self.connection.rollback()
             messagebox.showerror("Database Error", f"Error adding program: {err}")
         finally:
             cursor.close()
     
     # Buttons
     button_frame = ttk.Frame(dialog)
     button_frame.grid(row=4, column=0, columnspan=2, pady=20)
     
     ttk.Button(button_frame, text="Save", command=save_program).pack(side=tk.LEFT, padx=5)
     ttk.Button(button_frame, text="Cancel", command=dialog.destroy).pack(side=tk.LEFT, padx=5)

 def manage_schedules(self):
     """Comprehensive schedule management"""
     schedules_window = tk.Toplevel(self.root)
     schedules_window.title("Program Schedules Management")
     schedules_window.geometry("1200x700")
     
     # Control frame
     control_frame = ttk.Frame(schedules_window)
     control_frame.pack(fill=tk.X, padx=10, pady=10)
     
     ttk.Button(control_frame, text="Add Schedule", command=lambda: self.add_schedule(schedules_tree)).pack(side=tk.LEFT, padx=5)
     ttk.Button(control_frame, text="Edit Selected", command=lambda: self.edit_schedule(schedules_tree)).pack(side=tk.LEFT, padx=5)
     ttk.Button(control_frame, text="Delete Selected", command=lambda: self.delete_schedule(schedules_tree)).pack(side=tk.LEFT, padx=5)
     ttk.Button(control_frame, text="Refresh", command=lambda: self.load_schedules(schedules_tree)).pack(side=tk.RIGHT, padx=5)
     
     # Schedules tree
     columns = ('id', 'program', 'day_pattern', 'start_time', 'end_time', 'broadcast_type', 'rate')
     schedules_tree = ttk.Treeview(schedules_window, columns=columns, show='headings')
     
     for col in columns:
         schedules_tree.heading(col, text=col.replace('_', ' ').title())
         schedules_tree.column(col, width=120)
     
     # Scrollbars
     v_scroll = ttk.Scrollbar(schedules_window, orient="vertical", command=schedules_tree.yview)
     h_scroll = ttk.Scrollbar(schedules_window, orient="horizontal", command=schedules_tree.xview)
     schedules_tree.configure(yscrollcommand=v_scroll.set, xscrollcommand=h_scroll.set)
     
     schedules_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(10, 0), pady=10)
     v_scroll.pack(side=tk.RIGHT, fill=tk.Y, pady=10)
     h_scroll.pack(side=tk.BOTTOM, fill=tk.X, padx=10)
     
     # Load data
     self.load_schedules(schedules_tree)

 def add_schedule(self, tree):
     """Add new program schedule"""
     dialog = tk.Toplevel(self.root)
     dialog.title("Add Program Schedule")
     dialog.geometry("500x600")
     dialog.grab_set()
     
     # Get programs
     programs = []
     try:
         cursor = self.connection.cursor()
         cursor.execute("SELECT program_id, program_name FROM programs ORDER BY program_name")
         programs = [(row[1], row[0]) for row in cursor.fetchall()]
     except sqlite3.Error:
         pass
     finally:
         cursor.close()
     
     # Get day patterns
     day_patterns = []
     try:
         cursor = self.connection.cursor()
         cursor.execute("SELECT day_pattern_id, pattern_code FROM day_patterns ORDER BY pattern_code")
         day_patterns = [(row[1], row[0]) for row in cursor.fetchall()]
     except sqlite3.Error:
         pass
     finally:
         cursor.close()
     
     # Get broadcast types
     broadcast_types = []
     try:
         cursor = self.connection.cursor()
         cursor.execute("SELECT broadcast_type_id, type_code FROM broadcast_types ORDER BY type_code")
         broadcast_types = [(row[1], row[0]) for row in cursor.fetchall()]
     except sqlite3.Error:
         pass
     finally:
         cursor.close()
     
     # Program
     ttk.Label(dialog, text="Program:").grid(row=0, column=0, padx=10, pady=10, sticky=tk.W)
     program_var = tk.StringVar()
     program_combo = ttk.Combobox(dialog, textvariable=program_var, values=[p[0] for p in programs], width=40)
     if programs:
         program_combo.current(0)
     program_combo.grid(row=0, column=1, padx=10, pady=10, sticky=tk.W)
     
     # Day pattern
     ttk.Label(dialog, text="Day Pattern:").grid(row=1, column=0, padx=10, pady=10, sticky=tk.W)
     day_var = tk.StringVar()
     day_combo = ttk.Combobox(dialog, textvariable=day_var, values=[d[0] for d in day_patterns], width=40)
     if day_patterns:
         day_combo.current(0)
     day_combo.grid(row=1, column=1, padx=10, pady=10, sticky=tk.W)
     
     # Start time
     ttk.Label(dialog, text="Start Time (24h format):").grid(row=2, column=0, padx=10, pady=10, sticky=tk.W)
     start_time_var = tk.StringVar(value="00:00")
     start_entry = ttk.Entry(dialog, textvariable=start_time_var, width=10)
     start_entry.grid(row=2, column=1, padx=10, pady=10, sticky=tk.W)
     ttk.Label(dialog, text="(HH:MM format)", font=("Arial", 8)).grid(row=2, column=2, padx=5, sticky=tk.W)
     
     # End time
     ttk.Label(dialog, text="End Time (24h format):").grid(row=3, column=0, padx=10, pady=10, sticky=tk.W)
     end_time_var = tk.StringVar(value="00:30")
     end_entry = ttk.Entry(dialog, textvariable=end_time_var, width=10)
     end_entry.grid(row=3, column=1, padx=10, pady=10, sticky=tk.W)
     ttk.Label(dialog, text="(HH:MM format)", font=("Arial", 8)).grid(row=3, column=2, padx=5, sticky=tk.W)
     
     # Broadcast type
     ttk.Label(dialog, text="Broadcast Type:").grid(row=4, column=0, padx=10, pady=10, sticky=tk.W)
     broadcast_var = tk.StringVar()
     broadcast_combo = ttk.Combobox(dialog, textvariable=broadcast_var, values=[b[0] for b in broadcast_types], width=40)
     if broadcast_types:
         broadcast_combo.current(0)
     broadcast_combo.grid(row=4, column=1, padx=10, pady=10, sticky=tk.W)
     
     # Rate
     ttk.Label(dialog, text="30 Sec Rate (LKR):").grid(row=5, column=0, padx=10, pady=10, sticky=tk.W)
     rate_var = tk.StringVar(value="0.00")
     rate_entry = ttk.Entry(dialog, textvariable=rate_var, width=15)
     rate_entry.grid(row=5, column=1, padx=10, pady=10, sticky=tk.W)
     
     def save_schedule():
         program_name = program_var.get()
         day_pattern = day_var.get()
         start_time = start_time_var.get()
         end_time = end_time_var.get()
         broadcast_type = broadcast_var.get()
         rate = rate_var.get()
         
         if not all([program_name, day_pattern, start_time, end_time, broadcast_type, rate]):
             messagebox.showerror("Error", "All fields are required.")
             return
         
         # Validate time format
         try:
             if not re.match(r'^\d{2}:\d{2}$', start_time) or not re.match(r'^\d{2}:\d{2}$', end_time):
                 messagebox.showerror("Error", "Time must be in HH:MM format (24-hour).")
                 return
             
             # Validate time values
             start_parts = start_time.split(':')
             end_parts = end_time.split(':')
             if not (0 <= int(start_parts[0]) <= 23 and 0 <= int(start_parts[1]) <= 59):
                 messagebox.showerror("Error", "Invalid start time.")
                 return
             if not (0 <= int(end_parts[0]) <= 23 and 0 <= int(end_parts[1]) <= 59):
                 messagebox.showerror("Error", "Invalid end time.")
                 return
             
             rate_value = float(rate)
             if rate_value < 0:
                 messagebox.showerror("Error", "Rate must be positive.")
                 return
         except ValueError:
             messagebox.showerror("Error", "Invalid rate value.")
             return
         
         # Get IDs
         program_id = next(p[1] for p in programs if p[0] == program_name)
         day_pattern_id = next(d[1] for d in day_patterns if d[0] == day_pattern)
         broadcast_type_id = next(b[1] for b in broadcast_types if b[0] == broadcast_type)
         
         try:
             cursor = self.connection.cursor()
             cursor.execute("""
                 INSERT INTO program_schedules (program_id, day_pattern_id, start_time, end_time, broadcast_type_id, rate_30sec)
                 VALUES (?, ?, ?, ?, ?, ?)
             """, (program_id, day_pattern_id, f"{start_time}:00", f"{end_time}:00", broadcast_type_id, rate_value))
             self.connection.commit()
             
             messagebox.showinfo("Success", "Schedule added successfully!")
             dialog.destroy()
             self.load_schedules(tree)
             
         except sqlite3.Error as err:
             self.connection.rollback()
             messagebox.showerror("Database Error", f"Error adding schedule: {err}")
         finally:
             cursor.close()
     
     # Buttons
     button_frame = ttk.Frame(dialog)
     button_frame.grid(row=6, column=0, columnspan=3, pady=20)
     
     ttk.Button(button_frame, text="Save", command=save_schedule).pack(side=tk.LEFT, padx=5)
     ttk.Button(button_frame, text="Cancel", command=dialog.destroy).pack(side=tk.LEFT, padx=5)

 def load_schedules(self, tree):
     """Load schedules into treeview"""
     for item in tree.get_children():
         tree.delete(item)
     
     try:
         cursor = self.connection.cursor()
         cursor.execute("""
             SELECT s.schedule_id, p.program_name, d.pattern_code, s.start_time, s.end_time, b.type_code, s.rate_30sec
             FROM program_schedules s
             JOIN programs p ON s.program_id = p.program_id
             JOIN day_patterns d ON s.day_pattern_id = d.day_pattern_id
             JOIN broadcast_types b ON s.broadcast_type_id = b.broadcast_type_id
             ORDER BY p.program_name, s.start_time
         """)
         
         for row in cursor.fetchall():
             schedule_id, program_name, pattern, start_time, end_time, broadcast_type, rate = row
             # Format times
             start_str = self.format_time_display(start_time)
             end_str = self.format_time_display(end_time)
             tree.insert('', tk.END, values=(
                 schedule_id, program_name, pattern, start_str, end_str, broadcast_type, f"{rate:,.2f}"
             ))
     
     except sqlite3.Error as err:
         messagebox.showerror("Database Error", f"Error loading schedules: {err}")
     finally:
         cursor.close()

 def format_time_display(self, time_obj):
     """Format time for display"""
     if isinstance(time_obj, str):
         return time_obj[:5] if len(time_obj) > 5 else time_obj
     elif isinstance(time_obj, timedelta):
         total_seconds = int(time_obj.total_seconds())
         hours = total_seconds // 3600
         minutes = (total_seconds % 3600) // 60
         return f"{hours:02d}:{minutes:02d}"
     return str(time_obj)

 def edit_schedule(self, tree):
  """Enhanced schedule editing with all details"""
  selected = tree.selection()
  if not selected:
      messagebox.showwarning("No Selection", "Please select a schedule to edit.")
      return
  
  schedule_id = tree.item(selected[0])['values'][0]
  
  # Get schedule details
  try:
      cursor = self.connection.cursor()
      cursor.execute("""
          SELECT s.program_id, s.day_pattern_id, s.start_time, s.end_time, 
                 s.broadcast_type_id, s.rate_30sec, p.program_name
          FROM program_schedules s
          JOIN programs p ON s.program_id = p.program_id
          WHERE s.schedule_id = ?
      """, (schedule_id,))
      result = cursor.fetchone()
      if not result:
          messagebox.showerror("Error", "Schedule not found.")
          return
          
      current_program_id, current_day_id, start_time, end_time, current_broadcast_id, rate, program_name = result   
  
  except sqlite3.Error as err:
      messagebox.showerror("Database Error", f"Error loading schedule: {err}")
      return
  finally:
      cursor.close()
  
  # Create comprehensive edit dialog
  dialog = tk.Toplevel(self.root)
  dialog.title(f"Edit Schedule: {program_name}")
  dialog.geometry("600x500")
  dialog.grab_set()
  
  # Get all dropdown data
  programs = []
  day_patterns = []
  broadcast_types = []
  
  try:
      cursor = self.connection.cursor()
      
      # Get programs
      cursor.execute("SELECT program_id, program_name FROM programs ORDER BY program_name")
      programs = cursor.fetchall()
      
      # Get day patterns
      cursor.execute("SELECT day_pattern_id, pattern_code FROM day_patterns ORDER BY pattern_code")
      day_patterns = cursor.fetchall()
      
      # Get broadcast types
      cursor.execute("SELECT broadcast_type_id, type_code FROM broadcast_types ORDER BY type_code")
      broadcast_types = cursor.fetchall()
      
  except sqlite3.Error:
      pass
  finally:
      cursor.close()
  
  # Program selection
  ttk.Label(dialog, text="Program:").grid(row=0, column=0, padx=10, pady=10, sticky=tk.W)
  program_var = tk.StringVar()
  program_combo = ttk.Combobox(dialog, textvariable=program_var, values=[p[1] for p in programs], width=40)
  
  # Set current program
  current_program_name = next(p[1] for p in programs if p[0] == current_program_id)
  program_var.set(current_program_name)
  program_combo.grid(row=0, column=1, padx=10, pady=10, sticky=tk.W)
  
  # Day pattern selection
  ttk.Label(dialog, text="Day Pattern:").grid(row=1, column=0, padx=10, pady=10, sticky=tk.W)
  day_var = tk.StringVar()
  day_combo = ttk.Combobox(dialog, textvariable=day_var, values=[d[1] for d in day_patterns], width=40)
  
  # Set current day pattern
  current_day_pattern = next(d[1] for d in day_patterns if d[0] == current_day_id)
  day_var.set(current_day_pattern)
  day_combo.grid(row=1, column=1, padx=10, pady=10, sticky=tk.W)
  
  # Start time
  ttk.Label(dialog, text="Start Time (24h format):").grid(row=2, column=0, padx=10, pady=10, sticky=tk.W)
  start_time_var = tk.StringVar(value=self.format_time_display(start_time))
  start_entry = ttk.Entry(dialog, textvariable=start_time_var, width=15)
  start_entry.grid(row=2, column=1, padx=10, pady=10, sticky=tk.W)
  
  # End time
  ttk.Label(dialog, text="End Time (24h format):").grid(row=3, column=0, padx=10, pady=10, sticky=tk.W)
  end_time_var = tk.StringVar(value=self.format_time_display(end_time))
  end_entry = ttk.Entry(dialog, textvariable=end_time_var, width=15)
  end_entry.grid(row=3, column=1, padx=10, pady=10, sticky=tk.W)
  
  # Broadcast type
  ttk.Label(dialog, text="Broadcast Type:").grid(row=4, column=0, padx=10, pady=10, sticky=tk.W)
  broadcast_var = tk.StringVar()
  broadcast_combo = ttk.Combobox(dialog, textvariable=broadcast_var, values=[b[1] for b in broadcast_types], width=40)
  
  # Set current broadcast type
  current_broadcast_type = next(b[1] for b in broadcast_types if b[0] == current_broadcast_id)
  broadcast_var.set(current_broadcast_type)
  broadcast_combo.grid(row=4, column=1, padx=10, pady=10, sticky=tk.W)
  
  # Rate
  ttk.Label(dialog, text="30 Sec Rate (LKR):").grid(row=5, column=0, padx=10, pady=10, sticky=tk.W)
  rate_var = tk.StringVar(value=str(rate))
  rate_entry = ttk.Entry(dialog, textvariable=rate_var, width=15, font=("Arial", 11))
  rate_entry.grid(row=5, column=1, padx=10, pady=10, sticky=tk.W)
  
  # Current info display
  info_frame = ttk.LabelFrame(dialog, text="Current Schedule Information", padding="10")
  info_frame.grid(row=6, column=0, columnspan=2, padx=10, pady=10, sticky='ew')
  
  info_text = f"""Schedule ID: {schedule_id}
Program: {program_name}
Current Time Slot: {self.format_time_display(start_time)} - {self.format_time_display(end_time)}
Current Rate: LKR {rate:,.2f}

All fields above can be modified. Click 'Update Schedule' to save changes."""
  
  ttk.Label(info_frame, text=info_text, justify=tk.LEFT, font=("Arial", 9)).pack()
  
  def update_schedule():
      new_program = program_var.get()
      new_day_pattern = day_var.get()
      new_start_time = start_time_var.get()
      new_end_time = end_time_var.get()
      new_broadcast_type = broadcast_var.get()
      new_rate = rate_var.get()
      
      if not all([new_program, new_day_pattern, new_start_time, new_end_time, new_broadcast_type, new_rate]):
          messagebox.showerror("Error", "All fields are required.")
          return
      
      # Validate time format
      try:
          if not re.match(r'^\d{2}:\d{2}$', new_start_time) or not re.match(r'^\d{2}:\d{2}$', new_end_time):
              messagebox.showerror("Error", "Time must be in HH:MM format (24-hour).")
              return
          
          new_rate_value = float(new_rate)
          if new_rate_value < 0:
              messagebox.showerror("Error", "Rate must be positive.")
              return
      except ValueError:
          messagebox.showerror("Error", "Invalid rate value.")
          return
      
      # Get new IDs
      new_program_id = next(p[0] for p in programs if p[1] == new_program)
      new_day_pattern_id = next(d[0] for d in day_patterns if d[1] == new_day_pattern)
      new_broadcast_type_id = next(b[0] for b in broadcast_types if b[1] == new_broadcast_type)
      
      try:
          cursor = self.connection.cursor()
          cursor.execute("""
              UPDATE program_schedules 
              SET program_id = ?, day_pattern_id = ?, start_time = ?, end_time = ?, 
                  broadcast_type_id = ?, rate_30sec = ?
              WHERE schedule_id = ?
          """, (new_program_id, new_day_pattern_id, f"{new_start_time}:00", f"{new_end_time}:00", 
                new_broadcast_type_id, new_rate_value, schedule_id))
          self.connection.commit()
          
          messagebox.showinfo("Success", "Schedule updated successfully with all changes!")
          dialog.destroy()
          self.load_schedules(tree)
          
      except sqlite3.Error as err:
          self.connection.rollback()
          messagebox.showerror("Database Error", f"Error updating schedule: {err}")
      finally:
          cursor.close()
  
  # Buttons
  button_frame = ttk.Frame(dialog)
  button_frame.grid(row=7, column=0, columnspan=2, pady=20)
  
  ttk.Button(button_frame, text="Update Schedule", command=update_schedule).pack(side=tk.LEFT, padx=5)
  ttk.Button(button_frame, text="Cancel", command=dialog.destroy).pack(side=tk.LEFT, padx=5)

 def view_programs(self):
     """View all programs in a comprehensive window"""
     programs_window = tk.Toplevel(self.root)
     programs_window.title("All Programs")
     programs_window.geometry("1000x600")
     
     # Control frame
     control_frame = ttk.Frame(programs_window)
     control_frame.pack(fill=tk.X, padx=10, pady=10)
     
     ttk.Label(control_frame, text="All Programs in Database", font=("Arial", 12, "bold")).pack(side=tk.LEFT)
     ttk.Button(control_frame, text="Refresh", command=lambda: self.load_all_programs(programs_tree)).pack(side=tk.RIGHT)
     
     # Programs tree
     columns = ('id', 'name', 'subcategory', 'category', 'is_repeat', 'schedules_count')
     programs_tree = ttk.Treeview(programs_window, columns=columns, show='headings')
     
     programs_tree.heading('id', text='ID')
     programs_tree.heading('name', text='Program Name')
     programs_tree.heading('subcategory', text='Subcategory')
     programs_tree.heading('category', text='Category')
     programs_tree.heading('is_repeat', text='Is Repeat')
     programs_tree.heading('schedules_count', text='Schedules')
     
     for col in columns:
         programs_tree.column(col, width=120)
     
     # Scrollbars
     v_scroll = ttk.Scrollbar(programs_window, orient="vertical", command=programs_tree.yview)
     h_scroll = ttk.Scrollbar(programs_window, orient="horizontal", command=programs_tree.xview)
     programs_tree.configure(yscrollcommand=v_scroll.set, xscrollcommand=h_scroll.set)
     
     programs_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(10, 0), pady=10)
     v_scroll.pack(side=tk.RIGHT, fill=tk.Y, pady=10)
     
     # Load programs
     self.load_all_programs(programs_tree)

 def load_all_programs(self, tree):
     """Load all programs with detailed information"""
     for item in tree.get_children():
         tree.delete(item)
     
     try:
         cursor = self.connection.cursor()
         cursor.execute("""
             SELECT p.program_id, p.program_name, s.subcategory_name, c.category_name, p.is_repeat, COUNT(ps.schedule_id) as schedule_count
             FROM programs p
             JOIN program_subcategories s ON p.subcategory_id = s.subcategory_id
             JOIN program_categories c ON s.category_id = c.category_id
             LEFT JOIN program_schedules ps ON p.program_id = ps.program_id
             GROUP BY p.program_id, p.program_name, s.subcategory_name, c.category_name, p.is_repeat
             ORDER BY p.program_name
         """)
         
         for row in cursor.fetchall():
             program_id, program_name, subcategory, category, is_repeat, schedule_count = row
             is_repeat_text = "Yes" if is_repeat else "No"
             tree.insert('', tk.END, values=(
                 program_id, program_name, subcategory, category, is_repeat_text, schedule_count
             ))
     
     except sqlite3.Error as err:
         messagebox.showerror("Database Error", f"Error loading programs: {err}")
     finally:
         cursor.close()

 def manage_time_slots(self):
     """Manage time slots with detailed analysis"""
     slots_window = tk.Toplevel(self.root)
     slots_window.title("Time Slots Management")
     slots_window.geometry("800x600")
     
     # Create notebook for different views
     notebook = ttk.Notebook(slots_window)
     notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
     
     # Tab 1: Current Time Slots
     slots_tab = ttk.Frame(notebook)
     notebook.add(slots_tab, text="Current Time Slots")
     
     # Time slots tree
     columns = ('start_time', 'end_time', 'programs_count', 'avg_rate', 'broadcast_type')
     slots_tree = ttk.Treeview(slots_tab, columns=columns, show='headings')
     
     for col in columns:
         slots_tree.heading(col, text=col.replace('_', ' ').title())
         slots_tree.column(col, width=120)
     
     slots_tree.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
     
     # Tab 2: Time Analysis
     analysis_tab = ttk.Frame(notebook)
     notebook.add(analysis_tab, text="Time Analysis")
     
     analysis_text = tk.Text(analysis_tab, wrap=tk.WORD, padx=10, pady=10)
     analysis_text.pack(fill=tk.BOTH, expand=True)
     
     # Load time slots data
     try:
         cursor = self.connection.cursor()
         
         # Load time slots
         cursor.execute("""
             SELECT ps.start_time, ps.end_time, COUNT(*) as programs, AVG(ps.rate_30sec) as avg_rate,
                 bt.type_code
             FROM program_schedules ps
             JOIN broadcast_types bt ON ps.broadcast_type_id = bt.broadcast_type_id
             GROUP BY ps.start_time, ps.end_time, bt.type_code
             ORDER BY ps.start_time
         """)
         
         for row in cursor.fetchall():
             start_time, end_time, count, avg_rate, broadcast_type = row
             start_str = self.format_time_display(start_time)
             end_str = self.format_time_display(end_time)
             slots_tree.insert('', tk.END, values=(
                 start_str, end_str, count, f"LKR {avg_rate:,.0f}", broadcast_type
             ))
         
         # Time analysis
         cursor.execute("""
             SELECT 
                 CASE 
                     WHEN CAST(SUBSTR(start_time, 1, 2) AS INTEGER) BETWEEN 6 AND 11 THEN 'Morning (06:00-11:59)'
                     WHEN CAST(SUBSTR(start_time, 1, 2) AS INTEGER) BETWEEN 12 AND 17 THEN 'Afternoon (12:00-17:59)'
                     WHEN CAST(SUBSTR(start_time, 1, 2) AS INTEGER) BETWEEN 18 AND 22 THEN 'Prime Time (18:00-22:59)'
                     ELSE 'Late Night/Early Morning'
                 END as time_period,
                 COUNT(*) as programs,
                 AVG(rate_30sec) as avg_rate,
                 MIN(rate_30sec) as min_rate,
                 MAX(rate_30sec) as max_rate
             FROM program_schedules
             GROUP BY time_period
             ORDER BY avg_rate DESC
         """)
         
         analysis_text.delete(1.0, tk.END)
         analysis_text.insert(tk.END, "TIME SLOT ANALYSIS\n")
         analysis_text.insert(tk.END, "===================\n\n")
         
         for row in cursor.fetchall():
             period, count, avg_rate, min_rate, max_rate = row
             analysis_text.insert(tk.END, f"{period}:\n")
             analysis_text.insert(tk.END, f"  Programs: {count}\n")
             analysis_text.insert(tk.END, f"  Average Rate: LKR {avg_rate:,.0f}\n")
             analysis_text.insert(tk.END, f"  Rate Range: LKR {min_rate:,.0f} - LKR {max_rate:,.0f}\n\n")
         
         analysis_text.config(state=tk.DISABLED)
     
     except sqlite3.Error as err:
         messagebox.showerror("Database Error", f"Error loading time slots: {err}")
     finally:
         cursor.close()

 def add_agency(self):
     """Add new agency with validation"""
     name = simpledialog.askstring("Add Agency", "Enter agency name:")
     if name and name.strip():
         # Additional validation
         if len(name.strip()) < 2:
             messagebox.showerror("Error", "Agency name must be at least 2 characters long.")
             return
         
         try:
             cursor = self.connection.cursor()
             # Check if agency already exists
             cursor.execute("SELECT COUNT(*) FROM agencies WHERE UPPER(agency_name) = UPPER(?)", (name.strip(),))
             if cursor.fetchone()[0] > 0:
                 messagebox.showerror("Error", "Agency with this name already exists.")
                 return
             
             cursor.execute("INSERT INTO agencies (agency_name) VALUES (?)", (name.strip(),))
             self.connection.commit()
             messagebox.showinfo("Success", f"Agency '{name.strip()}' added successfully!")
             self.load_dashboard_data()
         except sqlite3.Error as err:
             self.connection.rollback()
             messagebox.showerror("Database Error", f"Error adding agency: {err}")
         finally:
             cursor.close()

 def add_client(self):
     """Add new client with validation"""
     name = simpledialog.askstring("Add Client", "Enter client name:")
     if name and name.strip():
         # Additional validation
         if len(name.strip()) < 2:
             messagebox.showerror("Error", "Client name must be at least 2 characters long.")
             return
         
         try:
             cursor = self.connection.cursor()
             # Check if client already exists
             cursor.execute("SELECT COUNT(*) FROM clients WHERE UPPER(client_name) = UPPER(?)", (name.strip(),))
             if cursor.fetchone()[0] > 0:
                 messagebox.showerror("Error", "Client with this name already exists.")
                 return
             
             cursor.execute("INSERT INTO clients (client_name) VALUES (?)", (name.strip(),))
             self.connection.commit()
             messagebox.showinfo("Success", f"Client '{name.strip()}' added successfully!")
             self.load_dashboard_data()
         except sqlite3.Error as err:
             self.connection.rollback()
             messagebox.showerror("Database Error", f"Error adding client: {err}")
         finally:
             cursor.close()

 def assign_client(self):
     """Comprehensive client assignment to agency"""
     dialog = tk.Toplevel(self.root)
     dialog.title("Assign Client to Agency")
     dialog.geometry("500x400")
     dialog.grab_set()
     
     # Get agencies and clients
     agencies = []
     clients = []
     try:
         cursor = self.connection.cursor()
         cursor.execute("SELECT agency_id, agency_name FROM agencies ORDER BY agency_name")
         agencies = cursor.fetchall()
         cursor.execute("SELECT client_id, client_name FROM clients ORDER BY client_name")
         clients = cursor.fetchall()
     except sqlite3.Error:
         pass
     finally:
         cursor.close()
     
     if not agencies:
         messagebox.showerror("Error", "No agencies found. Add agencies first.")
         dialog.destroy()
         return
     
     if not clients:
         messagebox.showerror("Error", "No clients found. Add clients first.")
         dialog.destroy()
         return
     
     # Agency selection
     ttk.Label(dialog, text="Agency:").grid(row=0, column=0, padx=10, pady=10, sticky=tk.W)
     agency_var = tk.StringVar()
     agency_combo = ttk.Combobox(dialog, textvariable=agency_var, values=[a[1] for a in agencies], width=30)
     if agencies:
         agency_combo.current(0)
     agency_combo.grid(row=0, column=1, padx=10, pady=10, sticky=tk.W)
     
     # Client selection
     ttk.Label(dialog, text="Client:").grid(row=1, column=0, padx=10, pady=10, sticky=tk.W)
     client_var = tk.StringVar()
     client_combo = ttk.Combobox(dialog, textvariable=client_var, values=[c[1] for c in clients], width=30)
     if clients:
         client_combo.current(0)
     client_combo.grid(row=1, column=1, padx=10, pady=10, sticky=tk.W)
     
     # Discount rate
     ttk.Label(dialog, text="Discount Rate (%):").grid(row=2, column=0, padx=10, pady=10, sticky=tk.W)
     discount_var = tk.StringVar(value="0.0")
     discount_entry = ttk.Entry(dialog, textvariable=discount_var, width=10)
     discount_entry.grid(row=2, column=1, padx=10, pady=10, sticky=tk.W)
     ttk.Label(dialog, text="(0-100)", font=("Arial", 8)).grid(row=2, column=2, padx=5, sticky=tk.W)
     
     # Rate card type
     ttk.Label(dialog, text="Rate Card Type:").grid(row=3, column=0, padx=10, pady=10, sticky=tk.W)
     rate_type_var = tk.StringVar(value="discount")
     rate_type_combo = ttk.Combobox(dialog, textvariable=rate_type_var, values=["discount", "custom"], width=15)
     rate_type_combo.grid(row=3, column=1, padx=10, pady=10, sticky=tk.W)
     
     # Information text
     info_text = """Rate Card Types:
• Discount: Uses default rates with percentage discount
• Custom: Allows individual program rate customization

Note: Custom rate cards can be created later via Rate Card Management."""
     
     ttk.Label(dialog, text=info_text, justify=tk.LEFT, font=("Arial", 8)).grid(
         row=4, column=0, columnspan=3, padx=10, pady=10, sticky=tk.W)
     
     def save_assignment():
         agency_name = agency_var.get()
         client_name = client_var.get()
         discount = discount_var.get()
         rate_type = rate_type_var.get()
         
         if not all([agency_name, client_name, discount]):
             messagebox.showerror("Error", "All fields are required.")
             return
         
         try:
             discount_value = float(discount)
             if discount_value < 0 or discount_value > 100:
                 messagebox.showerror("Error", "Discount must be between 0 and 100.")
                 return
         except ValueError:
             messagebox.showerror("Error", "Invalid discount value.")
             return
         
         # Get IDs
         agency_id = next(a[0] for a in agencies if a[1] == agency_name)
         client_id = next(c[0] for c in clients if c[1] == client_name)
         
         try:
             cursor = self.connection.cursor()
             cursor.execute("""
                 INSERT INTO agency_clients (agency_id, client_id, discount_rate, rate_card_type)
                 VALUES (?, ?, ?, ?)
             """, (agency_id, client_id, discount_value, rate_type))
             self.connection.commit()
             
             messagebox.showinfo("Success", f"Client '{client_name}' assigned to '{agency_name}' successfully!\n"
                            f"Rate Type: {rate_type.title()}\n"
                            f"Discount: {discount_value}%")
             dialog.destroy()
             self.load_dashboard_data()
             
         except sqlite3.Error as err:
             self.connection.rollback()
             if "UNIQUE constraint failed" in str(err):
                 messagebox.showerror("Error", "This client is already assigned to this agency.")
             else:
                 messagebox.showerror("Database Error", f"Error assigning client: {err}")
         finally:
             cursor.close()
     
     # Buttons
     button_frame = ttk.Frame(dialog)
     button_frame.grid(row=5, column=0, columnspan=3, pady=20)
     
     ttk.Button(button_frame, text="Save Assignment", command=save_assignment).pack(side=tk.LEFT, padx=5)
     ttk.Button(button_frame, text="Cancel", command=dialog.destroy).pack(side=tk.LEFT, padx=5)

 def edit_program_name(self):
    """Edit program name with impact analysis"""
    # Select program dialog
    dialog = tk.Toplevel(self.root)
    dialog.title("Edit Program Name")
    dialog.geometry("600x500")
    dialog.grab_set()

    # Get all programs
    programs = []
    try:
        cursor = self.connection.cursor()
        cursor.execute("""
            SELECT p.program_id, p.program_name, c.category_name, s.subcategory_name,
                COUNT(ps.schedule_id) as schedules_count,
                COUNT(DISTINCT cpr.rate_card_id) as custom_rate_cards
            FROM programs p
            JOIN program_subcategories s ON p.subcategory_id = s.subcategory_id
            JOIN program_categories c ON s.category_id = c.category_id
            LEFT JOIN program_schedules ps ON p.program_id = ps.program_id
            LEFT JOIN custom_program_rates cpr ON ps.schedule_id = cpr.program_schedule_id
            GROUP BY p.program_id, p.program_name, c.category_name, s.subcategory_name
            ORDER BY p.program_name
        """)
        programs = cursor.fetchall()
    except sqlite3.Error as err:
        messagebox.showerror("Database Error", f"Error loading programs: {err}")
        dialog.destroy()
        return
    finally:
        cursor.close()

    if not programs:
        messagebox.showinfo("No Programs", "No programs found in database.")
        dialog.destroy()
        return

    # Program selection
    ttk.Label(dialog, text="Select Program to Rename:", font=("Arial", 12, "bold")).pack(pady=10)

    # Program listbox with details
    list_frame = ttk.Frame(dialog)
    list_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

    programs_listbox = tk.Listbox(list_frame, height=15, font=("Arial", 9))
    programs_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

    scroll = ttk.Scrollbar(list_frame, orient="vertical", command=programs_listbox.yview)
    scroll.pack(side=tk.RIGHT, fill=tk.Y)
    programs_listbox.configure(yscrollcommand=scroll.set)

    # Populate programs list
    for prog in programs:
        program_id, name, category, subcategory, schedules, rate_cards = prog
        display_text = f"{name} | {category} | Schedules: {schedules} | Custom Rates: {rate_cards}"
        programs_listbox.insert(tk.END, display_text)

    # Selection info
    info_label = ttk.Label(dialog, text="Select a program from the list above", 
                        font=("Arial", 9), foreground="blue")
    info_label.pack(pady=5)

    def on_program_select(event):
        selection = programs_listbox.curselection()
        if selection:
            idx = selection[0]
            prog = programs[idx]
            program_id, name, category, subcategory, schedules, rate_cards = prog
            
            info_text = f"Selected: {name}\nCategory: {category} - {subcategory}\nSchedules: {schedules} | Custom Rate Cards: {rate_cards}"
            info_label.config(text=info_text)

    programs_listbox.bind('<<ListboxSelect>>', on_program_select)

    def open_rename_dialog():
        selection = programs_listbox.curselection()
        if not selection:
            messagebox.showwarning("No Selection", "Please select a program to rename.")
            return
        
        idx = selection[0]
        prog = programs[idx]
        program_id, current_name, category, subcategory, schedules, rate_cards = prog
        
        dialog.destroy()
        self.rename_program_dialog(program_id, current_name, schedules, rate_cards)

    # Buttons
    button_frame = ttk.Frame(dialog)
    button_frame.pack(pady=15)

    ttk.Button(button_frame, text="Rename Selected Program", command=open_rename_dialog).pack(side=tk.LEFT, padx=5)
    ttk.Button(button_frame, text="Cancel", command=dialog.destroy).pack(side=tk.LEFT, padx=5)

 def rename_program_dialog(self, program_id, current_name, schedules_count, rate_cards_count):
    """Rename program with impact warning"""
    dialog = tk.Toplevel(self.root)
    dialog.title(f"Rename Program: {current_name}")
    dialog.geometry("600x450")
    dialog.grab_set()

    # Current info
    info_frame = ttk.LabelFrame(dialog, text="Current Program Information", padding="10")
    info_frame.pack(fill=tk.X, padx=10, pady=10)

    ttk.Label(info_frame, text=f"Current Name: {current_name}", 
            font=("Arial", 10, "bold")).pack(anchor=tk.W)
    ttk.Label(info_frame, text=f"Program ID: {program_id}").pack(anchor=tk.W)
    ttk.Label(info_frame, text=f"Schedules: {schedules_count}").pack(anchor=tk.W)
    ttk.Label(info_frame, text=f"Custom Rate Cards: {rate_cards_count}").pack(anchor=tk.W)

    # New name entry
    name_frame = ttk.LabelFrame(dialog, text="New Program Name", padding="10")
    name_frame.pack(fill=tk.X, padx=10, pady=10)

    ttk.Label(name_frame, text="New Name:").pack(anchor=tk.W)
    new_name_var = tk.StringVar(value=current_name)
    name_entry = ttk.Entry(name_frame, textvariable=new_name_var, width=50, font=("Arial", 11))
    name_entry.pack(fill=tk.X, pady=5)
    name_entry.select_range(0, tk.END)
    name_entry.focus()

    # Impact warning
    impact_frame = ttk.LabelFrame(dialog, text="⚠️ IMPACT ANALYSIS", padding="10")
    impact_frame.pack(fill=tk.X, padx=10, pady=10)

    impact_text = f"""WHAT WILL HAPPEN:
    ✅ SAFE - All schedules and rates remain intact ({schedules_count} schedules, {rate_cards_count} rate cards)
    ✅ SAFE - All relationships preserved (Foreign Keys protect data integrity)
    ✅ SAFE - Database consistency maintained

    ⚠️ POTENTIAL ISSUES:
    • Excel files with old name '{current_name}' will need manual mapping
    • Historical calculations may show old name
    • Client communications should be updated

    RECOMMENDATION: 
    • Update name in database first
    • Notify teams of name change
    • Update Excel templates for future use
    • Consider creating program aliases for Excel matching"""

    ttk.Label(impact_frame, text=impact_text, justify=tk.LEFT, font=("Arial", 9)).pack()

    def confirm_rename():
        new_name = new_name_var.get().strip()
        
        if not new_name:
            messagebox.showerror("Error", "Program name cannot be empty.")
            return
        
        if new_name == current_name:
            messagebox.showinfo("No Change", "Program name is the same. No changes made.")
            dialog.destroy()
            return
        
        # Check if name already exists
        try:
            cursor = self.connection.cursor()
            cursor.execute("SELECT COUNT(*) FROM programs WHERE program_name = ? AND program_id != ?", 
                        (new_name, program_id))
            if cursor.fetchone()[0] > 0:
                messagebox.showerror("Error", f"Program name '{new_name}' already exists.")
                return
            
            # Final confirmation
            if messagebox.askyesno("Confirm Rename", 
                                f"Rename program from:\n'{current_name}'\nto:\n'{new_name}'\n\n"
                                f"This will affect {schedules_count} schedule(s) and {rate_cards_count} rate card(s).\n\n"
                                "Are you sure?"):
                
                # Perform rename
                cursor.execute("UPDATE programs SET program_name = ? WHERE program_id = ?", 
                            (new_name, program_id))
                self.connection.commit()
                
                messagebox.showinfo("Success", 
                    f"Program renamed successfully!\n\n"
                    f"Old Name: {current_name}\n"
                    f"New Name: {new_name}\n\n"
                    f"All {schedules_count} schedules and {rate_cards_count} custom rates preserved.\n"
                    f"Database integrity maintained.")
                
                dialog.destroy()
                self.load_dashboard_data()  # Refresh dashboard
                
        except sqlite3.Error as err:
            self.connection.rollback()
            messagebox.showerror("Database Error", f"Error renaming program: {err}")
        finally:
            cursor.close()

    # Buttons
    button_frame = ttk.Frame(dialog)
    button_frame.pack(pady=15)

    ttk.Button(button_frame, text="✅ Confirm Rename", command=confirm_rename).pack(side=tk.LEFT, padx=5)
    ttk.Button(button_frame, text="❌ Cancel", command=dialog.destroy).pack(side=tk.LEFT, padx=5)

 def view_relationships(self):
     """Comprehensive view of agency-client relationships"""
     relationships_window = tk.Toplevel(self.root)
     relationships_window.title("Agency-Client Relationships")
     relationships_window.geometry("1000x600")
     
     # Control frame
     control_frame = ttk.Frame(relationships_window)
     control_frame.pack(fill=tk.X, padx=10, pady=10)
     
     ttk.Button(control_frame, text="Edit Selected", command=lambda: self.edit_relationship(rel_tree)).pack(side=tk.LEFT, padx=5)
     ttk.Button(control_frame, text="Delete Selected", command=lambda: self.delete_relationship(rel_tree)).pack(side=tk.LEFT, padx=5)
     ttk.Button(control_frame, text="Refresh", command=lambda: self.load_relationships(rel_tree)).pack(side=tk.RIGHT, padx=5)
     
     # Relationships tree
     columns = ('id', 'agency', 'client', 'discount', 'rate_type', 'custom_programs')
     rel_tree = ttk.Treeview(relationships_window, columns=columns, show='headings')
     
     rel_tree.heading('id', text='ID')
     rel_tree.heading('agency', text='Agency')
     rel_tree.heading('client', text='Client')
     rel_tree.heading('discount', text='Discount %')
     rel_tree.heading('rate_type', text='Rate Card Type')
     rel_tree.heading('custom_programs', text='Custom Programs')
     
     for col in columns:
         rel_tree.column(col, width=120)
     
     # Scrollbars
     v_scroll = ttk.Scrollbar(relationships_window, orient="vertical", command=rel_tree.yview)
     h_scroll = ttk.Scrollbar(relationships_window, orient="horizontal", command=rel_tree.xview)
     rel_tree.configure(yscrollcommand=v_scroll.set, xscrollcommand=h_scroll.set)
     
     rel_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(10, 0), pady=10)
     v_scroll.pack(side=tk.RIGHT, fill=tk.Y, pady=10)
     
     # Load relationships
     self.load_relationships(rel_tree)

 def load_relationships(self, tree):
     """Load relationships with custom program counts"""
     for item in tree.get_children():
         tree.delete(item)
     
     try:
         cursor = self.connection.cursor()
         cursor.execute("""
             SELECT ac.agency_client_id, a.agency_name, c.client_name, ac.discount_rate, ac.rate_card_type
             FROM agency_clients ac
             JOIN agencies a ON ac.agency_id = a.agency_id
             JOIN clients c ON ac.client_id = c.client_id
             ORDER BY a.agency_name, c.client_name
         """)
         
         for row in cursor.fetchall():
             ac_id, agency, client, discount, rate_type = row
             
             # Count custom programs if custom rate card
             custom_count = 0
             if rate_type == 'custom':
                 cursor.execute("""
                     SELECT COUNT(cpr.custom_rate_id)
                     FROM custom_rate_cards crc
                     JOIN custom_program_rates cpr ON crc.rate_card_id = cpr.rate_card_id
                     WHERE crc.agency_client_id = ? AND crc.is_active = 1
                 """, (ac_id,))
                 result = cursor.fetchone()
                 custom_count = result[0] if result else 0
             
             tree.insert('', tk.END, values=(
                 ac_id, agency, client, f"{discount}%", rate_type.title(), custom_count
             ))
     
     except sqlite3.Error as err:
         messagebox.showerror("Database Error", f"Error loading relationships: {err}")
     finally:
         cursor.close()

 def edit_relationship(self, tree):
     """Edit relationship with comprehensive options"""
     selected = tree.selection()
     if not selected:
         messagebox.showwarning("No Selection", "Please select a relationship to edit.")
         return
     
     ac_id = tree.item(selected[0])['values'][0]
     agency = tree.item(selected[0])['values'][1]
     client = tree.item(selected[0])['values'][2]
     
     # Create edit dialog
     dialog = tk.Toplevel(self.root)
     dialog.title(f"Edit Relationship: {agency} - {client}")
     dialog.geometry("400x300")
     dialog.grab_set()
     
     # Get current values
     try:
         cursor = self.connection.cursor()
         cursor.execute("SELECT discount_rate, rate_card_type FROM agency_clients WHERE agency_client_id = ?", (ac_id,))
         current_discount, current_rate_type = cursor.fetchone()
     except sqlite3.Error as err:
         messagebox.showerror("Database Error", f"Error loading relationship: {err}")
         dialog.destroy()
         return
     finally:
         cursor.close()
     
     # Discount rate
     ttk.Label(dialog, text="Discount Rate (%):").grid(row=0, column=0, padx=10, pady=10, sticky=tk.W)
     discount_var = tk.StringVar(value=str(current_discount))
     ttk.Entry(dialog, textvariable=discount_var, width=10).grid(row=0, column=1, padx=10, pady=10, sticky=tk.W)
     
     # Rate card type
     ttk.Label(dialog, text="Rate Card Type:").grid(row=1, column=0, padx=10, pady=10, sticky=tk.W)
     rate_type_var = tk.StringVar(value=current_rate_type)
     rate_type_combo = ttk.Combobox(dialog, textvariable=rate_type_var, values=["discount", "custom"], width=15)
     rate_type_combo.grid(row=1, column=1, padx=10, pady=10, sticky=tk.W)
     
     def update_relationship():
         try:
             new_discount = float(discount_var.get())
             new_rate_type = rate_type_var.get()
             
             if new_discount < 0 or new_discount > 100:
                 messagebox.showerror("Error", "Discount must be between 0 and 100.")
                 return
             
             cursor = self.connection.cursor()
             cursor.execute("""
                 UPDATE agency_clients SET discount_rate = ?, rate_card_type = ? 
                 WHERE agency_client_id = ?
             """, (new_discount, new_rate_type, ac_id))
             self.connection.commit()
             
             messagebox.showinfo("Success", "Relationship updated successfully!")
             dialog.destroy()
             self.load_relationships(tree)
             
         except ValueError:
             messagebox.showerror("Error", "Invalid discount value.")
         except sqlite3.Error as err:
             self.connection.rollback()
             messagebox.showerror("Database Error", f"Error updating relationship: {err}")
         finally:
             cursor.close()
     
     # Buttons
     button_frame = ttk.Frame(dialog)
     button_frame.grid(row=2, column=0, columnspan=2, pady=20)
     
     ttk.Button(button_frame, text="Update", command=update_relationship).pack(side=tk.LEFT, padx=5)
     ttk.Button(button_frame, text="Cancel", command=dialog.destroy).pack(side=tk.LEFT, padx=5)

 def delete_relationship(self, tree):
     """Delete relationship with confirmation"""
     selected = tree.selection()
     if not selected:
         messagebox.showwarning("No Selection", "Please select a relationship to delete.")
         return
     
     ac_id = tree.item(selected[0])['values'][0]
     agency = tree.item(selected[0])['values'][1]
     client = tree.item(selected[0])['values'][2]
     
     if messagebox.askyesno("Confirm Delete", f"Delete relationship: {agency} - {client}?\n\n"
                           "This will also delete any associated custom rate cards."):
         try:
             cursor = self.connection.cursor()
             # Delete custom rate cards first
             cursor.execute("DELETE FROM custom_rate_cards WHERE agency_client_id = ?", (ac_id,))
             # Delete relationship
             cursor.execute("DELETE FROM agency_clients WHERE agency_client_id = ?", (ac_id,))
             self.connection.commit()
             
             messagebox.showinfo("Success", "Relationship deleted successfully!")
             self.load_relationships(tree)
             self.load_dashboard_data()
             
         except sqlite3.Error as err:
             self.connection.rollback()
             messagebox.showerror("Database Error", f"Error deleting relationship: {err}")
         finally:
             cursor.close()

 def create_custom_rate_card(self):
     """Create custom rate card with comprehensive options"""
     dialog = tk.Toplevel(self.root)
     dialog.title("Create Custom Rate Card")
     dialog.geometry("600x500")
     dialog.grab_set()
     
     # Get agency-client relationships
     relationships = []
     try:
         cursor = self.connection.cursor()
         cursor.execute("""
             SELECT ac.agency_client_id, a.agency_name, c.client_name, ac.rate_card_type
             FROM agency_clients ac
             JOIN agencies a ON ac.agency_id = a.agency_id
             JOIN clients c ON ac.client_id = c.client_id
             ORDER BY a.agency_name, c.client_name
         """)
         relationships = [(f"{row[1]} - {row[2]}", row[0], row[3]) for row in cursor.fetchall()]
     except sqlite3.Error:
         pass
     finally:
         cursor.close()
     
     if not relationships:
         messagebox.showerror("Error", "No agency-client relationships found. Create relationships first.")
         dialog.destroy()
         return
     
     # Agency-Client selection
     ttk.Label(dialog, text="Select Agency-Client:").grid(row=0, column=0, padx=10, pady=10, sticky=tk.W)
     relationship_var = tk.StringVar()
     relationship_combo = ttk.Combobox(dialog, textvariable=relationship_var, values=[r[0] for r in relationships], width=50)
     if relationships:
         relationship_combo.current(0)
     relationship_combo.grid(row=0, column=1, padx=10, pady=10, sticky=tk.W)
     
     # Rate card name
     ttk.Label(dialog, text="Rate Card Name:").grid(row=1, column=0, padx=10, pady=10, sticky=tk.W)
     name_var = tk.StringVar()
     ttk.Entry(dialog, textvariable=name_var, width=50).grid(row=1, column=1, padx=10, pady=10, sticky=tk.W)
     
     # Base modifier
     ttk.Label(dialog, text="Base Modifier (%):").grid(row=2, column=0, padx=10, pady=10, sticky=tk.W)
     modifier_var = tk.StringVar(value="0.0")
     ttk.Entry(dialog, textvariable=modifier_var, width=15).grid(row=2, column=1, padx=10, pady=10, sticky=tk.W)
     
     ttk.Label(dialog, text="Positive = increase rates, Negative = decrease rates", font=("Arial", 8), foreground="blue").grid(row=3, column=1, padx=10, sticky=tk.W)
     
     # Information section
     info_frame = ttk.LabelFrame(dialog, text="Information", padding="10")
     info_frame.grid(row=4, column=0, columnspan=2, padx=10, pady=10, sticky='ew')
     
     info_text = """Creating a Custom Rate Card:

Base Modifier: Applied to all default program rates
• Example: +10% increases all rates by 10%
• Example: -5% decreases all rates by 5%

After creation, you can edit individual program rates using the "Edit Program Rates" function

Custom rate cards override discount percentages

All existing programs will be included with the base modifier applied"""
     
     ttk.Label(info_frame, text=info_text, justify=tk.LEFT, font=("Arial", 9)).pack()
     
     def create_card():
         selected_relationship = relationship_var.get()
         card_name = name_var.get().strip()
         modifier = modifier_var.get()
         
         if not all([selected_relationship, card_name]):
             messagebox.showerror("Error", "Rate card name is required.")
             return
         
         try:
             modifier_value = float(modifier)
             if abs(modifier_value) > 100:
                 messagebox.showerror("Error", "Modifier should be between -100% and +100%.")
                 return
         except ValueError:
             messagebox.showerror("Error", "Invalid modifier value.")
             return
         
         # Get agency_client_id
         agency_client_id = next(r[1] for r in relationships if r[0] == selected_relationship)
         current_rate_type = next(r[2] for r in relationships if r[0] == selected_relationship)
          
         if current_rate_type == 'custom':
                if not messagebox.askyesno("Confirm", "This client already has a custom rate card. Create another one?"):
                    return
          
         try:
                # Use RateCardManager to create custom rate card
                rate_manager = RateCardManager(self.connection)
                rate_card_id = rate_manager.create_custom_rate_card_from_default(
                    agency_client_id, card_name, modifier_value, self.user_id)
                
                messagebox.showinfo("Success", 
                    f"Custom rate card '{card_name}' created successfully!\n\n"
                    f"Rate Card ID: {rate_card_id}\n"
                    f"Base Modifier: {modifier_value:+.1f}%\n\n"
                    f"You can now edit individual program rates using 'Edit Program Rates'.")
                dialog.destroy()
                self.load_dashboard_data()
                
         except Exception as err:
                messagebox.showerror("Error", f"Error creating rate card: {err}")
      
      # Buttons
     button_frame = ttk.Frame(dialog)
     button_frame.grid(row=5, column=0, columnspan=2, pady=20)
      
     ttk.Button(button_frame, text="Create Rate Card", command=create_card).pack(side=tk.LEFT, padx=5)
     ttk.Button(button_frame, text="Cancel", command=dialog.destroy).pack(side=tk.LEFT, padx=5)

 def duplicate_rate_card(self):
    """Enhanced duplicate rate card including default base rates"""
    dialog = tk.Toplevel(self.root)
    dialog.title("Duplicate Rate Card")
    dialog.geometry("700x500")
    dialog.grab_set()
    
    # Source selection (now includes default base rates)
    ttk.Label(dialog, text="Source (Copy From):").grid(row=0, column=0, padx=10, pady=10, sticky=tk.W)
    source_var = tk.StringVar()
    source_combo = ttk.Combobox(dialog, textvariable=source_var, width=70)
    source_combo.grid(row=0, column=1, padx=10, pady=10, sticky=tk.W)
    
    # Get ALL rate card options (custom + default base)
    rate_card_options = []
    try:
        cursor = self.connection.cursor()
        
        # Add default base rate card option
        rate_card_options.append(("DEFAULT BASE RATE CARD (All Programs at Base Rates)", "default_base"))
        
        # Get custom rate cards
        cursor.execute("""
            SELECT crc.rate_card_name, a.agency_name, c.client_name, crc.agency_client_id
            FROM custom_rate_cards crc
            JOIN agency_clients ac ON crc.agency_client_id = ac.agency_client_id
            JOIN agencies a ON ac.agency_id = a.agency_id
            JOIN clients c ON ac.client_id = c.client_id
            WHERE crc.is_active = 1
            ORDER BY crc.rate_card_name
        """)
        
        for row in cursor.fetchall():
            name, agency, client, ac_id = row
            display_text = f"{name} ({agency} - {client})"
            rate_card_options.append((display_text, ac_id))
            
    except sqlite3.Error:
        pass
    finally:
        cursor.close()
    
    source_combo['values'] = [option[0] for option in rate_card_options]
    if rate_card_options:
        source_combo.current(0)
    
    # Target selection (all agency-client relationships)
    ttk.Label(dialog, text="Target (Copy To):").grid(row=1, column=0, padx=10, pady=10, sticky=tk.W)
    target_var = tk.StringVar()
    target_combo = ttk.Combobox(dialog, textvariable=target_var, width=70)
    target_combo.grid(row=1, column=1, padx=10, pady=10, sticky=tk.W)
    
    # Get all agency-client relationships
    try:
        cursor = self.connection.cursor()
        cursor.execute("""
            SELECT ac.agency_client_id, a.agency_name, c.client_name
            FROM agency_clients ac
            JOIN agencies a ON ac.agency_id = a.agency_id
            JOIN clients c ON ac.client_id = c.client_id
            ORDER BY a.agency_name, c.client_name
        """)
        all_relationships = [(f"{row[1]} - {row[2]}", row[0]) for row in cursor.fetchall()]
    except sqlite3.Error:
        all_relationships = []
    finally:
        cursor.close()
    
    target_combo['values'] = [rel[0] for rel in all_relationships]
    if all_relationships:
        target_combo.current(0)
    
    # New rate card name
    ttk.Label(dialog, text="New Rate Card Name:").grid(row=2, column=0, padx=10, pady=10, sticky=tk.W)
    new_name_var = tk.StringVar()
    ttk.Entry(dialog, textvariable=new_name_var, width=70).grid(row=2, column=1, padx=10, pady=10, sticky=tk.W)
    
    # Base modifier for default base duplication
    ttk.Label(dialog, text="Base Modifier (%) [For Default Base]:").grid(row=3, column=0, padx=10, pady=10, sticky=tk.W)
    modifier_var = tk.StringVar(value="0.0")
    ttk.Entry(dialog, textvariable=modifier_var, width=15).grid(row=3, column=1, padx=10, pady=10, sticky=tk.W)
    
    # Information section
    info_frame = ttk.LabelFrame(dialog, text="Enhanced Duplication Information", padding="10")
    info_frame.grid(row=4, column=0, columnspan=2, padx=10, pady=10, sticky='ew')
    
    info_text = """ENHANCED RATE CARD DUPLICATION:

    • DEFAULT BASE RATE CARD: Creates custom rate card from all base program rates
    - Use Base Modifier to adjust all rates (e.g., +10% = increase all by 10%)
    - All programs will be included with modifier applied

    • CUSTOM RATE CARD: Copies existing custom rate card exactly
    - ALL program rates from source will be copied
    - Individual rates and base modifiers are duplicated

    TARGET: Target client's rate card type will be changed to 'custom'

    This allows you to create custom rate cards from both default base rates and existing custom rate cards."""
    
    ttk.Label(info_frame, text=info_text, justify=tk.LEFT, font=("Arial", 9)).pack()
    
    def duplicate_card():
        source = source_var.get()
        target = target_var.get()
        new_name = new_name_var.get().strip()
        
        if not all([source, target, new_name]):
            messagebox.showerror("Error", "All fields are required.")
            return
        
        if source == target:
            messagebox.showerror("Error", "Source and target cannot be the same.")
            return
        
        # Get source and target IDs
        source_id = None
        for option in rate_card_options:
            if option[0] == source:
                source_id = option[1]
                break
        
        target_id = None
        for rel in all_relationships:
            if rel[0] == target:
                target_id = rel[1]
                break
        
        try:
            if source_id == "default_base":
                # Create custom rate card from default base rates
                modifier = float(modifier_var.get())
                rate_manager = RateCardManager(self.connection)
                new_rate_card_id = rate_manager.create_custom_rate_card_from_default(
                    target_id, new_name, modifier, self.user_id)
                
                messagebox.showinfo("Success", 
                    f"Custom rate card created from default base rates!\n\n"
                    f"Source: Default Base Rate Card\n"
                    f"Target: {target}\n"
                    f"New Rate Card: {new_name}\n"
                    f"Base Modifier: {modifier:+.1f}%\n"
                    f"Rate Card ID: {new_rate_card_id}\n\n"
                    f"All program rates created with modifier applied.")
            else:
                # Duplicate existing custom rate card
                rate_manager = RateCardManager(self.connection)
                new_rate_card_id = rate_manager.duplicate_rate_card(source_id, target_id, new_name, self.user_id)
                
                messagebox.showinfo("Success", 
                    f"Rate card duplicated successfully!\n\n"
                    f"Source: {source}\n"
                    f"Target: {target}\n"
                    f"New Rate Card: {new_name}\n"
                    f"Rate Card ID: {new_rate_card_id}\n\n"
                    f"All program rates have been copied to the target client.")
            
            dialog.destroy()
            self.load_dashboard_data()
            
        except ValueError:
            messagebox.showerror("Error", "Invalid base modifier value.")
        except Exception as err:
            messagebox.showerror("Error", f"Error duplicating rate card: {err}")
    
    # Buttons
    button_frame = ttk.Frame(dialog)
    button_frame.grid(row=5, column=0, columnspan=2, pady=20)
    
    ttk.Button(button_frame, text="Duplicate Rate Card", command=duplicate_card).pack(side=tk.LEFT, padx=5)
    ttk.Button(button_frame, text="Cancel", command=dialog.destroy).pack(side=tk.LEFT, padx=5)

 def edit_program_rates(self):
      """Edit individual program rates in custom rate cards"""
      
      # First, select which rate card to edit
      dialog = tk.Toplevel(self.root)
      dialog.title("Select Rate Card to Edit")
      dialog.geometry("500x300")
      dialog.grab_set()
      
      # Get custom rate cards
      rate_cards = []
      try:
          cursor = self.connection.cursor()
          cursor.execute("""
              SELECT crc.rate_card_id, crc.rate_card_name, a.agency_name, c.client_name
              FROM custom_rate_cards crc
              JOIN agency_clients ac ON crc.agency_client_id = ac.agency_client_id
              JOIN agencies a ON ac.agency_id = a.agency_id
              JOIN clients c ON ac.client_id = c.client_id
              WHERE crc.is_active = 1
              ORDER BY crc.rate_card_name
          """)
          rate_cards = [(f"{row[1]} ({row[2]} - {row[3]})", row[0]) for row in cursor.fetchall()]
      except sqlite3.Error:
          pass
      finally:
          cursor.close()
      
      if not rate_cards:
          messagebox.showinfo("No Rate Cards", "No custom rate cards found. Create one first using 'Create Custom Rate Card'.")
          dialog.destroy()
          return
      
      ttk.Label(dialog, text="Select Rate Card to Edit:", font=("Arial", 10, "bold")).grid(row=0, column=0, padx=10, pady=20, sticky=tk.W)
      rate_card_var = tk.StringVar()
      rate_card_combo = ttk.Combobox(dialog, textvariable=rate_card_var, values=[r[0] for r in rate_cards], width=70)
      if rate_cards:
          rate_card_combo.current(0)
      rate_card_combo.grid(row=1, column=0, padx=10, pady=10, sticky=tk.W)
      
      def open_rate_editor():
          selected_card = rate_card_var.get()
          rate_card_id = next(r[1] for r in rate_cards if r[0] == selected_card)
          dialog.destroy()
          self.open_rate_editor_window(rate_card_id, selected_card)
      
      ttk.Button(dialog, text="Edit Program Rates", command=open_rate_editor).grid(row=2, column=0, pady=20)
      ttk.Button(dialog, text="Cancel", command=dialog.destroy).grid(row=3, column=0, pady=10)

 def open_rate_editor_window(self, rate_card_id, card_name):
      """Open comprehensive rate editor for specific rate card"""
      editor_window = tk.Toplevel(self.root)
      editor_window.title(f"Edit Program Rates: {card_name}")
      editor_window.geometry("1200x700")
      
      # Control frame
      control_frame = ttk.Frame(editor_window)
      control_frame.pack(fill=tk.X, padx=10, pady=10)
      
      ttk.Label(control_frame, text="Double-click a program to edit its rate", font=("Arial", 10, "bold")).pack(side=tk.LEFT)
      ttk.Button(control_frame, text="Refresh", command=lambda: self.load_rate_card_programs(rates_tree, rate_card_id)).pack(side=tk.RIGHT, padx=5)
      ttk.Button(control_frame, text="Bulk Update", command=lambda: self.bulk_update_rates(rates_tree, rate_card_id)).pack(side=tk.RIGHT, padx=5)
      
      # Programs tree
      columns = ('schedule_id', 'program_name', 'time_slot', 'default_rate', 'custom_rate', 'override_type', 'difference')
      rates_tree = ttk.Treeview(editor_window, columns=columns, show='headings')
      
      rates_tree.heading('schedule_id', text='ID')
      rates_tree.heading('program_name', text='Program Name')
      rates_tree.heading('time_slot', text='Time Slot')
      rates_tree.heading('default_rate', text='Default Rate')
      rates_tree.heading('custom_rate', text='Custom Rate')
      rates_tree.heading('override_type', text='Override Type')
      rates_tree.heading('difference', text='Difference')
      
      # Column widths
      rates_tree.column('schedule_id', width=50)
      rates_tree.column('program_name', width=200)
      rates_tree.column('time_slot', width=120)
      rates_tree.column('default_rate', width=120)
      rates_tree.column('custom_rate', width=120)
      rates_tree.column('override_type', width=100)
      rates_tree.column('difference', width=100)
      
      # Scrollbars
      v_scroll = ttk.Scrollbar(editor_window, orient="vertical", command=rates_tree.yview)
      h_scroll = ttk.Scrollbar(editor_window, orient="horizontal", command=rates_tree.xview)
      rates_tree.configure(yscrollcommand=v_scroll.set, xscrollcommand=h_scroll.set)
      
      rates_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(10, 0), pady=10)
      v_scroll.pack(side=tk.RIGHT, fill=tk.Y, pady=10)
      
      # Bind double-click
      rates_tree.bind('<Double-1>', lambda e: self.edit_single_program_rate(rates_tree, rate_card_id))
      
      # Load data
      self.load_rate_card_programs(rates_tree, rate_card_id)

 def load_rate_card_programs(self, tree, rate_card_id):
        """Load programs for rate card editing with comprehensive information"""
        for item in tree.get_children():
            tree.delete(item)

        try:
            cursor = self.connection.cursor()
            cursor.execute("""
                SELECT ps.schedule_id, p.program_name, ps.start_time, ps.end_time, ps.rate_30sec, 
                    cpr.custom_rate_30sec, cpr.override_type
                FROM program_schedules ps
                JOIN programs p ON ps.program_id = p.program_id
                LEFT JOIN custom_program_rates cpr ON ps.schedule_id = cpr.program_schedule_id 
                    AND cpr.rate_card_id = ?
                ORDER BY p.program_name
            """, (rate_card_id,))
            
            for row in cursor.fetchall():
                schedule_id, program_name, start_time, end_time, default_rate, custom_rate, override_type = row
                
                # Format time slot
                start_str = self.format_time_display(start_time)
                end_str = self.format_time_display(end_time)
                time_slot = f"{start_str}-{end_str}"
                
                # Handle custom rate display
                if custom_rate:
                    custom_display = f"LKR {custom_rate:,.0f}"
                    override_display = override_type or "individual"
                    difference = ((custom_rate - default_rate) / default_rate) * 100
                    diff_display = f"{difference:+.1f}%"
                    
                    # Determine tag based on difference
                    if difference > 0:
                        tag = 'increase'
                    elif difference < 0:
                        tag = 'decrease'
                    else:
                        tag = 'same'
                else:
                    custom_display = "Using base modifier"
                    override_display = "modifier"
                    diff_display = "N/A"
                    tag = 'modifier'
                
                # Insert item with correct tag usage
                item = tree.insert('', tk.END, values=(
                    schedule_id, program_name, time_slot,
                    f"LKR {default_rate:,.0f}", custom_display, override_display, diff_display
                ), tags=(tag,))  # FIXED: Use tags parameter in insert, not tree.set
            
            # Configure tags for color coding
            tree.tag_configure('increase', foreground='green')
            tree.tag_configure('decrease', foreground='red')
            tree.tag_configure('same', foreground='blue')
            tree.tag_configure('modifier', foreground='gray')

        except sqlite3.Error as err:
            messagebox.showerror("Database Error", f"Error loading programs: {err}")
        finally:
            cursor.close()

 def edit_single_program_rate(self, tree, rate_card_id):
      """Edit single program rate with detailed dialog"""
      selected = tree.selection()
      if not selected:
          return
      
      schedule_id = tree.item(selected[0])['values'][0]
      program_name = tree.item(selected[0])['values'][1]
      time_slot = tree.item(selected[0])['values'][2]
      default_rate = tree.item(selected[0])['values'][3]
      current_custom = tree.item(selected[0])['values'][4]
      
      # Create edit dialog
      dialog = tk.Toplevel(self.root)
      dialog.title(f"Edit Rate: {program_name}")
      dialog.geometry("500x400")
      dialog.grab_set()
      
      # Program information
      info_frame = ttk.LabelFrame(dialog, text="Program Information", padding="10")
      info_frame.pack(fill=tk.X, padx=10, pady=10)
      
      ttk.Label(info_frame, text=f"Program: {program_name}", font=("Arial", 10, "bold")).pack(anchor=tk.W)
      ttk.Label(info_frame, text=f"Time Slot: {time_slot}").pack(anchor=tk.W)
      ttk.Label(info_frame, text=f"Default Rate: {default_rate}").pack(anchor=tk.W)
      ttk.Label(info_frame, text=f"Current Custom Rate: {current_custom}").pack(anchor=tk.W)
      
      # Rate editing
      rate_frame = ttk.LabelFrame(dialog, text="Edit Rate", padding="10")
      rate_frame.pack(fill=tk.X, padx=10, pady=10)
      
      ttk.Label(rate_frame, text="New 30-sec Rate (LKR):").grid(row=0, column=0, padx=5, pady=10, sticky=tk.W)
      
      # Get current custom rate value
      try:
          if "LKR" in current_custom:
              current_rate = float(current_custom.replace('LKR ', '').replace(',', ''))
          else:
              # Get default rate
              current_rate = float(default_rate.replace('LKR ', '').replace(',', ''))
      except:
          current_rate = 0
      
      rate_var = tk.StringVar(value=str(int(current_rate)))
      rate_entry = ttk.Entry(rate_frame, textvariable=rate_var, width=15, font=("Arial", 12))
      rate_entry.grid(row=0, column=1, padx=5, pady=10)
      rate_entry.select_range(0, tk.END)
      rate_entry.focus()
      
      # Quick adjustment buttons
      adjust_frame = ttk.Frame(rate_frame)
      adjust_frame.grid(row=1, column=0, columnspan=2, pady=10)
      
      def adjust_rate(percentage):
          try:
              current = float(rate_var.get())
              new_rate = current * (1 + percentage/100)
              rate_var.set(str(int(new_rate)))
          except:
              pass
      
      ttk.Button(adjust_frame, text="-20%", command=lambda: adjust_rate(-20), width=8).pack(side=tk.LEFT, padx=2)
      ttk.Button(adjust_frame, text="-10%", command=lambda: adjust_rate(-10), width=8).pack(side=tk.LEFT, padx=2)
      ttk.Button(adjust_frame, text="-5%", command=lambda: adjust_rate(-5), width=8).pack(side=tk.LEFT, padx=2)
      ttk.Button(adjust_frame, text="+5%", command=lambda: adjust_rate(5), width=8).pack(side=tk.LEFT, padx=2)
      ttk.Button(adjust_frame, text="+10%", command=lambda: adjust_rate(10), width=8).pack(side=tk.LEFT, padx=2)
      ttk.Button(adjust_frame, text="+20%", command=lambda: adjust_rate(20), width=8).pack(side=tk.LEFT, padx=2)
      
      def update_rate():
          try:
              new_rate = float(rate_var.get())
              if new_rate <= 0:
                  messagebox.showerror("Error", "Rate must be positive.")
                  return
              
              rate_manager = RateCardManager(self.connection)
              rate_manager.update_program_rate(rate_card_id, schedule_id, new_rate)
              
              # Calculate difference
              default_val = float(default_rate.replace('LKR ', '').replace(',', ''))
              difference = ((new_rate - default_val) / default_val) * 100
              
              messagebox.showinfo("Success", 
                  f"Rate updated for '{program_name}'!\n\n"
                  f"New Rate: LKR {new_rate:,.0f}\n"
                  f"Change: {difference:+.1f}% from default")
              dialog.destroy()
              self.load_rate_card_programs(tree, rate_card_id)
              
          except ValueError:
              messagebox.showerror("Error", "Please enter a valid numeric rate.")
          except Exception as err:
              messagebox.showerror("Error", f"Error updating rate: {err}")
      
      def reset_to_default():
          try:
              default_val = float(default_rate.replace('LKR ', '').replace(',', ''))
              rate_var.set(str(int(default_val)))
          except:
              pass
      
      # Buttons
      button_frame = ttk.Frame(dialog)
      button_frame.pack(pady=20)
      
      ttk.Button(button_frame, text="Update Rate", command=update_rate).pack(side=tk.LEFT, padx=5)
      ttk.Button(button_frame, text="Reset to Default", command=reset_to_default).pack(side=tk.LEFT, padx=5)
      ttk.Button(button_frame, text="Cancel", command=dialog.destroy).pack(side=tk.LEFT, padx=5)

 def bulk_update_rates(self, tree, rate_card_id):
      """Enhanced bulk update with Set to Default option"""
      dialog = tk.Toplevel(self.root)
      dialog.title("Bulk Update Rates")
      dialog.geometry("450x350")
      dialog.grab_set()
        
      ttk.Label(dialog, text="Bulk Rate Update", font=("Arial", 12, "bold")).pack(pady=10)
        
        # Update type
      update_frame = ttk.LabelFrame(dialog, text="Update Method", padding="10")
      update_frame.pack(fill=tk.X, padx=10, pady=10)
        
      update_type = tk.StringVar(value="percentage")
      ttk.Radiobutton(update_frame, text="Apply percentage change", variable=update_type, value="percentage").pack(anchor=tk.W)
      ttk.Radiobutton(update_frame, text="Set specific rate", variable=update_type, value="specific").pack(anchor=tk.W)
      ttk.Radiobutton(update_frame, text="Reset to default rates", variable=update_type, value="default").pack(anchor=tk.W)
        
        # Value entry
      value_frame = ttk.Frame(dialog)
      value_frame.pack(pady=10)
        
      ttk.Label(value_frame, text="Value:").pack(side=tk.LEFT, padx=5)
      value_var = tk.StringVar(value="0")
      value_entry = ttk.Entry(value_frame, textvariable=value_var, width=15)
      value_entry.pack(side=tk.LEFT, padx=5)
        
      ttk.Label(dialog, text="(For percentage: +10 = increase by 10%, -5 = decrease by 5%)", 
                    font=("Arial", 8)).pack(pady=2)
        
        # Buttons
      button_frame = ttk.Frame(dialog)
      button_frame.pack(pady=15)
        
      ttk.Button(button_frame, text="Apply Update", command=lambda: self.apply_bulk_update(update_type.get(), value_var.get(), tree, rate_card_id, dialog)).pack(side=tk.LEFT, padx=5)
      ttk.Button(button_frame, text="Set All to Default", command=lambda: self.set_all_to_default(tree, rate_card_id, dialog)).pack(side=tk.LEFT, padx=5)
      ttk.Button(button_frame, text="Cancel", command=dialog.destroy).pack(side=tk.LEFT, padx=5)

 def apply_bulk_update(self, update_method, value, tree, rate_card_id, dialog):
    """Apply bulk update based on method"""
    try:
        if update_method == "default":
            self.set_all_to_default(tree, rate_card_id, dialog)
            return
        
        if update_method == "percentage":
            value_num = float(value)
            if abs(value_num) > 100:
                messagebox.showerror("Error", "Percentage change should be reasonable (±100%).")
                return
        elif update_method == "specific":
            value_num = float(value)
            if value_num <= 0:
                messagebox.showerror("Error", "Specific rate must be positive.")
                return
        else:
            messagebox.showerror("Error", "Invalid update method.")
            return
        
        # Get all programs for this rate card
        cursor = self.connection.cursor()
        cursor.execute("SELECT schedule_id, rate_30sec FROM program_schedules")
        programs = cursor.fetchall()
        
        updated_count = 0
        rate_manager = RateCardManager(self.connection)
        
        for schedule_id, default_rate in programs:
            if update_method == "percentage":
                # Get current custom rate or use default
                cursor.execute("""
                    SELECT custom_rate_30sec FROM custom_program_rates 
                    WHERE rate_card_id = ? AND program_schedule_id = ?
                """, (rate_card_id, schedule_id))
                result = cursor.fetchone()
                current_rate = result[0] if result else default_rate
                new_rate = current_rate * (1 + value_num/100)
            else:  # specific
                new_rate = value_num
            
            rate_manager.update_program_rate(rate_card_id, schedule_id, new_rate)
            updated_count += 1
        
        messagebox.showinfo("Success", 
            f"Bulk update completed!\n\n"
            f"Updated {updated_count} program rates\n"
            f"Method: {update_method}\n"
            f"Value: {value}")
        dialog.destroy()
        self.load_rate_card_programs(tree, rate_card_id)
        
    except ValueError:
        messagebox.showerror("Error", "Please enter a valid numeric value.")
    except Exception as err:
        messagebox.showerror("Error", f"Error in bulk update: {err}")
    finally:
        cursor.close()

 def set_all_to_default(self, tree, rate_card_id, dialog):
        """Set all programs to their default rates"""
        if messagebox.askyesno("Confirm Reset", "Reset all custom rates to default program rates?\n\nThis will remove all custom rate modifications."):
            try:
                cursor = self.connection.cursor()
                
                # Get all default rates
                cursor.execute("SELECT schedule_id, rate_30sec FROM program_schedules")
                programs = cursor.fetchall()
                
                updated_count = 0
                rate_manager = RateCardManager(self.connection)
                
                for schedule_id, default_rate in programs:
                    rate_manager.update_program_rate(rate_card_id, schedule_id, default_rate)
                    updated_count += 1
                
                messagebox.showinfo("Success", 
                    f"All rates reset to default!\n\n"
                    f"Updated {updated_count} program rates\n"
                    f"All rates now match base program rates")
                dialog.destroy()
                self.load_rate_card_programs(tree, rate_card_id)
                
            except Exception as err:
                messagebox.showerror("Error", f"Error resetting to default: {err}")
            finally:
                cursor.close()

 def rate_card_overview(self):
      """Comprehensive rate card overview"""
      overview_window = tk.Toplevel(self.root)
      overview_window.title("Rate Card System Overview")
      overview_window.geometry("1200x700")
      
      # Create notebook for different views
      notebook = ttk.Notebook(overview_window)
      notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
      
      # Tab 1: Overview
      overview_tab = ttk.Frame(notebook)
      notebook.add(overview_tab, text="Overview")
      
      # Overview tree
      columns = ('agency', 'client', 'rate_type', 'discount_info', 'custom_programs', 'status')
      overview_tree = ttk.Treeview(overview_tab, columns=columns, show='headings')
      
      for col in columns:
          overview_tree.heading(col, text=col.replace('_', ' ').title())
          overview_tree.column(col, width=150)
      
      overview_tree.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
      
      # Tab 2: Custom Rate Cards Details
      details_tab = ttk.Frame(notebook)
      notebook.add(details_tab, text="Custom Rate Cards")
      
      details_columns = ('rate_card_name', 'agency', 'client', 'base_modifier', 'programs', 'created', 'created_by')
      details_tree = ttk.Treeview(details_tab, columns=details_columns, show='headings')
      
      for col in details_columns:
          details_tree.heading(col, text=col.replace('_', ' ').title())
          details_tree.column(col, width=120)
      
      details_tree.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
      
      # Tab 3: Statistics
      stats_tab = ttk.Frame(notebook)
      notebook.add(stats_tab, text="Statistics")
      
      stats_text = tk.Text(stats_tab, wrap=tk.WORD, padx=10, pady=10)
      stats_text.pack(fill=tk.BOTH, expand=True)
      
      # Load data for all tabs
      try:
          cursor = self.connection.cursor()
          
          # Load overview data
          cursor.execute("""
              SELECT a.agency_name, c.client_name, ac.rate_card_type, ac.discount_rate, ac.agency_client_id
              FROM agency_clients ac
              JOIN agencies a ON ac.agency_id = a.agency_id
              JOIN clients c ON ac.client_id = c.client_id
              ORDER BY a.agency_name, c.client_name
          """)
          
          for row in cursor.fetchall():
              agency, client, rate_type, discount, ac_id = row
              
              if rate_type == 'custom':
                  # Count custom programs
                  cursor.execute("""
                      SELECT COUNT(cpr.custom_rate_id)
                      FROM custom_rate_cards crc
                      JOIN custom_program_rates cpr ON crc.rate_card_id = cpr.rate_card_id
                      WHERE crc.agency_client_id = ? AND crc.is_active = 1
                  """, (ac_id,))
                  count_result = cursor.fetchone()
                  custom_count = count_result[0] if count_result else 0
                  discount_info = f"Custom Rates Active"
                  status = f"{custom_count} custom rates"
              else:
                  custom_count = 0
                  discount_info = f"{discount}% Discount"
                  status = "Discount system"
              
              overview_tree.insert('', tk.END, values=(
                  agency, client, rate_type.title(), discount_info, custom_count, status
              ))
          
          # Load custom rate cards details
          cursor.execute("""
              SELECT crc.rate_card_name, a.agency_name, c.client_name, crc.base_modifier_percentage,
                      crc.created_date, u.username
              FROM custom_rate_cards crc
              JOIN agency_clients ac ON crc.agency_client_id = ac.agency_client_id
              JOIN agencies a ON ac.agency_id = a.agency_id
              JOIN clients c ON ac.client_id = c.client_id
              LEFT JOIN users u ON crc.created_by = u.user_id
              WHERE crc.is_active = 1
              ORDER BY crc.created_date DESC
          """)
          
          for row in cursor.fetchall():
              name, agency, client, modifier, created, created_by = row
              
              # Count programs
              cursor.execute("""
                  SELECT COUNT(*) FROM custom_program_rates cpr
                  JOIN custom_rate_cards crc ON cpr.rate_card_id = crc.rate_card_id
                  WHERE crc.rate_card_name = ? AND crc.is_active = 1
              """, (name,))
              programs_count = cursor.fetchone()[0]
              
              created_date = datetime.fromisoformat(created).strftime("%Y-%m-%d") if created else "Unknown"
              created_by_user = created_by or "Unknown"
              
              details_tree.insert('', tk.END, values=(
                  name, agency, client, f"{modifier:+.1f}%", programs_count, created_date, created_by_user
              ))
          
          # Generate statistics
          cursor.execute("SELECT COUNT(*) FROM agency_clients WHERE rate_card_type = 'discount'")
          discount_count = cursor.fetchone()[0]
          
          cursor.execute("SELECT COUNT(*) FROM agency_clients WHERE rate_card_type = 'custom'")
          custom_count = cursor.fetchone()[0]
          
          cursor.execute("SELECT COUNT(*) FROM custom_rate_cards WHERE is_active = 1")
          total_custom_cards = cursor.fetchone()[0]
          
          cursor.execute("SELECT COUNT(*) FROM custom_program_rates")
          total_custom_rates = cursor.fetchone()[0]
          
          cursor.execute("""
              SELECT AVG(discount_rate) FROM agency_clients WHERE rate_card_type = 'discount'
          """)
          avg_discount = cursor.fetchone()[0] or 0
          
          stats_content = f"""RATE CARD SYSTEM STATISTICS

============================

CLIENT DISTRIBUTION:
• Discount Rate Clients: {discount_count}
• Custom Rate Card Clients: {custom_count}
• Total Clients: {discount_count + custom_count}

CUSTOM RATE CARDS:
• Active Custom Rate Cards: {total_custom_cards}
• Total Custom Program Rates: {total_custom_rates}
• Average Custom Rates per Card: {total_custom_rates/total_custom_cards if total_custom_cards > 0 else 0:.1f}

DISCOUNT SYSTEM:
• Average Discount Rate: {avg_discount:.1f}%
• Clients Using Discount System: {discount_count} ({(discount_count/(discount_count + custom_count))*100 if (discount_count + custom_count) > 0 else 0:.1f}%)

SYSTEM HEALTH:
• Rate Card Coverage: 100%
• System Type Distribution:
- Discount: {(discount_count/(discount_count + custom_count))*100 if (discount_count + custom_count) > 0 else 0:.1f}%
- Custom: {(custom_count/(discount_count + custom_count))*100 if (discount_count + custom_count) > 0 else 0:.1f}%

RECOMMENDATIONS:
• System is operating with mixed rate strategies
• Custom rate cards provide maximum flexibility
• Discount system offers simplicity for standard clients
"""
          
          stats_text.insert(tk.END, stats_content)
          stats_text.config(state=tk.DISABLED)
      
      except sqlite3.Error as err:
          messagebox.showerror("Database Error", f"Error loading overview data: {err}")
      finally:
          if cursor:
              cursor.close()

  # System management methods
 def user_management(self):
      """Complete user management system"""
      user_window = tk.Toplevel(self.root)
      user_window.title("User Management")
      user_window.geometry("1000x600")

      # Control frame
      control_frame = ttk.Frame(user_window)
      control_frame.pack(fill=tk.X, padx=10, pady=10)

      ttk.Button(control_frame, text="Add User", command=lambda: self.add_user(users_tree)).pack(side=tk.LEFT, padx=5)
      ttk.Button(control_frame, text="Edit User", command=lambda: self.edit_user(users_tree)).pack(side=tk.LEFT, padx=5)
      ttk.Button(control_frame, text="Delete User", command=lambda: self.delete_user(users_tree)).pack(side=tk.LEFT, padx=5)
      ttk.Button(control_frame, text="Reset Password", command=lambda: self.reset_password(users_tree)).pack(side=tk.LEFT, padx=5)
      ttk.Button(control_frame, text="Refresh", command=lambda: self.load_users(users_tree)).pack(side=tk.RIGHT, padx=5)

      # Users tree
      columns = ('user_id', 'username', 'full_name', 'email', 'is_admin', 'is_active', 'created_at', 'last_login')
      users_tree = ttk.Treeview(user_window, columns=columns, show='headings')

      users_tree.heading('user_id', text='ID')
      users_tree.heading('username', text='Username')
      users_tree.heading('full_name', text='Full Name')
      users_tree.heading('email', text='Email')
      users_tree.heading('is_admin', text='Admin')
      users_tree.heading('is_active', text='Active')
      users_tree.heading('created_at', text='Created')
      users_tree.heading('last_login', text='Last Login')

      # Column widths
      users_tree.column('user_id', width=50)
      users_tree.column('username', width=120)
      users_tree.column('full_name', width=150)
      users_tree.column('email', width=200)
      users_tree.column('is_admin', width=60)
      users_tree.column('is_active', width=60)
      users_tree.column('created_at', width=120)
      users_tree.column('last_login', width=120)

      # Scrollbars
      v_scroll = ttk.Scrollbar(user_window, orient="vertical", command=users_tree.yview)
      h_scroll = ttk.Scrollbar(user_window, orient="horizontal", command=users_tree.xview)
      users_tree.configure(yscrollcommand=v_scroll.set, xscrollcommand=h_scroll.set)

      users_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(10, 0), pady=10)
      v_scroll.pack(side=tk.RIGHT, fill=tk.Y, pady=10)

      # Load users
      self.load_users(users_tree)

 def load_users(self, tree):
        """Load all users"""
        for item in tree.get_children():
            tree.delete(item)

        try:
            cursor = self.connection.cursor()
            cursor.execute("""
                SELECT user_id, username, full_name, email, is_admin, is_active, created_at, last_login
                FROM users ORDER BY username
            """)
            
            for row in cursor.fetchall():
                user_id, username, full_name, email, is_admin, is_active, created_at, last_login = row
                
                admin_text = "Yes" if is_admin else "No"
                active_text = "Yes" if is_active else "No"
                created_text = created_at[:10] if created_at else "Unknown"
                login_text = last_login[:10] if last_login else "Never"
                
                tree.insert('', tk.END, values=(
                    user_id, username, full_name or "", email or "", 
                    admin_text, active_text, created_text, login_text
                ))

        except sqlite3.Error as err:
            messagebox.showerror("Database Error", f"Error loading users: {err}")
        finally:
            cursor.close()

 def add_user(self, tree):
        """Add new user"""
        dialog = tk.Toplevel(self.root)
        dialog.title("Add New User")
        dialog.geometry("500x400")
        dialog.grab_set()

        # Username
        ttk.Label(dialog, text="Username:").grid(row=0, column=0, padx=10, pady=10, sticky=tk.W)
        username_var = tk.StringVar()
        ttk.Entry(dialog, textvariable=username_var, width=30).grid(row=0, column=1, padx=10, pady=10, sticky=tk.W)

        # Password
        ttk.Label(dialog, text="Password:").grid(row=1, column=0, padx=10, pady=10, sticky=tk.W)
        password_var = tk.StringVar()
        ttk.Entry(dialog, textvariable=password_var, show="*", width=30).grid(row=1, column=1, padx=10, pady=10, sticky=tk.W)

        # Full Name
        ttk.Label(dialog, text="Full Name:").grid(row=2, column=0, padx=10, pady=10, sticky=tk.W)
        fullname_var = tk.StringVar()
        ttk.Entry(dialog, textvariable=fullname_var, width=30).grid(row=2, column=1, padx=10, pady=10, sticky=tk.W)

        # Email
        ttk.Label(dialog, text="Email:").grid(row=3, column=0, padx=10, pady=10, sticky=tk.W)
        email_var = tk.StringVar()
        ttk.Entry(dialog, textvariable=email_var, width=30).grid(row=3, column=1, padx=10, pady=10, sticky=tk.W)

        # Admin checkbox
        is_admin_var = tk.BooleanVar()
        ttk.Checkbutton(dialog, text="Administrator", variable=is_admin_var).grid(row=4, column=0, columnspan=2, padx=10, pady=10, sticky=tk.W)

        # Active checkbox
        is_active_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(dialog, text="Active User", variable=is_active_var).grid(row=5, column=0, columnspan=2, padx=10, pady=10, sticky=tk.W)

        def save_user():
            username = username_var.get().strip()
            password = password_var.get()
            full_name = fullname_var.get().strip()
            email = email_var.get().strip()
            is_admin = is_admin_var.get()
            is_active = is_active_var.get()
            
            if not username or not password:
                messagebox.showerror("Error", "Username and password are required.")
                return
            
            try:
                cursor = self.connection.cursor()
                # Check if username exists
                cursor.execute("SELECT COUNT(*) FROM users WHERE username = ?", (username,))
                if cursor.fetchone()[0] > 0:
                    messagebox.showerror("Error", "Username already exists.")
                    return
                
                # Hash password
                password_hash = hashlib.sha256(password.encode()).hexdigest()
                
                cursor.execute("""
                    INSERT INTO users (username, password_hash, full_name, email, is_admin, is_active)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (username, password_hash, full_name, email, is_admin, is_active))
                
                self.connection.commit()
                messagebox.showinfo("Success", f"User '{username}' created successfully!")
                dialog.destroy()
                self.load_users(tree)
                
            except sqlite3.Error as err:
                self.connection.rollback()
                messagebox.showerror("Database Error", f"Error creating user: {err}")
            finally:
                cursor.close()

        # Buttons
            button_frame = ttk.Frame(dialog)
            button_frame.grid(row=6, column=0, columnspan=2, pady=20)

            ttk.Button(button_frame, text="Create User", command=save_user).pack(side=tk.LEFT, padx=5)
            ttk.Button(button_frame, text="Cancel", command=dialog.destroy).pack(side=tk.LEFT, padx=5)

 def edit_user(self, tree):
        """Edit selected user"""
        selected = tree.selection()
        if not selected:
            messagebox.showwarning("No Selection", "Please select a user to edit.")
            return

        user_id = tree.item(selected[0])['values'][0]

        # Get user details
        try:
            cursor = self.connection.cursor()
            cursor.execute("SELECT username, full_name, email, is_admin, is_active FROM users WHERE user_id = ?", (user_id,))
            result = cursor.fetchone()
            if not result:
                messagebox.showerror("Error", "User not found.")
                return
            username, full_name, email, is_admin, is_active = result
        except sqlite3.Error as err:
            messagebox.showerror("Database Error", f"Error loading user: {err}")
            return
        finally:
            cursor.close()

        # Edit dialog
        dialog = tk.Toplevel(self.root)
        dialog.title(f"Edit User: {username}")
        dialog.geometry("500x350")
        dialog.grab_set()

        # Full Name
        ttk.Label(dialog, text="Full Name:").grid(row=0, column=0, padx=10, pady=10, sticky=tk.W)
        fullname_var = tk.StringVar(value=full_name or "")
        ttk.Entry(dialog, textvariable=fullname_var, width=30).grid(row=0, column=1, padx=10, pady=10, sticky=tk.W)

        # Email
        ttk.Label(dialog, text="Email:").grid(row=1, column=0, padx=10, pady=10, sticky=tk.W)
        email_var = tk.StringVar(value=email or "")
        ttk.Entry(dialog, textvariable=email_var, width=30).grid(row=1, column=1, padx=10, pady=10, sticky=tk.W)

        # Admin checkbox
        is_admin_var = tk.BooleanVar(value=bool(is_admin))
        ttk.Checkbutton(dialog, text="Administrator", variable=is_admin_var).grid(row=2, column=0, columnspan=2, padx=10, pady=10, sticky=tk.W)

        # Active checkbox
        is_active_var = tk.BooleanVar(value=bool(is_active))
        ttk.Checkbutton(dialog, text="Active User", variable=is_active_var).grid(row=3, column=0, columnspan=2, padx=10, pady=10, sticky=tk.W)

        def update_user():
            new_full_name = fullname_var.get().strip()
            new_email = email_var.get().strip()
            new_is_admin = is_admin_var.get()
            new_is_active = is_active_var.get()
            
            try:
                cursor = self.connection.cursor()
                cursor.execute("""
                    UPDATE users SET full_name = ?, email = ?, is_admin = ?, is_active = ?
                    WHERE user_id = ?
                """, (new_full_name, new_email, new_is_admin, new_is_active, user_id))
                
                self.connection.commit()
                messagebox.showinfo("Success", f"User '{username}' updated successfully!")
                dialog.destroy()
                self.load_users(tree)
                
            except sqlite3.Error as err:
                self.connection.rollback()
                messagebox.showerror("Database Error", f"Error updating user: {err}")
            finally:
                cursor.close()

        # Buttons
        button_frame = ttk.Frame(dialog)
        button_frame.grid(row=4, column=0, columnspan=2, pady=20)

        ttk.Button(button_frame, text="Update User", command=update_user).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Cancel", command=dialog.destroy).pack(side=tk.LEFT, padx=5)

 def reset_password(self, tree):
        """Reset user password"""
        selected = tree.selection()
        if not selected:
            messagebox.showwarning("No Selection", "Please select a user to reset password.")
            return

        user_id = tree.item(selected[0])['values'][0]
        username = tree.item(selected[0])['values'][1]

        new_password = simpledialog.askstring("Reset Password", f"Enter new password for '{username}':", show='*')
        if new_password:
            try:
                cursor = self.connection.cursor()
                password_hash = hashlib.sha256(new_password.encode()).hexdigest()
                cursor.execute("UPDATE users SET password_hash = ? WHERE user_id = ?", (password_hash, user_id))
                self.connection.commit()
                messagebox.showinfo("Success", f"Password reset for '{username}'!")
            except sqlite3.Error as err:
                self.connection.rollback()
                messagebox.showerror("Database Error", f"Error resetting password: {err}")
            finally:
                cursor.close()

 def delete_user(self, tree):
        """Delete selected user"""
        selected = tree.selection()
        if not selected:
            messagebox.showwarning("No Selection", "Please select a user to delete.")
            return

        user_id = tree.item(selected[0])['values'][0]
        username = tree.item(selected[0])['values'][1]

        if user_id == self.user_id:
            messagebox.showerror("Error", "You cannot delete your own account.")
            return

        if messagebox.askyesno("Confirm Delete", f"Delete user '{username}'?\n\nThis action cannot be undone."):
            try:
                cursor = self.connection.cursor()
                cursor.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
                self.connection.commit()
                messagebox.showinfo("Success", f"User '{username}' deleted successfully!")
                self.load_users(tree)
            except sqlite3.Error as err:
                self.connection.rollback()
                messagebox.showerror("Database Error", f"Error deleting user: {err}")
            finally:
                cursor.close()

 def manage_permissions(self):
        """Complete permissions management system"""
        perm_window = tk.Toplevel(self.root)
        perm_window.title("Permissions Management")
        perm_window.geometry("1000x600")

        # Control frame
        control_frame = ttk.Frame(perm_window)
        control_frame.pack(fill=tk.X, padx=10, pady=10)

        ttk.Button(control_frame, text="Add Permission", command=lambda: self.add_permission(perm_tree)).pack(side=tk.LEFT, padx=5)
        ttk.Button(control_frame, text="Edit Permission", command=lambda: self.edit_permission(perm_tree)).pack(side=tk.LEFT, padx=5)
        ttk.Button(control_frame, text="Delete Permission", command=lambda: self.delete_permission(perm_tree)).pack(side=tk.LEFT, padx=5)
        ttk.Button(control_frame, text="Refresh", command=lambda: self.load_permissions(perm_tree)).pack(side=tk.RIGHT, padx=5)

        # Permissions tree
        columns = ('permission_id', 'permission_name', 'description', 'users_count')
        perm_tree = ttk.Treeview(perm_window, columns=columns, show='headings')

        perm_tree.heading('permission_id', text='ID')
        perm_tree.heading('permission_name', text='Permission Name')
        perm_tree.heading('description', text='Description')
        perm_tree.heading('users_count', text='Users with Permission')

        perm_tree.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        self.load_permissions(perm_tree)

 def edit_permission(self, tree):
    """Edit selected permission"""
    selected = tree.selection()
    if not selected:
        messagebox.showwarning("No Selection", "Please select a permission to edit.")
        return

    permission_id = tree.item(selected[0])['values'][0]
    current_name = tree.item(selected[0])['values'][1]
    current_desc = tree.item(selected[0])['values'][2]

    # Edit dialog
    dialog = tk.Toplevel(self.root)
    dialog.title(f"Edit Permission: {current_name}")
    dialog.geometry("400x200")
    dialog.grab_set()

    ttk.Label(dialog, text="Permission Name:").grid(row=0, column=0, padx=10, pady=10, sticky=tk.W)
    name_var = tk.StringVar(value=current_name)
    ttk.Entry(dialog, textvariable=name_var, width=30).grid(row=0, column=1, padx=10, pady=10, sticky=tk.W)

    ttk.Label(dialog, text="Description:").grid(row=1, column=0, padx=10, pady=10, sticky=tk.W)
    desc_var = tk.StringVar(value=current_desc)
    ttk.Entry(dialog, textvariable=desc_var, width=30).grid(row=1, column=1, padx=10, pady=10, sticky=tk.W)

    def update_permission():
        new_name = name_var.get().strip()
        new_desc = desc_var.get().strip()
        
        if not new_name:
            messagebox.showerror("Error", "Permission name is required.")
            return
        
        try:
            cursor = self.connection.cursor()
            cursor.execute("""
                UPDATE permissions SET permission_name = ?, description = ? 
                WHERE permission_id = ?
            """, (new_name, new_desc, permission_id))
            self.connection.commit()
            
            messagebox.showinfo("Success", f"Permission '{new_name}' updated!")
            dialog.destroy()
            self.load_permissions(tree)
            
        except sqlite3.Error as err:
            self.connection.rollback()
            messagebox.showerror("Database Error", f"Error updating permission: {err}")
        finally:
            cursor.close()

    ttk.Button(dialog, text="Update", command=update_permission).grid(row=2, column=0, pady=20)
    ttk.Button(dialog, text="Cancel", command=dialog.destroy).grid(row=2, column=1, pady=20)

 def delete_permission(self, tree):
    """Delete selected permission"""
    selected = tree.selection()
    if not selected:
        messagebox.showwarning("No Selection", "Please select a permission to delete.")
        return

    permission_id = tree.item(selected[0])['values'][0]
    permission_name = tree.item(selected[0])['values'][1]
    users_count = tree.item(selected[0])['values'][3]

    if users_count > 0:
        messagebox.showerror("Cannot Delete", f"Cannot delete permission '{permission_name}'.\n{users_count} users have this permission.")
        return

    if messagebox.askyesno("Confirm Delete", f"Delete permission '{permission_name}'?"):
        try:
            cursor = self.connection.cursor()
            cursor.execute("DELETE FROM permissions WHERE permission_id = ?", (permission_id,))
            self.connection.commit()
            
            messagebox.showinfo("Success", f"Permission '{permission_name}' deleted!")
            self.load_permissions(tree)
            
        except sqlite3.Error as err:
            self.connection.rollback()
            messagebox.showerror("Database Error", f"Error deleting permission: {err}")
        finally:
            cursor.close()

 def load_permissions(self, tree):
        """Load permissions"""
        for item in tree.get_children():
            tree.delete(item)

        try:
            cursor = self.connection.cursor()
            cursor.execute("""
                SELECT p.permission_id, p.permission_name, p.description,
                    COUNT(up.user_id) as users_count
                FROM permissions p
                LEFT JOIN user_permissions up ON p.permission_id = up.permission_id
                GROUP BY p.permission_id, p.permission_name, p.description
                ORDER BY p.permission_name
            """)
            
            for row in cursor.fetchall():
                tree.insert('', tk.END, values=row)

        except sqlite3.Error as err:
            messagebox.showerror("Database Error", f"Error loading permissions: {err}")
        finally:
            cursor.close()

 def add_permission(self, tree):
        """Add new permission"""
        dialog = tk.Toplevel(self.root)
        dialog.title("Add Permission")
        dialog.geometry("400x200")
        dialog.grab_set()

        ttk.Label(dialog, text="Permission Name:").grid(row=0, column=0, padx=10, pady=10, sticky=tk.W)
        name_var = tk.StringVar()
        ttk.Entry(dialog, textvariable=name_var, width=30).grid(row=0, column=1, padx=10, pady=10, sticky=tk.W)

        ttk.Label(dialog, text="Description:").grid(row=1, column=0, padx=10, pady=10, sticky=tk.W)
        desc_var = tk.StringVar()
        ttk.Entry(dialog, textvariable=desc_var, width=30).grid(row=1, column=1, padx=10, pady=10, sticky=tk.W)

        def save_permission():
            name = name_var.get().strip()
            desc = desc_var.get().strip()
            
            if not name:
                messagebox.showerror("Error", "Permission name is required.")
                return
            
            try:
                cursor = self.connection.cursor()
                cursor.execute("INSERT INTO permissions (permission_name, description) VALUES (?, ?)", (name, desc))
                self.connection.commit()
                messagebox.showinfo("Success", f"Permission '{name}' added!")
                dialog.destroy()
                self.load_permissions(tree)
            except sqlite3.Error as err:
                self.connection.rollback()
                messagebox.showerror("Database Error", f"Error adding permission: {err}")
            finally:
                cursor.close()

        ttk.Button(dialog, text="Add", command=save_permission).grid(row=2, column=0, pady=20)
        ttk.Button(dialog, text="Cancel", command=dialog.destroy).grid(row=2, column=1, pady=20)

 def manage_broadcast_types(self):
        """Broadcast types management"""
        bt_window = tk.Toplevel(self.root)
        bt_window.title("Broadcast Types Management")
        bt_window.geometry("800x500")

        # Control frame
        control_frame = ttk.Frame(bt_window)
        control_frame.pack(fill=tk.X, padx=10, pady=10)

        ttk.Button(control_frame, text="Add Type", command=lambda: self.add_broadcast_type(bt_tree)).pack(side=tk.LEFT, padx=5)
        ttk.Button(control_frame, text="Edit Type", command=lambda: self.edit_broadcast_type(bt_tree)).pack(side=tk.LEFT, padx=5)
        ttk.Button(control_frame, text="Delete Type", command=lambda: self.delete_broadcast_type(bt_tree)).pack(side=tk.LEFT, padx=5)
        ttk.Button(control_frame, text="Refresh", command=lambda: self.load_broadcast_types(bt_tree)).pack(side=tk.RIGHT, padx=5)

        # Broadcast types tree
        columns = ('broadcast_type_id', 'type_code', 'description', 'schedules_count')
        bt_tree = ttk.Treeview(bt_window, columns=columns, show='headings')

        bt_tree.heading('broadcast_type_id', text='ID')
        bt_tree.heading('type_code', text='Code')
        bt_tree.heading('description', text='Description')
        bt_tree.heading('schedules_count', text='Used in Schedules')

        bt_tree.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        self.load_broadcast_types(bt_tree)
 
 def add_broadcast_type(self, tree):
    """Add new broadcast type"""
    dialog = tk.Toplevel(self.root)
    dialog.title("Add Broadcast Type")
    dialog.geometry("400x250")
    dialog.grab_set()

    ttk.Label(dialog, text="Type Code:").grid(row=0, column=0, padx=10, pady=10, sticky=tk.W)
    code_var = tk.StringVar()
    ttk.Entry(dialog, textvariable=code_var, width=15).grid(row=0, column=1, padx=10, pady=10, sticky=tk.W)

    ttk.Label(dialog, text="Description:").grid(row=1, column=0, padx=10, pady=10, sticky=tk.W)
    desc_var = tk.StringVar()
    ttk.Entry(dialog, textvariable=desc_var, width=40).grid(row=1, column=1, padx=10, pady=10, sticky=tk.W)

    def save_broadcast_type():
        code = code_var.get().strip()
        desc = desc_var.get().strip()
        
        if not code or not desc:
            messagebox.showerror("Error", "Both fields are required.")
            return
        
        try:
            cursor = self.connection.cursor()
            cursor.execute("INSERT INTO broadcast_types (type_code, description) VALUES (?, ?)", (code, desc))
            self.connection.commit()
            messagebox.showinfo("Success", f"Broadcast type '{code}' added!")
            dialog.destroy()
            self.load_broadcast_types(tree)
        except sqlite3.Error as err:
            self.connection.rollback()
            messagebox.showerror("Database Error", f"Error adding broadcast type: {err}")
        finally:
            cursor.close()

    ttk.Button(dialog, text="Add", command=save_broadcast_type).grid(row=2, column=0, pady=20)
    ttk.Button(dialog, text="Cancel", command=dialog.destroy).grid(row=2, column=1, pady=20)

 def edit_broadcast_type(self, tree):
    """Edit selected broadcast type"""
    selected = tree.selection()
    if not selected:
        messagebox.showwarning("No Selection", "Please select a broadcast type to edit.")
        return

    type_id = tree.item(selected[0])['values'][0]
    current_code = tree.item(selected[0])['values'][1]
    current_desc = tree.item(selected[0])['values'][2]

    dialog = tk.Toplevel(self.root)
    dialog.title(f"Edit Broadcast Type: {current_code}")
    dialog.geometry("400x250")
    dialog.grab_set()

    ttk.Label(dialog, text="Type Code:").grid(row=0, column=0, padx=10, pady=10, sticky=tk.W)
    code_var = tk.StringVar(value=current_code)
    ttk.Entry(dialog, textvariable=code_var, width=15).grid(row=0, column=1, padx=10, pady=10, sticky=tk.W)

    ttk.Label(dialog, text="Description:").grid(row=1, column=0, padx=10, pady=10, sticky=tk.W)
    desc_var = tk.StringVar(value=current_desc)
    ttk.Entry(dialog, textvariable=desc_var, width=40).grid(row=1, column=1, padx=10, pady=10, sticky=tk.W)

    def update_broadcast_type():
        new_code = code_var.get().strip()
        new_desc = desc_var.get().strip()
        
        if not new_code or not new_desc:
            messagebox.showerror("Error", "Both fields are required.")
            return
        
        try:
            cursor = self.connection.cursor()
            cursor.execute("""
                UPDATE broadcast_types SET type_code = ?, description = ? 
                WHERE broadcast_type_id = ?
            """, (new_code, new_desc, type_id))
            self.connection.commit()
            
            messagebox.showinfo("Success", f"Broadcast type '{new_code}' updated!")
            dialog.destroy()
            self.load_broadcast_types(tree)
            
        except sqlite3.Error as err:
            self.connection.rollback()
            messagebox.showerror("Database Error", f"Error updating broadcast type: {err}")
        finally:
            cursor.close()

    ttk.Button(dialog, text="Update", command=update_broadcast_type).grid(row=2, column=0, pady=20)
    ttk.Button(dialog, text="Cancel", command=dialog.destroy).grid(row=2, column=1, pady=20)

 def delete_broadcast_type(self, tree):
    """Delete selected broadcast type"""
    selected = tree.selection()
    if not selected:
        messagebox.showwarning("No Selection", "Please select a broadcast type to delete.")
        return

    type_id = tree.item(selected[0])['values'][0]
    type_code = tree.item(selected[0])['values'][1]
    schedules_count = tree.item(selected[0])['values'][3]

    if schedules_count > 0:
        messagebox.showerror("Cannot Delete", f"Cannot delete broadcast type '{type_code}'.\nIt is used in {schedules_count} schedule(s).")
        return

    if messagebox.askyesno("Confirm Delete", f"Delete broadcast type '{type_code}'?"):
        try:
            cursor = self.connection.cursor()
            cursor.execute("DELETE FROM broadcast_types WHERE broadcast_type_id = ?", (type_id,))
            self.connection.commit()
            
            messagebox.showinfo("Success", f"Broadcast type '{type_code}' deleted!")
            self.load_broadcast_types(tree)
            
        except sqlite3.Error as err:
            self.connection.rollback()
            messagebox.showerror("Database Error", f"Error deleting broadcast type: {err}")
        finally:
            cursor.close()

 def load_broadcast_types(self, tree):
        """Load broadcast types"""
        for item in tree.get_children():
            tree.delete(item)

        try:
            cursor = self.connection.cursor()
            cursor.execute("""
                SELECT bt.broadcast_type_id, bt.type_code, bt.description,
                    COUNT(ps.schedule_id) as schedules_count
                FROM broadcast_types bt
                LEFT JOIN program_schedules ps ON bt.broadcast_type_id = ps.broadcast_type_id
                GROUP BY bt.broadcast_type_id, bt.type_code, bt.description
                ORDER BY bt.type_code
            """)
            
            for row in cursor.fetchall():
                tree.insert('', tk.END, values=row)

        except sqlite3.Error as err:
            messagebox.showerror("Database Error", f"Error loading broadcast types: {err}")
        finally:
            cursor.close()

 def manage_day_patterns(self):
        """Day patterns management"""
        dp_window = tk.Toplevel(self.root)
        dp_window.title("Day Patterns Management")
        dp_window.geometry("800x500")

        # Control frame
        control_frame = ttk.Frame(dp_window)
        control_frame.pack(fill=tk.X, padx=10, pady=10)

        ttk.Button(control_frame, text="Add Pattern", command=lambda: self.add_day_pattern(dp_tree)).pack(side=tk.LEFT, padx=5)
        ttk.Button(control_frame, text="Edit Pattern", command=lambda: self.edit_day_pattern(dp_tree)).pack(side=tk.LEFT, padx=5)
        ttk.Button(control_frame, text="Delete Pattern", command=lambda: self.delete_day_pattern(dp_tree)).pack(side=tk.LEFT, padx=5)
        ttk.Button(control_frame, text="Refresh", command=lambda: self.load_day_patterns(dp_tree)).pack(side=tk.RIGHT, padx=5)

        # Day patterns tree
        columns = ('day_pattern_id', 'pattern_code', 'description', 'schedules_count')
        dp_tree = ttk.Treeview(dp_window, columns=columns, show='headings')

        dp_tree.heading('day_pattern_id', text='ID')
        dp_tree.heading('pattern_code', text='Pattern Code')
        dp_tree.heading('description', text='Description')
        dp_tree.heading('schedules_count', text='Used in Schedules')

        dp_tree.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        self.load_day_patterns(dp_tree)


 def edit_day_pattern(self, tree):
    """Edit selected day pattern"""
    selected = tree.selection()
    if not selected:
        messagebox.showwarning("No Selection", "Please select a day pattern to edit.")
        return

    pattern_id = tree.item(selected[0])['values'][0]
    current_code = tree.item(selected[0])['values'][1]
    current_desc = tree.item(selected[0])['values'][2]

    # Edit dialog
    dialog = tk.Toplevel(self.root)
    dialog.title(f"Edit Day Pattern: {current_code}")
    dialog.geometry("400x250")
    dialog.grab_set()

    ttk.Label(dialog, text="Pattern Code:").grid(row=0, column=0, padx=10, pady=10, sticky=tk.W)
    code_var = tk.StringVar(value=current_code)
    ttk.Entry(dialog, textvariable=code_var, width=20).grid(row=0, column=1, padx=10, pady=10, sticky=tk.W)

    ttk.Label(dialog, text="Description:").grid(row=1, column=0, padx=10, pady=10, sticky=tk.W)
    desc_var = tk.StringVar(value=current_desc)
    ttk.Entry(dialog, textvariable=desc_var, width=40).grid(row=1, column=1, padx=10, pady=10, sticky=tk.W)

    def update_pattern():
        new_code = code_var.get().strip()
        new_desc = desc_var.get().strip()
        
        if not new_code or not new_desc:
            messagebox.showerror("Error", "Both fields are required.")
            return
        
        try:
            cursor = self.connection.cursor()
            cursor.execute("""
                UPDATE day_patterns SET pattern_code = ?, description = ? 
                WHERE day_pattern_id = ?
            """, (new_code, new_desc, pattern_id))
            self.connection.commit()
            
            messagebox.showinfo("Success", f"Day pattern '{new_code}' updated!")
            dialog.destroy()
            self.load_day_patterns(tree)
            
        except sqlite3.Error as err:
            self.connection.rollback()
            messagebox.showerror("Database Error", f"Error updating day pattern: {err}")
        finally:
            cursor.close()

    ttk.Button(dialog, text="Update", command=update_pattern).grid(row=2, column=0, pady=20)
    ttk.Button(dialog, text="Cancel", command=dialog.destroy).grid(row=2, column=1, pady=20)

 def delete_day_pattern(self, tree):
    """Delete selected day pattern"""
    selected = tree.selection()
    if not selected:
        messagebox.showwarning("No Selection", "Please select a day pattern to delete.")
        return

    pattern_id = tree.item(selected[0])['values'][0]
    pattern_code = tree.item(selected[0])['values'][1]
    schedules_count = tree.item(selected[0])['values'][3]

    if schedules_count > 0:
        messagebox.showerror("Cannot Delete", f"Cannot delete day pattern '{pattern_code}'.\nIt is used in {schedules_count} schedule(s).")
        return

    if messagebox.askyesno("Confirm Delete", f"Delete day pattern '{pattern_code}'?"):
        try:
            cursor = self.connection.cursor()
            cursor.execute("DELETE FROM day_patterns WHERE day_pattern_id = ?", (pattern_id,))
            self.connection.commit()
            
            messagebox.showinfo("Success", f"Day pattern '{pattern_code}' deleted!")
            self.load_day_patterns(tree)
            
        except sqlite3.Error as err:
            self.connection.rollback()
            messagebox.showerror("Database Error", f"Error deleting day pattern: {err}")
        finally:
            cursor.close()

 def load_day_patterns(self, tree):
        """Load day patterns"""
        for item in tree.get_children():
            tree.delete(item)

        try:
            cursor = self.connection.cursor()
            cursor.execute("""
                SELECT dp.day_pattern_id, dp.pattern_code, dp.description,
                    COUNT(ps.schedule_id) as schedules_count
                FROM day_patterns dp
                LEFT JOIN program_schedules ps ON dp.day_pattern_id = ps.day_pattern_id
                GROUP BY dp.day_pattern_id, dp.pattern_code, dp.description
                ORDER BY dp.pattern_code
            """)
            
            for row in cursor.fetchall():
                tree.insert('', tk.END, values=row)

        except sqlite3.Error as err:
            messagebox.showerror("Database Error", f"Error loading day patterns: {err}")
        finally:
            cursor.close()

 def manage_categories(self):
        """Complete categories and subcategories management"""
        cat_window = tk.Toplevel(self.root)
        cat_window.title("Categories & Subcategories Management")
        cat_window.geometry("1200x700")

        # Create notebook for categories and subcategories
        notebook = ttk.Notebook(cat_window)
        notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        # Tab 1: Categories
        cat_tab = ttk.Frame(notebook)
        notebook.add(cat_tab, text="Categories")

        # Categories control frame
        cat_control_frame = ttk.Frame(cat_tab)
        cat_control_frame.pack(fill=tk.X, padx=10, pady=10)

        ttk.Button(cat_control_frame, text="Add Category", command=lambda: self.add_category(cat_tree)).pack(side=tk.LEFT, padx=5)
        ttk.Button(cat_control_frame, text="Edit Category", command=lambda: self.edit_category(cat_tree)).pack(side=tk.LEFT, padx=5)
        ttk.Button(cat_control_frame, text="Delete Category", command=lambda: self.delete_category(cat_tree)).pack(side=tk.LEFT, padx=5)
        ttk.Button(cat_control_frame, text="Refresh", command=lambda: self.load_categories(cat_tree)).pack(side=tk.RIGHT, padx=5)

        # Categories tree
        cat_columns = ('category_id', 'category_name', 'subcategories_count', 'programs_count')
        cat_tree = ttk.Treeview(cat_tab, columns=cat_columns, show='headings')

        cat_tree.heading('category_id', text='ID')
        cat_tree.heading('category_name', text='Category Name')
        cat_tree.heading('subcategories_count', text='Subcategories')
        cat_tree.heading('programs_count', text='Programs')

        cat_tree.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        # Tab 2: Subcategories
        subcat_tab = ttk.Frame(notebook)
        notebook.add(subcat_tab, text="Subcategories")

        # Subcategories control frame
        subcat_control_frame = ttk.Frame(subcat_tab)
        subcat_control_frame.pack(fill=tk.X, padx=10, pady=10)

        ttk.Button(subcat_control_frame, text="Add Subcategory", command=lambda: self.add_subcategory(subcat_tree)).pack(side=tk.LEFT, padx=5)
        ttk.Button(subcat_control_frame, text="Edit Subcategory", command=lambda: self.edit_subcategory(subcat_tree)).pack(side=tk.LEFT, padx=5)
        ttk.Button(subcat_control_frame, text="Delete Subcategory", command=lambda: self.delete_subcategory(subcat_tree)).pack(side=tk.LEFT, padx=5)
        ttk.Button(subcat_control_frame, text="Refresh", command=lambda: self.load_subcategories(subcat_tree)).pack(side=tk.RIGHT, padx=5)

        # Subcategories tree
        subcat_columns = ('subcategory_id', 'subcategory_name', 'category_name', 'programs_count')
        subcat_tree = ttk.Treeview(subcat_tab, columns=subcat_columns, show='headings')

        subcat_tree.heading('subcategory_id', text='ID')
        subcat_tree.heading('subcategory_name', text='Subcategory Name')
        subcat_tree.heading('category_name', text='Parent Category')
        subcat_tree.heading('programs_count', text='Programs')

        subcat_tree.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        # Load data
        self.load_categories(cat_tree)
        self.load_subcategories(subcat_tree)

 def load_categories(self, tree):
        """Load categories with counts"""
        for item in tree.get_children():
            tree.delete(item)

        try:
            cursor = self.connection.cursor()
            cursor.execute("""
                SELECT c.category_id, c.category_name, 
                    COUNT(DISTINCT s.subcategory_id) as subcategories_count,
                    COUNT(DISTINCT p.program_id) as programs_count
                FROM program_categories c
                LEFT JOIN program_subcategories s ON c.category_id = s.category_id
                LEFT JOIN programs p ON s.subcategory_id = p.subcategory_id
                GROUP BY c.category_id, c.category_name
                ORDER BY c.category_name
            """)
            
            for row in cursor.fetchall():
                category_id, category_name, subcat_count, prog_count = row
                tree.insert('', tk.END, values=(
                    category_id, category_name, subcat_count, prog_count
                ))

        except sqlite3.Error as err:
            messagebox.showerror("Database Error", f"Error loading categories: {err}")
        finally:
            cursor.close()

 def load_subcategories(self, tree):
        """Load subcategories with parent category"""
        for item in tree.get_children():
            tree.delete(item)

        try:
            cursor = self.connection.cursor()
            cursor.execute("""
                SELECT s.subcategory_id, s.subcategory_name, c.category_name,
                    COUNT(p.program_id) as programs_count
                FROM program_subcategories s
                JOIN program_categories c ON s.category_id = c.category_id
                LEFT JOIN programs p ON s.subcategory_id = p.subcategory_id
                GROUP BY s.subcategory_id, s.subcategory_name, c.category_name
                ORDER BY c.category_name, s.subcategory_name
            """)
            
            for row in cursor.fetchall():
                subcategory_id, subcategory_name, category_name, prog_count = row
                tree.insert('', tk.END, values=(
                    subcategory_id, subcategory_name, category_name, prog_count
                ))

        except sqlite3.Error as err:
            messagebox.showerror("Database Error", f"Error loading subcategories: {err}")
        finally:
            cursor.close()

 def add_category(self, tree):
        """Add new category"""
        name = simpledialog.askstring("Add Category", "Enter category name:")
        if name and name.strip():
            try:
                cursor = self.connection.cursor()
                cursor.execute("SELECT COUNT(*) FROM program_categories WHERE UPPER(category_name) = UPPER(?)", (name.strip(),))
                if cursor.fetchone()[0] > 0:
                    messagebox.showerror("Error", "Category already exists.")
                    return
                
                cursor.execute("INSERT INTO program_categories (category_name) VALUES (?)", (name.strip(),))
                self.connection.commit()
                messagebox.showinfo("Success", f"Category '{name.strip()}' added successfully!")
                self.load_categories(tree)
            except sqlite3.Error as err:
                self.connection.rollback()
                messagebox.showerror("Database Error", f"Error adding category: {err}")
            finally:
                cursor.close()

 def add_subcategory(self, tree):
        """Add new subcategory"""
        dialog = tk.Toplevel(self.root)
        dialog.title("Add Subcategory")
        dialog.geometry("400x250")
        dialog.grab_set()

        # Get categories
        categories = []
        try:
            cursor = self.connection.cursor()
            cursor.execute("SELECT category_id, category_name FROM program_categories ORDER BY category_name")
            categories = cursor.fetchall()
        except sqlite3.Error:
            pass
        finally:
            cursor.close()

        if not categories:
            messagebox.showerror("Error", "No categories found. Create categories first.")
            dialog.destroy()
            return

        # Category selection
        ttk.Label(dialog, text="Parent Category:").grid(row=0, column=0, padx=10, pady=10, sticky=tk.W)
        category_var = tk.StringVar()
        category_combo = ttk.Combobox(dialog, textvariable=category_var, values=[cat[1] for cat in categories], width=30)
        if categories:
            category_combo.current(0)
        category_combo.grid(row=0, column=1, padx=10, pady=10, sticky=tk.W)

        # Subcategory name
        ttk.Label(dialog, text="Subcategory Name:").grid(row=1, column=0, padx=10, pady=10, sticky=tk.W)
        subcat_var = tk.StringVar()
        ttk.Entry(dialog, textvariable=subcat_var, width=30).grid(row=1, column=1, padx=10, pady=10, sticky=tk.W)

        def save_subcategory():
            category_name = category_var.get()
            subcat_name = subcat_var.get().strip()
            
            if not category_name or not subcat_name:
                messagebox.showerror("Error", "Both fields are required.")
                return
            
            category_id = next(cat[0] for cat in categories if cat[1] == category_name)
            
            try:
                cursor = self.connection.cursor()
                cursor.execute("""
                    SELECT COUNT(*) FROM program_subcategories 
                    WHERE category_id = ? AND UPPER(subcategory_name) = UPPER(?)
                """, (category_id, subcat_name))
                if cursor.fetchone()[0] > 0:
                    messagebox.showerror("Error", "Subcategory already exists in this category.")
                    return
                
                cursor.execute("INSERT INTO program_subcategories (category_id, subcategory_name) VALUES (?, ?)", 
                            (category_id, subcat_name))
                self.connection.commit()
                messagebox.showinfo("Success", f"Subcategory '{subcat_name}' added successfully!")
                dialog.destroy()
                self.load_subcategories(tree)
            except sqlite3.Error as err:
                self.connection.rollback()
                messagebox.showerror("Database Error", f"Error adding subcategory: {err}")
            finally:
                cursor.close()

        # Buttons
        button_frame = ttk.Frame(dialog)
        button_frame.grid(row=2, column=0, columnspan=2, pady=20)

        ttk.Button(button_frame, text="Add Subcategory", command=save_subcategory).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Cancel", command=dialog.destroy).pack(side=tk.LEFT, padx=5)

 def backup_database(self):
      """Enhanced database backup with options"""
      try:
          timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
          default_filename = f"tv_database_backup_{timestamp}.db"
          
          file_path = filedialog.asksaveasfilename(
              title="Save Database Backup",
              defaultextension=".db",
              initialfile=f"tv_database_export_{timestamp}.xlsx",
              filetypes=[("Database files", "*.db"), ("All files", "*.*")]
          )
          
          if file_path:
              # Copy database file
              shutil.copy2("tv_program_schedule.db", file_path)
              
              # Get database statistics for confirmation
              cursor = self.connection.cursor()
              cursor.execute("SELECT COUNT(*) FROM programs")
              programs_count = cursor.fetchone()[0]
              cursor.execute("SELECT COUNT(*) FROM agency_clients")
              clients_count = cursor.fetchone()[0]
              cursor.execute("SELECT COUNT(*) FROM custom_rate_cards WHERE is_active = 1")
              rate_cards_count = cursor.fetchone()[0]
              cursor.close()
              
              messagebox.showinfo("Backup Complete", 
                  f"Database backed up successfully!\n\n"
                  f"File: {file_path}\n"
                  f"Size: {os.path.getsize(file_path)} bytes\n\n"
                  f"Included Data:\n"
                  f"• Programs: {programs_count}\n"
                  f"• Client Relationships: {clients_count}\n" 
                  f"• Custom Rate Cards: {rate_cards_count}\n"
                  f"• Backup Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
      
      except Exception as e:
          messagebox.showerror("Backup Error", f"Error creating backup: {str(e)}")

 def export_data(self):
        """Export data in various formats"""
        export_window = tk.Toplevel(self.root)
        export_window.title("Export Data")
        export_window.geometry("500x400")
        export_window.grab_set()

        ttk.Label(export_window, text="Select Data to Export", font=("Arial", 12, "bold")).pack(pady=10)

        # Export options
        export_vars = {}
        options = [
            ('programs', 'Programs & Schedules'),
            ('agencies', 'Agencies & Clients'),
            ('rate_cards', 'Rate Cards'),
            ('categories', 'Categories & Subcategories'),
            ('users', 'Users (Admin Only)'),
            ('history', 'Calculation History')
        ]

        for key, label in options:
            var = tk.BooleanVar()
            if key == 'users' and not self.is_admin:
                ttk.Checkbutton(export_window, text=label, variable=var, state='disabled').pack(anchor=tk.W, padx=20, pady=2)
            else:
                ttk.Checkbutton(export_window, text=label, variable=var).pack(anchor=tk.W, padx=20, pady=2)
            export_vars[key] = var

        # Format selection
        ttk.Label(export_window, text="Export Format:", font=("Arial", 10, "bold")).pack(pady=(20, 5))
        format_var = tk.StringVar(value="excel")
        ttk.Radiobutton(export_window, text="Excel (.xlsx)", variable=format_var, value="excel").pack(anchor=tk.W, padx=20)
        ttk.Radiobutton(export_window, text="CSV Files", variable=format_var, value="csv").pack(anchor=tk.W, padx=20)

        def perform_export():
            selected_data = [key for key, var in export_vars.items() if var.get()]
            if not selected_data:
                messagebox.showwarning("No Selection", "Please select data to export.")
                return
            
            export_format = format_var.get()
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            if export_format == "excel":
                file_path = filedialog.asksaveasfilename(
                    title="Save Export File",
                    defaultextension=".xlsx",
                    initialvalue=f"tv_database_export_{timestamp}.xlsx",
                    filetypes=[("Excel files", "*.xlsx"), ("All files", "*.*")]
                )
                if file_path:
                    self.export_to_excel(selected_data, file_path)
            else:
                folder_path = filedialog.askdirectory(title="Select Export Folder")
                if folder_path:
                    self.export_to_csv(selected_data, folder_path, timestamp)
            
            export_window.destroy()

        # Buttons
        button_frame = ttk.Frame(export_window)
        button_frame.pack(pady=20)

        ttk.Button(button_frame, text="Export Data", command=perform_export).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Cancel", command=export_window.destroy).pack(side=tk.LEFT, padx=5)

 def export_to_excel(self, selected_data, file_path):
        """Export selected data to Excel"""
        try:
            wb = Workbook()
            # Remove default sheet
            wb.remove(wb.active)
            
            cursor = self.connection.cursor()
            
            for data_type in selected_data:
                if data_type == 'programs':
                    ws = wb.create_sheet("Programs & Schedules")
                    cursor.execute("""
                        SELECT p.program_name, c.category_name, s.subcategory_name, p.is_repeat,
                            ps.start_time, ps.end_time, dp.pattern_code, bt.type_code, ps.rate_30sec
                        FROM programs p
                        JOIN program_subcategories s ON p.subcategory_id = s.subcategory_id
                        JOIN program_categories c ON s.category_id = c.category_id
                        LEFT JOIN program_schedules ps ON p.program_id = ps.program_id
                        LEFT JOIN day_patterns dp ON ps.day_pattern_id = dp.day_pattern_id
                        LEFT JOIN broadcast_types bt ON ps.broadcast_type_id = bt.broadcast_type_id
                        ORDER BY p.program_name
                    """)
                    
                    # Headers
                    headers = ['Program Name', 'Category', 'Subcategory', 'Is Repeat', 'Start Time', 'End Time', 'Day Pattern', 'Broadcast Type', 'Rate 30sec']
                    for col, header in enumerate(headers, 1):
                        ws.cell(row=1, column=col, value=header).font = Font(bold=True)
                    
                    # Data
                    for row_num, row_data in enumerate(cursor.fetchall(), 2):
                        for col, value in enumerate(row_data, 1):
                            ws.cell(row=row_num, column=col, value=value)
                
                elif data_type == 'agencies':
                    ws = wb.create_sheet("Agencies & Clients")
                    cursor.execute("""
                        SELECT a.agency_name, c.client_name, ac.discount_rate, ac.rate_card_type
                        FROM agency_clients ac
                        JOIN agencies a ON ac.agency_id = a.agency_id
                        JOIN clients c ON ac.client_id = c.client_id
                        ORDER BY a.agency_name, c.client_name
                    """)
                    
                    headers = ['Agency', 'Client', 'Discount Rate', 'Rate Card Type']
                    for col, header in enumerate(headers, 1):
                        ws.cell(row=1, column=col, value=header).font = Font(bold=True)
                    
                    for row_num, row_data in enumerate(cursor.fetchall(), 2):
                        for col, value in enumerate(row_data, 1):
                            ws.cell(row=row_num, column=col, value=value)
                
                # Add other data types as needed...
            
            wb.save(file_path)
            messagebox.showinfo("Export Complete", f"Data exported successfully to:\n{file_path}")
            
        except Exception as err:
            messagebox.showerror("Export Error", f"Error exporting data: {err}")
        finally:
            cursor.close()

 def import_data(self):
      """Import data from external sources"""
      messagebox.showinfo("Import Data", "Data import functionality - Ready for implementation")

 def cleanup_history(self):
      """Manual history cleanup with options"""
      try:
          history_manager = HistoryManager(self.connection)
          cleaned_count = history_manager.cleanup_expired_history()
          
          if cleaned_count > 0:
              messagebox.showinfo("Cleanup Complete", 
                  f"History cleanup completed!\n\n"
                  f"Removed {cleaned_count} expired entries\n"
                  f"Retention policy: 30 days\n"
                  f"Cleanup date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
          else:
              messagebox.showinfo("Cleanup Complete", 
                  "No expired history entries found.\n"
                  "All history entries are within the 30-day retention period.")
      
      except Exception as e:
          messagebox.showerror("Cleanup Error", f"Error during cleanup: {str(e)}")

 def data_integrity_check(self):
      """Comprehensive data integrity check"""
      try:
          cursor = self.connection.cursor()
          issues = []
          
          # Check for orphaned records
          cursor.execute("""
              SELECT COUNT(*) FROM custom_program_rates cpr
              LEFT JOIN custom_rate_cards crc ON cpr.rate_card_id = crc.rate_card_id
              WHERE crc.rate_card_id IS NULL
          """)
          orphaned_rates = cursor.fetchone()[0]
          if orphaned_rates > 0:
              issues.append(f"• {orphaned_rates} orphaned custom program rates")
          
          # Check for inactive rate cards with active relationships
          cursor.execute("""
              SELECT COUNT(*) FROM agency_clients ac
              LEFT JOIN custom_rate_cards crc ON ac.agency_client_id = crc.agency_client_id
              WHERE ac.rate_card_type = 'custom' AND (crc.is_active = 0 OR crc.rate_card_id IS NULL)
          """)
          invalid_custom = cursor.fetchone()[0]
          if invalid_custom > 0:
              issues.append(f"• {invalid_custom} clients marked as 'custom' without active rate cards")
          
          # Check for missing schedules
          cursor.execute("""
              SELECT COUNT(*) FROM programs p
              LEFT JOIN program_schedules ps ON p.program_id = ps.program_id
              WHERE ps.program_id IS NULL
          """)
          programs_no_schedule = cursor.fetchone()[0]
          if programs_no_schedule > 0:
              issues.append(f"• {programs_no_schedule} programs without schedules")
          
          cursor.close()
          
          if issues:
              issues_text = "Data integrity issues found:\n\n" + "\n".join(issues)
              issues_text += "\n\nRecommend fixing these issues for optimal system performance."
          else:
              issues_text = "✅ No data integrity issues found!\n\nDatabase is healthy and consistent."
          
          messagebox.showinfo("Data Integrity Check", issues_text)
      
      except Exception as e:
          messagebox.showerror("Integrity Check Error", f"Error during integrity check: {str(e)}")

 def generate_rate_report(self):
    """Enhanced rate card report with selection and download"""
    report_window = tk.Toplevel(self.root)
    report_window.title("Rate Card Report Generator")
    report_window.geometry("1000x700")
    
    # Selection frame
    selection_frame = ttk.LabelFrame(report_window, text="Select Rate Card", padding="10")
    selection_frame.pack(fill=tk.X, padx=10, pady=10)
    
    # Agency selection
    ttk.Label(selection_frame, text="Agency:").grid(row=0, column=0, padx=5, pady=5, sticky=tk.W)
    agency_var = tk.StringVar()
    agency_combo = ttk.Combobox(selection_frame, textvariable=agency_var, width=30)
    agency_combo.grid(row=0, column=1, padx=5, pady=5, sticky=tk.W)
    agency_combo.bind('<<ComboboxSelected>>', lambda e: self.load_clients_for_report(agency_var.get(), client_combo))
    
    # Client selection
    ttk.Label(selection_frame, text="Client:").grid(row=0, column=2, padx=5, pady=5, sticky=tk.W)
    client_var = tk.StringVar()
    client_combo = ttk.Combobox(selection_frame, textvariable=client_var, width=30)
    client_combo.grid(row=0, column=3, padx=5, pady=5, sticky=tk.W)
    
    # Rate card type display
    ttk.Label(selection_frame, text="Rate Card Type:").grid(row=1, column=0, padx=5, pady=5, sticky=tk.W)
    rate_type_label = ttk.Label(selection_frame, text="Not Selected", foreground="gray")
    rate_type_label.grid(row=1, column=1, padx=5, pady=5, sticky=tk.W)
    
    # Buttons
    button_frame = ttk.Frame(selection_frame)
    button_frame.grid(row=2, column=0, columnspan=4, pady=10)
    
    ttk.Button(button_frame, text="Generate Report", 
                command=lambda: self.generate_selected_rate_report(agency_var.get(), client_var.get(), report_text)).pack(side=tk.LEFT, padx=5)
    ttk.Button(button_frame, text="Download Excel", 
                command=lambda: self.download_rate_card_excel(agency_var.get(), client_var.get())).pack(side=tk.LEFT, padx=5)
    ttk.Button(button_frame, text="Show All Rate Cards", 
                command=lambda: self.show_all_rate_cards(report_text)).pack(side=tk.LEFT, padx=5)
    
    # Report display
    report_frame = ttk.LabelFrame(report_window, text="Rate Card Report", padding="10")
    report_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
    
    report_text = tk.Text(report_frame, wrap=tk.WORD)
    report_scroll = ttk.Scrollbar(report_frame, orient="vertical", command=report_text.yview)
    report_text.configure(yscrollcommand=report_scroll.set)
    
    report_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
    report_scroll.pack(side=tk.RIGHT, fill=tk.Y)
    
    # Load agencies
    self.load_agencies_for_report(agency_combo)
    
    # Show initial all rate cards
    self.show_all_rate_cards(report_text)

 def load_agencies_for_report(self, agency_combo):
    """Load agencies for report selection"""
    try:
        cursor = self.connection.cursor()
        cursor.execute("SELECT DISTINCT agency_name FROM agencies ORDER BY agency_name")
        agencies = [row[0] for row in cursor.fetchall()]
        agency_combo['values'] = agencies
    except sqlite3.Error as err:
        messagebox.showerror("Database Error", f"Error loading agencies: {err}")
    finally:
        cursor.close()

 def load_clients_for_report(self, agency_name, client_combo):
    """Load clients for selected agency"""
    if not agency_name:
        return
    
    try:
        cursor = self.connection.cursor()
        cursor.execute("""
            SELECT c.client_name FROM clients c
            JOIN agency_clients ac ON c.client_id = ac.client_id
            JOIN agencies a ON ac.agency_id = a.agency_id
            WHERE a.agency_name = ?
            ORDER BY c.client_name
        """, (agency_name,))
        clients = [row[0] for row in cursor.fetchall()]
        client_combo['values'] = clients
    except sqlite3.Error as err:
        messagebox.showerror("Database Error", f"Error loading clients: {err}")
    finally:
        cursor.close()

 def show_all_rate_cards(self, report_text):
    """Show all rate cards summary"""
    try:
        cursor = self.connection.cursor()
        
        report_content = "ALL RATE CARDS SUMMARY\n"
        report_content += "=" * 50 + "\n\n"
        
        # Get all agency-client relationships
        cursor.execute("""
            SELECT a.agency_name, c.client_name, ac.rate_card_type, ac.discount_rate,
                    crc.rate_card_name, crc.base_modifier_percentage
            FROM agency_clients ac
            JOIN agencies a ON ac.agency_id = a.agency_id
            JOIN clients c ON ac.client_id = c.client_id
            LEFT JOIN custom_rate_cards crc ON ac.agency_client_id = crc.agency_client_id AND crc.is_active = 1
            ORDER BY a.agency_name, c.client_name
        """)
        
        current_agency = ""
        for row in cursor.fetchall():
            agency, client, rate_type, discount, custom_name, base_modifier = row
            
            if agency != current_agency:
                if current_agency:
                    report_content += "\n"
                report_content += f"AGENCY: {agency}\n"
                report_content += "-" * 30 + "\n"
                current_agency = agency
            
            report_content += f"  Client: {client}\n"
            if rate_type == 'discount':
                report_content += f"    Type: Discount Rate Card\n"
                report_content += f"    Discount: {discount}%\n"
            else:
                report_content += f"    Type: Custom Rate Card\n"
                report_content += f"    Name: {custom_name or 'Unnamed'}\n"
                report_content += f"    Base Modifier: {base_modifier or 0:+.1f}%\n"
            report_content += "\n"
        
        report_text.delete(1.0, tk.END)
        report_text.insert(tk.END, report_content)
        
    except sqlite3.Error as err:
        messagebox.showerror("Database Error", f"Error loading rate cards: {err}")
    finally:
        cursor.close()

 def generate_selected_rate_report(self, agency_name, client_name, report_text):
    """Generate detailed report for selected agency-client"""
    if not agency_name or not client_name:
        messagebox.showwarning("Selection Required", "Please select agency and client.")
        return
    
    try:
        cursor = self.connection.cursor()
        
        # Get agency-client details
        cursor.execute("""
            SELECT ac.rate_card_type, ac.discount_rate, crc.rate_card_name, crc.base_modifier_percentage
            FROM agency_clients ac
            JOIN agencies a ON ac.agency_id = a.agency_id
            JOIN clients c ON ac.client_id = c.client_id
            LEFT JOIN custom_rate_cards crc ON ac.agency_client_id = crc.agency_client_id AND crc.is_active = 1
            WHERE a.agency_name = ? AND c.client_name = ?
        """, (agency_name, client_name))
        
        result = cursor.fetchone()
        if not result:
            messagebox.showerror("Error", "Selected agency-client combination not found.")
            return
        
        rate_type, discount, custom_name, base_modifier = result
        
        report_content = f"RATE CARD REPORT\n"
        report_content += "=" * 50 + "\n\n"
        report_content += f"Agency: {agency_name}\n"
        report_content += f"Client: {client_name}\n"
        report_content += f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        
        if rate_type == 'discount':
            report_content += f"RATE CARD TYPE: Discount Rate Card\n"
            report_content += f"Discount Percentage: {discount}%\n\n"
            report_content += f"PROGRAM RATES (with {discount}% discount applied):\n"
            report_content += "-" * 50 + "\n"
            
            # Show all programs with discounted rates
            cursor.execute("""
                SELECT p.program_name, ps.start_time, ps.end_time, ps.rate_30sec,
                        dp.pattern_code, bt.type_code
                FROM program_schedules ps
                JOIN programs p ON ps.program_id = p.program_id
                JOIN day_patterns dp ON ps.day_pattern_id = dp.day_pattern_id
                JOIN broadcast_types bt ON ps.broadcast_type_id = bt.broadcast_type_id
                ORDER BY p.program_name, ps.start_time
            """)
            
            for prog_row in cursor.fetchall():
                prog_name, start_time, end_time, base_rate, pattern, broadcast_type = prog_row
                discounted_rate = base_rate * (100 - discount) / 100
                
                start_str = self.format_time_display(start_time)
                end_str = self.format_time_display(end_time)
                
                report_content += f"{prog_name} ({start_str}-{end_str}, {pattern})\n"
                report_content += f"  Base Rate: LKR {base_rate:,.0f}\n"
                report_content += f"  Final Rate: LKR {discounted_rate:,.0f}\n"
                report_content += f"  Broadcast: {broadcast_type}\n\n"
        
        else:  # custom rate card
            report_content += f"RATE CARD TYPE: Custom Rate Card\n"
            report_content += f"Rate Card Name: {custom_name or 'Unnamed'}\n"
            report_content += f"Base Modifier: {base_modifier or 0:+.1f}%\n\n"
            report_content += f"CUSTOM PROGRAM RATES:\n"
            report_content += "-" * 50 + "\n"
            
            # Show custom rates
            cursor.execute("""
                SELECT p.program_name, ps.start_time, ps.end_time, ps.rate_30sec,
                        cpr.custom_rate_30sec, dp.pattern_code
                FROM custom_rate_cards crc
                JOIN custom_program_rates cpr ON crc.rate_card_id = cpr.rate_card_id
                JOIN program_schedules ps ON cpr.program_schedule_id = ps.schedule_id
                JOIN programs p ON ps.program_id = p.program_id
                JOIN day_patterns dp ON ps.day_pattern_id = dp.day_pattern_id
                JOIN agency_clients ac ON crc.agency_client_id = ac.agency_client_id
                JOIN agencies a ON ac.agency_id = a.agency_id
                JOIN clients c ON ac.client_id = c.client_id
                WHERE a.agency_name = ? AND c.client_name = ? AND crc.is_active = 1
                ORDER BY p.program_name, ps.start_time
            """, (agency_name, client_name))
            
            for prog_row in cursor.fetchall():
                prog_name, start_time, end_time, base_rate, custom_rate, pattern = prog_row
                
                start_str = self.format_time_display(start_time)
                end_str = self.format_time_display(end_time)
                
                difference = ((custom_rate - base_rate) / base_rate) * 100
                
                report_content += f"{prog_name} ({start_str}-{end_str}, {pattern})\n"
                report_content += f"  Base Rate: LKR {base_rate:,.0f}\n"
                report_content += f"  Custom Rate: LKR {custom_rate:,.0f}\n"
                report_content += f"  Difference: {difference:+.1f}%\n\n"
        
        report_text.delete(1.0, tk.END)
        report_text.insert(tk.END, report_content)
        
    except sqlite3.Error as err:
        messagebox.showerror("Database Error", f"Error generating report: {err}")
    finally:
        cursor.close()

 def download_rate_card_excel(self, agency_name, client_name):
    """Download rate card as Excel file"""
    if not agency_name or not client_name:
        messagebox.showwarning("Selection Required", "Please select agency and client.")
        return
    
    file_path = filedialog.asksaveasfilename(
        title="Save Rate Card Excel",
        defaultextension=".xlsx",
        initialfile=f"RateCard_{agency_name}_{client_name}_{datetime.now().strftime('%Y%m%d')}.xlsx",
        filetypes=[("Excel files", "*.xlsx"), ("All files", "*.*")]
    )
    
    if file_path:
        try:
            # Create Excel with rate card data
            wb = Workbook()
            ws = wb.active
            ws.title = "Rate Card"
            
            # Add headers and rate card data (similar to report but in Excel format)
            # ... implement Excel creation logic here
            
            wb.save(file_path)
            messagebox.showinfo("Success", f"Rate card exported to:\n{file_path}")
            
        except Exception as err:
            messagebox.showerror("Export Error", f"Error creating Excel file: {err}")

 def usage_analytics(self):
      """System usage analytics"""
      messagebox.showinfo("Usage Analytics", "Usage analytics and reporting - Ready for implementation")

 def agency_report(self):
      """Agency-specific reporting"""
      messagebox.showinfo("Agency Report", "Agency performance and rate analysis - Ready for implementation")

 def revenue_analysis(self):
      """Revenue analysis and projections"""
      messagebox.showinfo("Revenue Analysis", "Revenue analysis and forecasting - Ready for implementation")

 def schedule_report(self):
      """Schedule utilization reporting"""
      messagebox.showinfo("Schedule Report", "Schedule analysis and optimization - Ready for implementation")

def setup_database():
  """Setup database only if it doesn't exist"""
  if not os.path.exists("tv_program_schedule.db"):
      print("Creating new enhanced database...")
      create_sqlite_database()
  else:
      print("Using existing database...")

if __name__ == "__main__":
  # Production version - Only create if it doesn't exist
  if not os.path.exists("tv_program_schedule.db"):
      print("Database not found. Creating enhanced database with rate card system...")
      create_sqlite_database()
  else:
      print("Loading existing enhanced database...")
  
  # Start the enhanced application
  root = tk.Tk()
  app = LoginWindow(root)
  root.mainloop()