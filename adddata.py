import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import sqlite3
import pandas as pd
from datetime import datetime, time
import hashlib
import os

class TVDataImportApp:
    def __init__(self, root):
        self.root = root
        
        self.root.geometry("1000x700")
        
        self.connection = self.connect_to_database()
        if not self.connection:
            messagebox.showerror("Database Error", "Could not connect to database!")
            return
        
        self.import_data = None
        self.create_widgets()

    def connect_to_database(self):
        try:
            connection = sqlite3.connect("tv_program_schedule.db")
            connection.execute("PRAGMA foreign_keys = ON")
            return connection
        except sqlite3.Error as err:
            messagebox.showerror("Database Error", f"Failed to connect: {err}")
            return None

    def create_widgets(self):
        
        file_frame = ttk.LabelFrame(self.root, text="Step 1: Load Excel File", padding="10")
        file_frame.pack(fill=tk.X, padx=20, pady=10)
        
        ttk.Button(file_frame, text="📁 Load Excel File", 
                command=self.load_excel_file).pack(side=tk.LEFT, padx=10)
        
        self.file_label = ttk.Label(file_frame, text="No file loaded", foreground="gray")
        self.file_label.pack(side=tk.LEFT, padx=10)
        
        preview_frame = ttk.LabelFrame(self.root, text="Step 2: Data Preview", padding="10")
        preview_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)
        
        columns = ('category', 'subcategory', 'program', 'day_pattern', 'pt_npt', 'rate', 'start_time', 'end_time')
        self.preview_tree = ttk.Treeview(preview_frame, columns=columns, show='headings', height=15)
        
        self.preview_tree.heading('category', text='Category')
        self.preview_tree.heading('subcategory', text='Subcategory')
        self.preview_tree.heading('program', text='Program')
        self.preview_tree.heading('day_pattern', text='Day Pattern')
        self.preview_tree.heading('pt_npt', text='PT/NPT')
        self.preview_tree.heading('rate', text='30 Sec Rate')
        self.preview_tree.heading('start_time', text='Start Time')
        self.preview_tree.heading('end_time', text='End Time')
        
        for col in columns:
            self.preview_tree.column(col, width=100)
        
        v_scroll = ttk.Scrollbar(preview_frame, orient="vertical", command=self.preview_tree.yview)
        h_scroll = ttk.Scrollbar(preview_frame, orient="horizontal", command=self.preview_tree.xview)
        self.preview_tree.configure(yscrollcommand=v_scroll.set, xscrollcommand=h_scroll.set)
        
        self.preview_tree.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        v_scroll.grid(row=0, column=1, sticky=(tk.N, tk.S))
        h_scroll.grid(row=1, column=0, sticky=(tk.W, tk.E))
        
        preview_frame.grid_rowconfigure(0, weight=1)
        preview_frame.grid_columnconfigure(0, weight=1)
        
        import_frame = ttk.LabelFrame(self.root, text="Step 3: Clear & Import Data", padding="10")
        import_frame.pack(fill=tk.X, padx=20, pady=10)
        
        self.progress_var = tk.DoubleVar()
        self.progress_bar = ttk.Progressbar(import_frame, variable=self.progress_var, maximum=100)
        self.progress_bar.pack(fill=tk.X, pady=5)
        
        self.status_label = ttk.Label(import_frame, text="Ready to import", foreground="blue")
        self.status_label.pack(pady=5)
        
        button_frame = ttk.Frame(import_frame)
        button_frame.pack(pady=10)
        
        self.import_btn = ttk.Button(button_frame, text="🚀 Clear & Import All Data", 
                                    command=self.start_import, state=tk.DISABLED)
        self.import_btn.pack(side=tk.LEFT, padx=10)
        
        ttk.Button(button_frame, text="🔍 Check Database", 
                command=self.check_database).pack(side=tk.LEFT, padx=10)
        
        ttk.Button(button_frame, text="❌ Close", 
                command=self.root.quit).pack(side=tk.LEFT, padx=10)

    def load_excel_file(self):
        file_path = filedialog.askopenfilename(
            title="Select Excel File",
            filetypes=[("Excel files", "*.xlsx *.xls"), ("All files", "*.*")]
        )
        
        if not file_path:
            return
        
        try:
            df = pd.read_excel(file_path)
            
            required_columns = ['categories', 'subcategories', 'Program', 'Day pattern', 'PT/NPT', '30 Sec.', 'Start Time', 'End Time']
            missing_columns = [col for col in required_columns if col not in df.columns]
            
            if missing_columns:
                messagebox.showerror("Column Error", f"Missing required columns: {', '.join(missing_columns)}")
                return
            
            self.import_data = df
            
            filename = os.path.basename(file_path)
            self.file_label.config(text=f"Loaded: {filename} ({len(df)} rows)", foreground="green")
            
            self.preview_data()
            self.import_btn.config(state=tk.NORMAL)
            
        except Exception as e:
            messagebox.showerror("File Error", f"Error loading file: {str(e)}")

    def time_to_string(self, time_obj):
        """Convert time object to HH:MM string - FIXED VERSION"""
        if pd.isna(time_obj) or time_obj is None:
            return "00:00"
        
        try:
            # Check if it's already a time object by looking for hour/minute attributes
            if hasattr(time_obj, 'hour') and hasattr(time_obj, 'minute'):
                return f"{time_obj.hour:02d}:{time_obj.minute:02d}"
            
            # Check if it's a string with time format
            time_str = str(time_obj)
            if ":" in time_str:
                # Extract just the HH:MM part
                time_parts = time_str.split(":")
                if len(time_parts) >= 2:
                    try:
                        hours = int(time_parts[0])
                        minutes = int(time_parts[1])
                        if 0 <= hours <= 23 and 0 <= minutes <= 59:
                            return f"{hours:02d}:{minutes:02d}"
                    except ValueError:
                        pass
            
            return "00:00"
            
        except Exception as e:
            print(f"Error converting time {time_obj}: {e}")
            return "00:00"

    def preview_data(self):
        for item in self.preview_tree.get_children():
            self.preview_tree.delete(item)
        
        if self.import_data is None:
            return
        
        preview_rows = min(20, len(self.import_data))
        
        for index, row in self.import_data.head(preview_rows).iterrows():
            raw_start = row.get('Start Time')
            raw_end = row.get('End Time')
            
            # Based on your data: End Time column = start times, Start Time column = end times
            actual_start_time = self.time_to_string(raw_end)  # End Time column = actual start
            actual_end_time = self.time_to_string(raw_start)  # Start Time column = actual end
            
            self.preview_tree.insert('', tk.END, values=(
                row.get('categories', ''),
                row.get('subcategories', ''),
                row.get('Program', ''),
                row.get('Day pattern', ''),
                row.get('PT/NPT', ''),
                f"LKR {row.get('30 Sec.', 0):,.0f}",
                actual_start_time,
                actual_end_time
            ))
        
        if len(self.import_data) > 20:
            self.preview_tree.insert('', tk.END, values=(
                '...', f'({len(self.import_data) - 20} more rows)', '...', '...', '...', '...', '...', '...'
            ))

    def clear_all_data(self, cursor):
        tables_to_clear = [
            'custom_program_rates',
            'custom_rate_cards', 
            'calculation_history',
            'program_schedules',
            'programs',
            'program_subcategories',
            'program_categories',
            'agency_clients',
            'agencies',
            'clients',
            'day_patterns',
            'broadcast_types'
        ]
        
        for table in tables_to_clear:
            try:
                cursor.execute(f"DELETE FROM {table}")
                print(f"Cleared table: {table}")
            except sqlite3.Error as e:
                print(f"Error clearing {table}: {e}")

    def start_import(self):
        if self.import_data is None:
            messagebox.showerror("No Data", "Please load an Excel file first.")
            return
        
        response = messagebox.askyesno(
            "⚠️ CLEAR ALL DATA & IMPORT", 
            f"This will:\n\n"
            f"❌ DELETE ALL existing data in the database\n"
            f"✅ Import {len(self.import_data)} new records\n\n"
            f"This action CANNOT be undone!\n\n"
            f"Continue?"
        )
        
        if not response:
            return
        
        self.import_btn.config(state=tk.DISABLED)
        
        try:
            self.perform_import()
        except Exception as e:
            messagebox.showerror("Import Error", f"Error during import: {str(e)}")
        finally:
            self.import_btn.config(state=tk.NORMAL)

    def perform_import(self):
        cursor = self.connection.cursor()
        total_rows = len(self.import_data)
        
        try:
            self.update_status("Clearing all existing data...", 5)
            self.clear_all_data(cursor)
            
            self.update_status("Importing categories and subcategories...", 15)
            self.import_categories_subcategories(cursor)
            
            self.update_status("Importing day patterns...", 25)
            self.import_day_patterns(cursor)
            
            self.update_status("Importing broadcast types...", 35)
            self.import_broadcast_types(cursor)
            
            self.update_status("Importing programs and schedules...", 45)
            
            success_count = 0
            error_count = 0
            error_details = []
            
            for index, row in self.import_data.iterrows():
                try:
                    self.import_single_program(cursor, row, index)
                    success_count += 1
                except Exception as e:
                    error_msg = f"Row {index}: {str(e)}"
                    error_details.append(error_msg)
                    error_count += 1
                
                progress = 45 + (index / total_rows) * 50
                self.update_status(f"Importing programs... {index + 1}/{total_rows}", progress)
            
            self.connection.commit()
            self.update_status(f"Import completed! Success: {success_count}, Errors: {error_count}", 100)
            
            result_message = f"Database cleared and import finished!\n\n✅ Successfully imported: {success_count}\n❌ Errors: {error_count}"
            
            if error_details and len(error_details) <= 5:
                result_message += f"\n\nError details:\n" + "\n".join(error_details[:5])
            
            messagebox.showinfo("Import Complete", result_message)
            
        except Exception as e:
            self.connection.rollback()
            raise e

    def import_categories_subcategories(self, cursor):
        categories = self.import_data['categories'].unique()
        
        for category in categories:
            if pd.notna(category) and category.strip():
                cursor.execute("INSERT INTO program_categories (category_name) VALUES (?)", (category.strip(),))
                
                cursor.execute("SELECT category_id FROM program_categories WHERE category_name = ?", (category.strip(),))
                category_id = cursor.fetchone()[0]
                
                subcategories = self.import_data[self.import_data['categories'] == category]['subcategories'].unique()
                
                for subcategory in subcategories:
                    if pd.notna(subcategory) and subcategory.strip():
                        cursor.execute("INSERT INTO program_subcategories (category_id, subcategory_name) VALUES (?, ?)", (category_id, subcategory.strip()))

    def import_day_patterns(self, cursor):
        day_patterns = self.import_data['Day pattern'].unique()
        
        for pattern in day_patterns:
            if pd.notna(pattern) and pattern.strip():
                pattern_code = pattern.strip()
                
                description_map = {
                    'Wkdays': 'Weekdays: Monday through Friday',
                    'Wkends': 'Weekends: Saturday and Sunday',
                    'Daily': 'Every day of the week',
                    'Monday': 'Monday only',
                    'Tuesday': 'Tuesday only',
                    'Wednesday': 'Wednesday only',
                    'Thursday': 'Thursday only',
                    'Friday': 'Friday only',
                    'Sat.day': 'Saturday only',
                    'Sunday': 'Sunday only',
                    'Tue-Fri': 'Tuesday through Friday',
                    'Poya Days': 'Poya Days'
                }
                
                description = description_map.get(pattern_code, f"Day pattern: {pattern_code}")
                cursor.execute("INSERT INTO day_patterns (pattern_code, description) VALUES (?, ?)", (pattern_code, description))

    def import_broadcast_types(self, cursor):
        broadcast_types = self.import_data['PT/NPT'].unique()
        
        for bt in broadcast_types:
            if pd.notna(bt) and bt.strip():
                bt_code = bt.strip()
                
                if bt_code == 'PT':
                    description = 'Prime Time'
                elif bt_code == 'NPT':
                    description = 'Non-Prime Time'
                else:
                    description = bt_code
                
                cursor.execute("INSERT INTO broadcast_types (type_code, description) VALUES (?, ?)", (bt_code, description))

    def time_to_string(self, time_obj):
        """Convert time object to HH:MM string - COMPLETELY FIXED VERSION"""
        if pd.isna(time_obj) or time_obj is None:
            return "00:00"
        
        try:
            # Convert to string first and parse
            time_str = str(time_obj)
            print(f"Converting time string: '{time_str}'")
            
            # Look for HH:MM:SS or HH:MM pattern
            if ":" in time_str:
                time_parts = time_str.split(":")
                if len(time_parts) >= 2:
                    try:
                        hours = int(time_parts[0])
                        minutes = int(time_parts[1])
                        if 0 <= hours <= 23 and 0 <= minutes <= 59:
                            result = f"{hours:02d}:{minutes:02d}"
                            print(f"Successfully converted to: {result}")
                            return result
                    except ValueError as ve:
                        print(f"Error parsing time parts: {ve}")
            
            # If all else fails, try to get attributes directly
            if hasattr(time_obj, 'hour') and hasattr(time_obj, 'minute'):
                result = f"{time_obj.hour:02d}:{time_obj.minute:02d}"
                print(f"Converted using attributes: {result}")
                return result
            
            print(f"Could not convert time object: {time_obj}")
            return "00:00"
            
        except Exception as e:
            print(f"Exception converting time {time_obj}: {e}")
            return "00:00"

    def import_single_program(self, cursor, row, row_index):
        """Import single program - FIXED VERSION"""
        program_name = row.get('Program', '').strip()
        category_name = row.get('categories', '').strip()
        subcategory_name = row.get('subcategories', '').strip()
        day_pattern = row.get('Day pattern', '').strip()
        broadcast_type = row.get('PT/NPT', '').strip()
        rate = row.get('30 Sec.', 0)
        
        # Get raw time objects
        start_time_obj = row.get('End Time')    # End Time column contains start times
        end_time_obj = row.get('Start Time')    # Start Time column contains end times
        
        print(f"\n=== Row {row_index} - {program_name} ===")
        print(f"Raw start object: {start_time_obj} (type: {type(start_time_obj)})")
        print(f"Raw end object: {end_time_obj} (type: {type(end_time_obj)})")
        
        # Convert to string format
        start_time = self.time_to_string(start_time_obj)
        end_time = self.time_to_string(end_time_obj)
        
        print(f"Converted times: {start_time} to {end_time}")
        
        if start_time == "00:00" and end_time == "00:00":
            print(f"WARNING: Both times are 00:00 for {program_name}, skipping...")
            return  # Skip this row
        
        if not all([program_name, category_name, subcategory_name, day_pattern, broadcast_type]):
            raise ValueError("Missing required data")
        
        cursor.execute("""
            SELECT s.subcategory_id 
            FROM program_subcategories s
            JOIN program_categories c ON s.category_id = c.category_id
            WHERE c.category_name = ? AND s.subcategory_name = ?
        """, (category_name, subcategory_name))
        
        subcategory_result = cursor.fetchone()
        if not subcategory_result:
            raise ValueError(f"Subcategory not found: {category_name} - {subcategory_name}")
        
        subcategory_id = subcategory_result[0]
        
        cursor.execute("SELECT program_id FROM programs WHERE program_name = ?", (program_name,))
        program_result = cursor.fetchone()
        
        if program_result:
            program_id = program_result[0]
        else:
            is_repeat = 'rpt' in program_name.lower() or 'repeat' in program_name.lower()
            cursor.execute("INSERT INTO programs (program_name, subcategory_id, is_repeat, original_program_id) VALUES (?, ?, ?, ?)", (program_name, subcategory_id, is_repeat, None))
            program_id = cursor.lastrowid
        
        cursor.execute("SELECT day_pattern_id FROM day_patterns WHERE pattern_code = ?", (day_pattern,))
        day_pattern_result = cursor.fetchone()
        if not day_pattern_result:
            raise ValueError(f"Day pattern not found: {day_pattern}")
        day_pattern_id = day_pattern_result[0]
        
        cursor.execute("SELECT broadcast_type_id FROM broadcast_types WHERE type_code = ?", (broadcast_type,))
        broadcast_type_result = cursor.fetchone()
        if not broadcast_type_result:
            raise ValueError(f"Broadcast type not found: {broadcast_type}")
        broadcast_type_id = broadcast_type_result[0]
        
        # Format for database with seconds
        db_start_time = f"{start_time}:00"
        db_end_time = f"{end_time}:00"
        
        print(f"Database format: {db_start_time} to {db_end_time}")
        
        cursor.execute("""
            SELECT schedule_id FROM program_schedules 
            WHERE program_id = ? AND day_pattern_id = ? AND start_time = ? AND end_time = ?
        """, (program_id, day_pattern_id, db_start_time, db_end_time))
        
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO program_schedules 
                (program_id, day_pattern_id, start_time, end_time, broadcast_type_id, rate_30sec)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (program_id, day_pattern_id, db_start_time, db_end_time, broadcast_type_id, float(rate)))
            print(f"✅ Inserted: {program_name} - {db_start_time} to {db_end_time}")

    def update_status(self, message, progress):
        self.status_label.config(text=message)
        self.progress_var.set(progress)
        self.root.update_idletasks()

    def check_database(self):
        try:
            cursor = self.connection.cursor()
            
            cursor.execute("SELECT COUNT(*) FROM program_categories")
            categories_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM program_subcategories")
            subcategories_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM programs")
            programs_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM program_schedules")
            schedules_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM day_patterns")
            day_patterns_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM broadcast_types")
            broadcast_types_count = cursor.fetchone()[0]
            
            # Get actual time samples - exclude 00:00:00 times
            cursor.execute("""
                SELECT p.program_name, ps.start_time, ps.end_time 
                FROM program_schedules ps
                JOIN programs p ON ps.program_id = p.program_id
                WHERE ps.start_time != '00:00:00' AND ps.end_time != '00:00:00'
                ORDER BY ps.start_time
                LIMIT 10
            """)
            valid_times = cursor.fetchall()
            
            # Get count of invalid times
            cursor.execute("""
                SELECT COUNT(*) FROM program_schedules 
                WHERE start_time = '00:00:00' AND end_time = '00:00:00'
            """)
            invalid_count = cursor.fetchone()[0]
            
            if valid_times:
                time_samples = "Programs with valid times:\n" + "\n".join([f"  {prog}: {start} - {end}" for prog, start, end in valid_times])
            else:
                time_samples = "⚠️ NO programs with valid times found!"
            
            if invalid_count > 0:
                time_samples += f"\n\n❌ {invalid_count} programs with invalid times (00:00:00)"
            
            messagebox.showinfo(
                "Database Status",
                f"Database Content:\n\n"
                f"📁 Categories: {categories_count}\n"
                f"📂 Subcategories: {subcategories_count}\n"
                f"📺 Programs: {programs_count}\n"
                f"📅 Schedules: {schedules_count}\n"
                f"📋 Day Patterns: {day_patterns_count}\n"
                f"📊 Broadcast Types: {broadcast_types_count}\n\n"
                f"{time_samples}"
            )
            
        except sqlite3.Error as e:
            messagebox.showerror("Database Error", f"Error checking database: {e}")
        finally:
            cursor.close()

if __name__ == "__main__":
    if not os.path.exists("tv_program_schedule.db"):
        print("Database not found!")
        exit(1)

    root = tk.Tk()
    app = TVDataImportApp(root)
    root.mainloop()