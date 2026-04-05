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
    tx_resp = supabase.table("transactions").select("*, customers(name)").execute()
    data = tx_resp.data
    
    if not data:
        print("❌ No transaction data found.")
        return

    # Calculate Stats
    total_rev = sum(float(t['balance_rupees']) for t in data)
    total_cans = sum(int(t['balance_can']) for t in data)
    total_customers = len(set(t['customer_id'] for t in data))
    
    pdf = AquaTrackReport()
    pdf.add_page()
    
    # --- Summary Section ---
    pdf.set_font('Helvetica', 'B', 16)
    pdf.set_text_color(51, 65, 85)
    pdf.cell(0, 10, "Business Overview", ln=True)
    pdf.ln(5)
    
    # Stats Grid
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_fill_color(248, 250, 252)
    
    cols = [("Total Revenue", f"Rs. {total_rev:,.2f}"), 
            ("Total Cans Out", f"{total_cans}"), 
            ("Active Customers", f"{total_customers}")]
    
    for label, val in cols:
        pdf.set_text_color(100, 116, 139)
        pdf.cell(60, 8, label, border=1, ln=0, align='C', fill=True)
    pdf.ln()
    for label, val in cols:
        pdf.set_text_color(14, 165, 233)
        pdf.cell(60, 12, val, border=1, ln=0, align='C')
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
    
    pdf.cell(40, 10, "Date", 1, 0, 'C', True)
    pdf.cell(70, 10, "Customer", 1, 0, 'L', True)
    pdf.cell(40, 10, "Cans Out", 1, 0, 'C', True)
    pdf.cell(40, 10, "Amount Paid", 1, 1, 'C', True)

    # Table Rows
    pdf.set_font('Helvetica', '', 10)
    pdf.set_text_color(51, 65, 85)
    
    # Sort data by date
    data.sort(key=lambda x: x['date'], reverse=True)

    for i, t in enumerate(data):
        # Alternate row color
        if i % 2 == 0: pdf.set_fill_color(255, 255, 255)
        else: pdf.set_fill_color(248, 250, 252)
        
        name = t['customers']['name'] if t.get('customers') else "Unknown"
        pdf.cell(40, 9, t['date'], 1, 0, 'C', True)
        pdf.cell(70, 9, name, 1, 0, 'L', True)
        pdf.cell(40, 9, str(t['balance_can']), 1, 0, 'C', True)
        pdf.cell(40, 9, f"Rs. {float(t['balance_rupees']):,.2f}", 1, 1, 'R', True)

    # Save
    filename = f"AquaTrack_Report_{datetime.now().strftime('%Y%m%d')}.pdf"
    pdf.output(filename)
    print(f"✅ Report saved successfully as: {filename}")

if __name__ == "__main__":
    generate_pdf()
