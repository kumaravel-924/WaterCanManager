import os
from supabase import create_client, Client
from fpdf import FPDF
from datetime import datetime

# === CONFIGURATION ===
SUPABASE_URL = "https://aphsktrjxbkfaeydqlov.supabase.co"
SUPABASE_KEY = "sb_publishable_fcTVjKAtQvXOVAIJ-AJS2A_mbfC-uXg"

# === INITIALIZE SUPABASE ===
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

class AquaTrackReport(FPDF):
    def header(self):
        # Header Blue Bar
        self.set_fill_color(14, 165, 233)
        self.rect(0, 0, 210, 40, 'F')
        
        self.set_font('Helvetica', 'B', 22)
        self.set_text_color(255, 255, 255)
        self.cell(0, 10, 'AquaTrack Sales Report', ln=True, align='L')
        
        self.set_font('Helvetica', '', 11)
        self.cell(0, 8, f"Generated on: {datetime.now().strftime('%d %b %Y, %H:%M')}", ln=True, align='L')
        self.ln(25)

    def footer(self):
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(128, 128, 128)
        self.cell(0, 10, f'Page {self.page_no()}', 0, 0, 'C')

def generate_pdf():
    print("🚀 Fetching data from Supabase...")
    
    # Fetch Data
    cx_resp = supabase.table("customers").select("*").execute()
    tx_resp = supabase.table("transactions").select("*, customers(name)").execute()
    
    cx_data = cx_resp.data
    tx_data = tx_resp.data
    
    if not tx_data:
        print("❌ No transaction data found.")
        return

    # Calculate Stats accurately from SQL Schema (Safe from None values)
    total_bal = sum(float(c.get('balance_rupees') or 0) for c in cx_data)
    total_paid = sum(float(t.get('paid_today') or 0) for t in tx_data)
    total_cans = sum(int(c.get('balance_can') or 0) for c in cx_data)
    
    pdf = AquaTrackReport()
    pdf.add_page()
    
    # --- Summary Section ---
    pdf.set_font('Helvetica', 'B', 16)
    pdf.set_text_color(51, 65, 85)
    pdf.cell(0, 10, "Business Overview", ln=True)
    pdf.ln(5)
    
    pdf.set_font('Helvetica', 'B', 10)
    pdf.set_fill_color(248, 250, 252)
    
    cols = [("Total Collected", f"Rs. {total_paid:,.2f}"), 
            ("Total Balance", f"Rs. {total_bal:,.2f}"), 
            ("Total Cans Out", f"{total_cans}")]
    
    for label, val in cols:
        pdf.set_text_color(100, 116, 139)
        pdf.cell(63, 8, label, border=1, ln=0, align='C', fill=True)
    pdf.ln()
    for label, val in cols:
        pdf.set_text_color(14, 165, 233)
        pdf.cell(63, 12, val, border=1, ln=0, align='C')
    pdf.ln(20)

    # --- Transaction Table ---
    pdf.set_font('Helvetica', 'B', 16)
    pdf.set_text_color(51, 65, 85)
    pdf.cell(0, 10, "Transaction History", ln=True)
    pdf.ln(5)

    # Table Header
    pdf.set_font('Helvetica', 'B', 10)
    pdf.set_fill_color(241, 245, 249)
    pdf.set_text_color(15, 23, 42)
    
    pdf.cell(30, 10, "Date", 1, 0, 'C', True)
    pdf.cell(65, 10, "Customer", 1, 0, 'L', True)
    pdf.cell(20, 10, "Cans", 1, 0, 'C', True)
    pdf.cell(35, 10, "Paid Rs.", 1, 0, 'C', True)
    pdf.cell(40, 10, "Balance Rs.", 1, 1, 'C', True)

    # Table Rows
    pdf.set_font('Helvetica', '', 10)
    pdf.set_text_color(51, 65, 85)
    
    # Sort tx_data by date
    tx_data.sort(key=lambda x: x['date'], reverse=True)

    for i, t in enumerate(tx_data):
        # Alternate row color
        if i % 2 == 0: pdf.set_fill_color(255, 255, 255)
        else: pdf.set_fill_color(248, 250, 252)
        
        name = t['customers']['name'] if t.get('customers') else "Unknown"
        paid = float(t.get('paid_today') or 0)
        balance = float(t.get('balance_rupees') or 0)
        cans = int(t.get('balance_can') or 0)
        
        pdf.cell(30, 9, t['date'], 1, 0, 'C', True)
        pdf.cell(65, 9, name, 1, 0, 'L', True)
        pdf.cell(20, 9, str(cans), 1, 0, 'C', True)
        pdf.cell(35, 9, f"{paid:,.2f}", 1, 0, 'R', True)
        pdf.cell(40, 9, f"{balance:,.2f}", 1, 1, 'R', True)

    # Save
    filename = f"AquaTrack_Report_{datetime.now().strftime('%Y%m%d')}.pdf"
    pdf.output(filename)
    print(f"✅ Report saved successfully as: {filename}")

if __name__ == "__main__":
    generate_pdf()
