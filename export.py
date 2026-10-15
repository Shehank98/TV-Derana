import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import pandas as pd
import numpy as np
from datetime import datetime
import os
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill

class TVScheduleSpotExtractor:
    def __init__(self, root):
        self.root = root
        self.root.title("TV Schedule Spot Count Extractor")
        self.root.geometry("1200x800")
        
        self.raw_data = None
        self.processed_data = []
        
        self.create_interface()

    def create_interface(self):
        """Create interface focused on spot extraction"""
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Title
        title_label = ttk.Label(main_frame, text="TV Schedule - Spot Count Extractor", 
                            font=('Arial', 16, 'bold'))
        title_label.pack(pady=(0, 20))
        
        # File upload section
        upload_frame = ttk.LabelFrame(main_frame, text="📂 File Upload", padding="10")
        upload_frame.pack(fill=tk.X, pady=(0, 10))
        
        upload_controls = ttk.Frame(upload_frame)
        upload_controls.pack(fill=tk.X)
        
        ttk.Button(upload_controls, text="📁 Select Excel File", 
                command=self.upload_file).pack(side=tk.LEFT, padx=(0, 10))
        
        self.file_label = ttk.Label(upload_controls, text="No file selected", foreground="gray")
        self.file_label.pack(side=tk.LEFT, padx=(0, 10))
        
        self.process_btn = ttk.Button(upload_controls, text="🔍 Extract Spots", 
                                    command=self.extract_spots, state=tk.DISABLED)
        self.process_btn.pack(side=tk.LEFT)
        
        ttk.Button(upload_controls, text="🔍 Find Spot Columns", 
                command=self.find_spot_columns).pack(side=tk.LEFT, padx=(10, 0))
        
        # Status section
        status_frame = ttk.LabelFrame(main_frame, text="📊 Status", padding="10")
        status_frame.pack(fill=tk.X, pady=(0, 10))
        
        self.status_text = tk.Text(status_frame, height=6, wrap=tk.WORD, font=("Consolas", 9))
        status_scroll = ttk.Scrollbar(status_frame, orient="vertical", command=self.status_text.yview)
        self.status_text.configure(yscrollcommand=status_scroll.set)
        
        self.status_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        status_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Results section
        results_frame = ttk.LabelFrame(main_frame, text="📋 Extracted Spot Data", padding="10")
        results_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 10))
        
        # Results controls
        results_controls = ttk.Frame(results_frame)
        results_controls.pack(fill=tk.X, pady=(0, 10))
        
        self.stats_label = ttk.Label(results_controls, text="No data processed", 
                                    font=("Arial", 10, "bold"))
        self.stats_label.pack(side=tk.LEFT)
        
        self.export_btn = ttk.Button(results_controls, text="📤 Export to Excel", 
                                    command=self.export_data, state=tk.DISABLED)
        self.export_btn.pack(side=tk.RIGHT)
        
        # Data table - Only the 5 columns you want
        columns = ('programme', 'start_time', 'end_time', 'duration', 'spots')
        self.tree = ttk.Treeview(results_frame, columns=columns, show='headings')
        
        # Configure columns
        self.tree.heading('programme', text='Programme Name')
        self.tree.heading('start_time', text='Start Time')
        self.tree.heading('end_time', text='End Time')
        self.tree.heading('duration', text='Duration')
        self.tree.heading('spots', text='Spot Count')
        
        # Column widths
        self.tree.column('programme', width=250)
        self.tree.column('start_time', width=100)
        self.tree.column('end_time', width=100)
        self.tree.column('duration', width=80)
        self.tree.column('spots', width=80)
        
        # Scrollbars
        v_scroll = ttk.Scrollbar(results_frame, orient="vertical", command=self.tree.yview)
        h_scroll = ttk.Scrollbar(results_frame, orient="horizontal", command=self.tree.xview)
        self.tree.configure(yscrollcommand=v_scroll.set, xscrollcommand=h_scroll.set)
        
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        v_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        h_scroll.pack(side=tk.BOTTOM, fill=tk.X, padx=(0, 15))

    def upload_file(self):
        """Upload Excel file"""
        self.log("Starting file upload...")
        
        file_path = filedialog.askopenfilename(
            title="Select Excel File",
            filetypes=[("Excel files", "*.xlsx *.xls"), ("All files", "*.*")]
        )
        
        if file_path:
            try:
                excel_file = pd.ExcelFile(file_path)
                
                if len(excel_file.sheet_names) > 1:
                    sheet_name = self.select_sheet(excel_file.sheet_names)
                    if not sheet_name:
                        return
                else:
                    sheet_name = excel_file.sheet_names[0]
                
                self.raw_data = pd.read_excel(file_path, sheet_name=sheet_name, header=None)
                
                self.file_label.config(text=f"{os.path.basename(file_path)} - {sheet_name}", 
                                    foreground="green")
                self.process_btn.config(state=tk.NORMAL)
                
                self.log(f"✅ File loaded: {len(self.raw_data)} rows, {len(self.raw_data.columns)} columns")
                
            except Exception as e:
                messagebox.showerror("Error", f"Failed to load file: {str(e)}")
                self.log(f"❌ Error loading file: {str(e)}")

    def find_spot_columns(self):
        """Find columns that might contain spot count data"""
        if self.raw_data is None:
            self.log("❌ No data loaded")
            return
        
        self.log("🔍 SEARCHING FOR SPOT COUNT COLUMNS...")
        
        # Find header row first
        header_row = self.find_header_row()
        if header_row is None:
            self.log("❌ Could not find header row")
            return
        
        self.log(f"Header row found at: {header_row + 1}")
        
        # Look for columns that might contain spot counts
        self.log("\n📊 ANALYZING ALL COLUMNS FOR NUMERIC DATA:")
        
        spot_candidates = []
        
        for col_idx in range(len(self.raw_data.columns)):
            # Check header
            header_value = self.raw_data.iloc[header_row, col_idx]
            header_name = str(header_value).strip() if pd.notna(header_value) else f"Column {col_idx}"
            
            # Count numeric values in this column (after header)
            numeric_count = 0
            non_zero_count = 0
            sample_values = []
            
            for row_idx in range(header_row + 1, min(header_row + 20, len(self.raw_data))):
                cell_value = self.raw_data.iloc[row_idx, col_idx]
                
                if pd.notna(cell_value) and str(cell_value).strip():
                    try:
                        num_val = float(str(cell_value).strip())
                        numeric_count += 1
                        if num_val > 0:
                            non_zero_count += 1
                        if len(sample_values) < 5:
                            sample_values.append(num_val)
                    except:
                        pass
            
            if numeric_count > 0:
                self.log(f"Column {col_idx} ({header_name}): {numeric_count} numeric values, {non_zero_count} non-zero")
                self.log(f"  Sample values: {sample_values}")
                
                if non_zero_count > 0:
                    spot_candidates.append((col_idx, header_name, numeric_count, non_zero_count))
        
        if spot_candidates:
            self.log(f"\n🎯 POTENTIAL SPOT COUNT COLUMNS:")
            for col_idx, name, total, non_zero in spot_candidates:
                self.log(f"  Column {col_idx} ({name}): {non_zero} non-zero values")
        else:
            self.log("❌ No columns with numeric data found")

    def find_header_row(self):
        """Find the header row"""
        for row_idx in range(min(20, len(self.raw_data))):
            row_values = []
            
            for col_idx in range(len(self.raw_data.columns)):
                cell_value = self.raw_data.iloc[row_idx, col_idx]
                if pd.notna(cell_value) and str(cell_value).strip():
                    row_values.append(str(cell_value).strip().lower())
            
            # Look for key headers
            key_headers = ['program', 'start time', 'end time', 'channel', 'day']
            found_count = 0
            
            for header in key_headers:
                for value in row_values:
                    if header in value:
                        found_count += 1
                        break
            
            if found_count >= 3:
                return row_idx
        
        return None

    def extract_spots(self):
        """Extract data with spot counts"""
        if self.raw_data is None:
            return
        
        self.log("🔍 Starting spot extraction...")
        
        try:
            self.processed_data = []
            self.clear_tree()
            
            # Find header row
            header_row = self.find_header_row()
            if header_row is None:
                messagebox.showerror("Error", "Could not find header row.")
                return
            
            # Map the basic columns
            column_mapping = self.map_schedule_columns(header_row)
            self.log(f"Basic columns mapped: {column_mapping}")
            
            # Find spot count columns
            spot_columns = self.find_spot_count_columns(header_row)
            self.log(f"Potential spot columns: {spot_columns}")
            
            if not spot_columns:
                messagebox.showwarning("Warning", "No spot count columns found. Check the data format.")
                return
            
            # Extract data with spots
            extracted_count = self.extract_with_spots(header_row, column_mapping, spot_columns)
            
            if extracted_count > 0:
                self.display_data()
                self.export_btn.config(state=tk.NORMAL)
                self.log(f"✅ Extracted {extracted_count} records with spot counts > 0")
            else:
                self.log("⚠️ No records with valid spot counts found")
                
        except Exception as e:
            messagebox.showerror("Error", f"Extraction failed: {str(e)}")
            self.log(f"❌ Extraction error: {str(e)}")

    def map_schedule_columns(self, header_row):
        """Map the basic schedule columns"""
        column_mapping = {}
        
        for col_idx in range(len(self.raw_data.columns)):
            header_value = self.raw_data.iloc[header_row, col_idx]
            
            if pd.notna(header_value):
                header_str = str(header_value).strip().lower()
                
                if header_str == 'program' or 'programme' in header_str:
                    column_mapping['programme'] = col_idx
                elif 'start time' in header_str:
                    column_mapping['start_time'] = col_idx
                elif 'end time' in header_str:
                    column_mapping['end_time'] = col_idx
                elif 'dur' in header_str or 'fct' in header_str:
                    column_mapping['duration'] = col_idx
        
        return column_mapping

    def find_spot_count_columns(self, header_row):
        """Find columns that contain spot count data"""
        spot_columns = []
        
        # Look for columns with numeric data that could be spot counts
        for col_idx in range(len(self.raw_data.columns)):
            numeric_values = 0
            positive_values = 0
            
            # Check 10 rows after header
            for row_idx in range(header_row + 1, min(header_row + 11, len(self.raw_data))):
                cell_value = self.raw_data.iloc[row_idx, col_idx]
                
                if pd.notna(cell_value):
                    try:
                        num_val = float(str(cell_value).strip())
                        if num_val >= 0:  # Valid numeric value
                            numeric_values += 1
                            if num_val > 0:
                                positive_values += 1
                    except:
                        pass
            
            # If column has some positive numeric values, it might be spot counts
            if positive_values > 0 and numeric_values >= positive_values:
                header_name = str(self.raw_data.iloc[header_row, col_idx]) if pd.notna(self.raw_data.iloc[header_row, col_idx]) else f"Col{col_idx}"
                spot_columns.append((col_idx, header_name, positive_values))
        
        return spot_columns

    def extract_with_spots(self, header_row, column_mapping, spot_columns):
        """Extract data including spot counts from multiple columns"""
        self.log(f"📊 Extracting data with spots from row {header_row + 2}...")
        
        extracted_count = 0
        
        for row_idx in range(header_row + 1, len(self.raw_data)):
            try:
                # Get basic programme info
                programme = self.get_cell_value(row_idx, column_mapping.get('programme'))
                
                if not programme or len(programme.strip()) < 2:
                    continue
                
                # Skip header-like entries
                programme_lower = programme.lower()
                if any(skip in programme_lower for skip in ['total', 'header', 'programme', 'benefits', 'sponsorship']):
                    continue
                
                start_time = self.get_cell_value(row_idx, column_mapping.get('start_time'))
                end_time = self.get_cell_value(row_idx, column_mapping.get('end_time'))
                duration = self.get_cell_value(row_idx, column_mapping.get('duration'))
                
                # Convert times
                start_time = self.convert_time(start_time) if start_time else ''
                end_time = self.convert_time(end_time) if end_time else ''
                
                # Look for spot counts in spot columns
                total_spots = 0
                spot_details = []
                
                for col_idx, col_name, _ in spot_columns:
                    cell_value = self.raw_data.iloc[row_idx, col_idx]
                    
                    if pd.notna(cell_value):
                        try:
                            spots = float(str(cell_value).strip())
                            if spots > 0:
                                total_spots += spots
                                spot_details.append(f"{col_name}:{spots}")
                        except:
                            pass
                
                # Only include rows with spot count > 0
                if total_spots > 0:
                    row_data = {
                        'programme': programme,
                        'start_time': start_time,
                        'end_time': end_time,
                        'duration': duration,
                        'spots': int(total_spots),
                        'spot_details': ', '.join(spot_details),
                        'source_row': row_idx + 1
                    }
                    
                    self.processed_data.append(row_data)
                    extracted_count += 1
                    
                    if extracted_count <= 5:
                        self.log(f"Row {row_idx + 1}: ✅ {programme} - {int(total_spots)} spots")
                
            except Exception as e:
                self.log(f"Row {row_idx + 1}: Error - {str(e)}")
                continue
        
        return extracted_count

    def get_cell_value(self, row_idx, col_idx):
        """Get cell value safely"""
        if col_idx is None or col_idx >= len(self.raw_data.columns):
            return ''
        
        cell_value = self.raw_data.iloc[row_idx, col_idx]
        if pd.notna(cell_value) and str(cell_value).strip().lower() != 'nan':
            return str(cell_value).strip()
        return ''

    def convert_time(self, time_value):
        """Convert time to HH:MM format"""
        if not time_value or pd.isna(time_value):
            return ''
        
        try:
            if hasattr(time_value, 'strftime'):
                return time_value.strftime('%H:%M')
            
            time_str = str(time_value).strip()
            if ':' in time_str:
                return time_str
            
            if isinstance(time_value, (int, float)):
                if 0 <= time_value <= 1:
                    hours = int(time_value * 24)
                    minutes = int((time_value * 24 * 60) % 60)
                    return f"{hours:02d}:{minutes:02d}"
            
            return str(time_value)
            
        except:
            return str(time_value)

    def display_data(self):
        """Display extracted data in tree"""
        self.clear_tree()
        
        for data in self.processed_data:
            self.tree.insert('', 'end', values=(
                data.get('programme', ''),
                data.get('start_time', ''),
                data.get('end_time', ''),
                data.get('duration', ''),
                data.get('spots', 0)
            ))
        
        total_spots = sum(data.get('spots', 0) for data in self.processed_data)
        self.stats_label.config(text=f"📊 Records: {len(self.processed_data)} with spots | Total Spots: {total_spots}")

    def export_data(self):
        """Export data to Excel with only the 5 required columns"""
        if not self.processed_data:
            messagebox.showwarning("Warning", "No data to export")
            return
        
        file_path = filedialog.asksaveasfilename(
            title="Save Excel File",
            defaultextension=".xlsx",
            filetypes=[("Excel files", "*.xlsx"), ("All files", "*.*")]
        )
        
        if file_path:
            try:
                wb = Workbook()
                ws = wb.active
                ws.title = "TV Schedule Spots"
                
                # Title
                ws['A1'] = "TV Schedule - Programme Spot Data"
                ws.merge_cells('A1:E1')
                ws['A1'].font = Font(size=14, bold=True)
                ws['A1'].alignment = Alignment(horizontal='center')
                
                # Info
                ws['A2'] = f"Extracted: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
                ws['A3'] = f"Records with spots > 0: {len(self.processed_data)}"
                
                # Headers - Only the 5 columns you want
                headers = ['Programme Name', 'Start Time', 'End Time', 'Duration', 'Spot Count']
                for col, header in enumerate(headers, 1):
                    cell = ws.cell(row=5, column=col, value=header)
                    cell.font = Font(bold=True)
                    cell.fill = PatternFill(start_color="CCCCCC", end_color="CCCCCC", fill_type="solid")
                
                # Data
                for row, data in enumerate(self.processed_data, 6):
                    ws.cell(row=row, column=1, value=data.get('programme', ''))
                    ws.cell(row=row, column=2, value=data.get('start_time', ''))
                    ws.cell(row=row, column=3, value=data.get('end_time', ''))
                    ws.cell(row=row, column=4, value=data.get('duration', ''))
                    ws.cell(row=row, column=5, value=data.get('spots', 0))
                
                # Auto-adjust column widths
                column_letters = ['A', 'B', 'C', 'D', 'E']
                column_widths = [30, 12, 12, 12, 12]
                
                for col_idx, col_letter in enumerate(column_letters):
                    ws.column_dimensions[col_letter].width = column_widths[col_idx]
                
                wb.save(file_path)
                
                total_spots = sum(data.get('spots', 0) for data in self.processed_data)
                
                messagebox.showinfo("Success", 
                                f"TV Schedule Spot Data exported!\n\n"
                                f"File: {os.path.basename(file_path)}\n"
                                f"Records: {len(self.processed_data)}\n"
                                f"Total Spots: {total_spots}")
                
                self.log(f"✅ Data exported to {os.path.basename(file_path)}")
                
            except Exception as e:
                messagebox.showerror("Error", f"Export failed: {str(e)}")
                self.log(f"❌ Export error: {str(e)}")

    def select_sheet(self, sheet_names):
        """Simple sheet selection dialog"""
        if len(sheet_names) == 1:
            return sheet_names[0]
        
        dialog = tk.Toplevel(self.root)
        dialog.title("Select Sheet")
        dialog.geometry("300x200")
        dialog.grab_set()
        
        selected = None
        
        ttk.Label(dialog, text="Select sheet:", font=("Arial", 10, "bold")).pack(pady=10)
        
        listbox = tk.Listbox(dialog)
        for sheet in sheet_names:
            listbox.insert(tk.END, sheet)
        listbox.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)
        listbox.select_set(0)
        
        def on_select():
            nonlocal selected
            if listbox.curselection():
                selected = sheet_names[listbox.curselection()[0]]
            dialog.destroy()
        
        ttk.Button(dialog, text="Select", command=on_select).pack(pady=10)
        
        dialog.wait_window()
        return selected

    def clear_tree(self):
        """Clear the data tree"""
        for item in self.tree.get_children():
            self.tree.delete(item)

    def log(self, message):
        """Add message to status log"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.status_text.insert(tk.END, f"[{timestamp}] {message}\n")
        self.status_text.see(tk.END)
        self.root.update()

def main():
    root = tk.Tk()
    app = TVScheduleSpotExtractor(root)

    menubar = tk.Menu(root)

    file_menu = tk.Menu(menubar, tearoff=0)
    file_menu.add_command(label="Open Excel File", command=app.upload_file)
    file_menu.add_separator()
    file_menu.add_command(label="Export Data", command=app.export_data)
    file_menu.add_separator()
    file_menu.add_command(label="Exit", command=root.quit)
    menubar.add_cascade(label="File", menu=file_menu)

    root.config(menu=menubar)

    def on_closing():
        if messagebox.askyesno("Exit", "Exit TV Schedule Spot Extractor?"):
            root.destroy()

    root.protocol("WM_DELETE_WINDOW", on_closing)

    print("TV Schedule Spot Count Extractor Ready")
    root.mainloop()

if __name__ == "__main__":
    main()