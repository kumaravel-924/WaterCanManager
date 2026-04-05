/* ================================================================
   ⚙️  CONFIGURATION — Supabase credentials
   ================================================================ */
const SUPABASE_URL      = 'https://aphsktrjxbkfaeydqlov.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_fcTVjKAtQvXOVAIJ-AJS2A_mbfC-uXg';

/* ================================================================
   GLOBALS & STATE
   ================================================================ */
let _supabase=null;
let useLocal=false;
const S = {
  page: 'home',
  params: {},
  theme: localStorage.getItem('aq_theme') || 'light',
  search: '',
  navDate: null
};

/* ================================================================
   LOCAL STORAGE HELPERS
   ================================================================ */
const LS = {
  cx:  () => JSON.parse(localStorage.getItem('aq_cx') || '[]'),
  tx:  () => JSON.parse(localStorage.getItem('aq_tx') || '[]'),
  scx: (d) => localStorage.setItem('aq_cx', JSON.stringify(d)),
  stx: (d) => localStorage.setItem('aq_tx', JSON.stringify(d))
};

/* ================================================================
   DATABASE LAYER
   ================================================================ */
const db = {
  async getCustomers() {
    if (useLocal) return LS.cx().sort((a,b)=>a.name.localeCompare(b.name));
    const {data,error} = await _supabase.from('customers').select('*').order('name');
    console.log('GET Customers:', data, error);
    // Filter out records that somehow got an 'undefined' or missing ID
    const validData = (data||[]).filter(c => c.id && c.id !== 'undefined');
    if (error) throw error; return validData;
  },
  async getCustomer(id) {
    if (useLocal) return LS.cx().find(c=>c.id===id)||null;
    const {data,error} = await _supabase.from('customers').select('*').eq('id',id).single();
    if (error) throw error; return data;
  },
  async addCustomer(p) {
    if (useLocal) {
      const c={id:uid(),...p,created_at:new Date().toISOString()};
      LS.scx([...LS.cx(),c]); return c;
    }
    const {data,error} = await _supabase.from('customers').insert([p]).select().single();
    if (error) throw error; return data;
  },
  async updateCustomer(id,p) {
    if (useLocal) {
      LS.scx(LS.cx().map(c=>c.id===id?{...c,...p}:c)); return;
    }
    const {data,error} = await _supabase.from('customers').update(p).eq('id',id).select().single();
    if (error) throw error; return data;
  },
  async deleteCustomer(id) {
    if(!id || id === 'undefined') { console.warn('Cannot delete: Invalid ID'); return; }
    if (useLocal) {
      LS.scx(LS.cx().filter(c=>c.id!==id));
      LS.stx(LS.tx().filter(t=>t.customer_id!==id)); return;
    }
    const {error}=await _supabase.from('customers').delete().eq('id',id);
    if (error) throw error;
  },
  async getTransactions(customerId) {
    if (useLocal) return LS.tx().filter(t=>t.customer_id===customerId).sort((a,b)=>b.date.localeCompare(a.date));
    const {data,error} = await _supabase.from('transactions').select('*')
      .eq('customer_id',customerId).order('date',{ascending:false}).order('created_at',{ascending:false});
    if (error) throw error; return data;
  },
  async addTransaction(p) {
    if (useLocal) {
      const t={id:uid(),...p,created_at:new Date().toISOString()};
      LS.stx([...LS.tx(),t]); return t;
    }
    const {data,error} = await _supabase.from('transactions').insert([p]).select().single();
    if (error) throw error; return data;
  },
  async getSalesByDate(ds) {
    if (useLocal) {
      const cx=LS.cx();
      const tx = ds ? LS.tx().filter(t=>t.date===ds) : LS.tx();
      return tx.map(t=>({...t, customer_name: cx.find(c=>c.id===t.customer_id)?.name||'Unknown'}));
    }
    if(ds) {
      const {data,error} = await _supabase.from('transactions')
        .select('*, customers(name)').eq('date',ds).order('created_at',{ascending:false});
      if (error) throw error;
      return data.map(t=>{
        const c = Array.isArray(t.customers) ? t.customers[0] : t.customers;
        return {...t, customer_name: c?.name || 'Unknown'};
      });
    }
    // If no date provided, get all transactions
    const {data,error} = await _supabase.from('transactions').select('*, customers(name)');
    if (error) throw error;
    return data.map(t=>{
      const c = Array.isArray(t.customers) ? t.customers[0] : t.customers;
      return {...t, customer_name: c?.name || 'Unknown'};
    });
  },
  async getAllSalesSummary() {
    let rows;
    if (useLocal) {
      rows = LS.tx();
    } else {
      const {data,error}=await _supabase.from('transactions').select('date, balance_can, balance_rupees');
      if (error) throw error; rows=data;
    }
    const byDate={};
    rows.forEach(t=>{
      if(!byDate[t.date]) byDate[t.date]={date:t.date, total_br:0, total_bc:0, count:0};
      byDate[t.date].total_br += n(t.balance_rupees);
      byDate[t.date].total_bc += n(t.balance_can);
      byDate[t.date].count++;
    });
    return Object.values(byDate).sort((a,b)=>b.date.localeCompare(a.date));
  }
};

/* ================================================================
   UTILS
   ================================================================ */
function todayStr() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const localDate = new Date(d.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
}
function fmt(ds) {
  if (!ds) return '—';
  // Use T00:00:00 only for simple YYYY-MM-DD to avoid timezone shifts
  const finalStr = ds.includes('T') ? ds : ds + 'T00:00:00';
  const d = new Date(finalStr);
  return d.toLocaleDateString('en-IN', { day:'numeric', month:'short' });
}
function fmtLong(ds) {
  if (!ds) return '—';
  const finalStr = ds.includes('T') ? ds : ds + 'T00:00:00';
  const d = new Date(finalStr);
  return d.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}
function ago(ds) {
  if (!ds) return '';
  const now = new Date(todayStr() + 'T00:00:00');
  const past = new Date(ds + 'T00:00:00');
  const diff = Math.floor((now - past) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 0)  return 'Scheduled';
  return `${diff} days ago`;
}
function prevDay(ds) { let d=new Date(ds+'T00:00:00'); d.setDate(d.getDate()-1); return d.toISOString().split('T')[0]; }
function nextDay(ds) { let d=new Date(ds+'T00:00:00'); d.setDate(d.getDate()+1); return d.toISOString().split('T')[0]; }
function uid() { return Math.random().toString(36).substr(2,9); }
function n(v) { return Number(v)||0; }

function toast(msg) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2500);
}

function modalConfirm(title, sub, onConfirm) {
  const ov=document.createElement('div'); ov.className='modal-overlay';
  ov.innerHTML=`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="confirm-ico">⚠️</div>
      <div class="modal-title" style="text-align:center;margin-bottom:8px;">${title}</div>
      <div style="text-align:center;color:var(--text3);font-size:14px;margin-bottom:24px;">${sub}</div>
      <div class="btn-group">
        <button class="btn btn-outline" id="c-cancel">Cancel</button>
        <button class="btn btn-danger" id="c-confirm">Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  ov.querySelector('#c-cancel').onclick=()=>ov.remove();
  ov.querySelector('#c-confirm').onclick=async()=>{
    const b=ov.querySelector('#c-confirm'); b.disabled=true; b.textContent='Processing…';
    await onConfirm(); ov.remove();
  };
}

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  S.theme=t; localStorage.setItem('aq_theme', t);
}

function setTitle(t) {
  const el=document.getElementById('hdr-title');
  const logo=document.getElementById('app-logo');
  if(t) { el.textContent=t; el.style.display='block'; logo.style.display='none'; }
  else { el.style.display='none'; logo.style.display='flex'; }
}

/* ================================================================
   REPORT: PDF GENERATOR
   ================================================================ */
async function downloadReport() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  toast('⏳ Preparing PDF…');
  
  try {
    const txs = await db.getSalesByDate(null); // Get all
    // Sort transactions by date descending
    txs.sort((a,b) => b.date.localeCompare(a.date));

    // Colors
    const primary = [14, 165, 233];
    
    // Header
    doc.setFillColor(...primary);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text('AquaTrack | Sales Report', 15, 25);
    doc.setFontSize(10);
    doc.text(`Generated on: ${fmtLong(todayStr())}`, 15, 33);

    // Summary Section
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(14);
    doc.text('Business Overview', 15, 55);
    
    const totalRev = txs.reduce((s,t)=>s+n(t.balance_rupees),0);
    const totalCans = txs.reduce((s,t)=>s+n(t.balance_can),0);
    
    doc.autoTable({
      startY: 62,
      head: [['Total Revenue', 'Total Cans Out', 'Total Entries']],
      body: [[`Rs. ${totalRev.toFixed(2)}`, totalCans, txs.length]],
      theme: 'grid',
      headStyles: { fillColor: [241, 245, 249], textColor: [100, 116, 139] },
      styles: { fontSize: 12, halign: 'center' }
    });

    // Detailed Table
    doc.setFontSize(14);
    doc.text('Detailed Transactions', 15, doc.lastAutoTable.finalY + 15);

    const tableBody = txs.map(t => [
      fmt(t.date),
      t.customer_name,
      t.balance_can,
      `Rs. ${n(t.balance_rupees).toFixed(2)}`
    ]);

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 22,
      head: [['Date', 'Customer Name', 'Cans', 'Amount Paid']],
      body: tableBody,
      headStyles: { fillColor: primary },
      alternateRowStyles: { fillColor: [248, 250, 252] }
    });

    doc.save(`AquaTrack_Report_${todayStr()}.pdf`);
    toast('✅ PDF Saved!');
  } catch (e) {
    toast('❌ Error: ' + e.message);
  }
}

/* ================================================================
   NAVIGATION
   ================================================================ */
function go(page, params={}) {
  S.page=page; S.params=params;
  renderShell();
  window.scrollTo(0, 0);
  switch(page) {
    case 'home':        pgHome(); break;
    case 'customer':    pgCustomer(); break;
    case 'history':     pgHistory(); break;
    case 'today-sales': pgToday(); break;
    case 'all-sales':   pgAllSales(); break;
    case 'settings':    pgSettings(); break;
    default: pgHome();
  }
}

/* ================================================================
   PAGE: SETTINGS
   ================================================================ */
function pgSettings() {
  setTitle('Settings');
  const main=document.getElementById('main');
  main.innerHTML=`
    <div class="page">
      <div class="card" style="padding:16px;">
        <div class="sec-title" style="margin-bottom:12px;">📊 Data Management</div>
        <p style="font-size:13px;color:var(--text3);margin-bottom:18px;">If you want to start over and delete all customers and history, use the button below.</p>
        <button class="btn btn-danger btn-sm" id="wipe-btn">🚮 Delete All Data</button>
      </div>
      <div style="height:120px;"></div>
    </div>
  `;

  document.getElementById('wipe-btn').onclick=()=>modalConfirm(
    'Delete EVERYTHING?',
    'This will permanently remove all customers and balance records from your database.',
    async()=>{
      if(useLocal) {
        localStorage.clear();
      } else {
        const {error:e1}=await _supabase.from('transactions').delete().neq('id','00000000-0000-0000-0000-000000000000');
        const {error:e2}=await _supabase.from('customers').delete().neq('id','00000000-0000-0000-0000-000000000000');
        if(e1||e2) toast('❌ Error clearing data'); 
      }
      toast('🚮 All data cleared!');
      setTimeout(()=>location.reload(), 1000);
    }
  );
}

/* ================================================================
   PAGE: HOME
   ================================================================ */
async function pgHome() {
  setTitle('');
  const main=document.getElementById('main');
  main.innerHTML=`
    <div class="page">
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" class="search-input" id="search-cx" placeholder="Search customer…" value="${S.search}">
        <button class="search-clear" id="search-clr">✕</button>
      </div>
      <div id="cx-list"><div class="loading"><div class="spinner"></div>Loading customers…</div></div>
      <div style="height:40px;"></div>
    </div>
    <button class="fab" id="add-fab">+</button>
  `;

  const input=document.getElementById('search-cx');
  const clear=document.getElementById('search-clr');
  if(S.search) clear.style.display='block';

  input.oninput=e=>{
    S.search=e.target.value.toLowerCase();
    clear.style.display=S.search?'block':'none';
    paintList();
  };
  clear.onclick=()=>{ input.value=''; S.search=''; clear.style.display='none'; paintList(); };
  document.getElementById('add-fab').onclick=()=>modalAddCustomer();

  try {
    S.customers=await db.getCustomers();
    paintList();
  } catch(e) {
    document.getElementById('cx-list').innerHTML=`<div class="empty"><div class="empty-ico">⚠️</div><div class="empty-txt">Error loading records: ${e.message}</div></div>`;
  }
}

function paintList() {
  const el=document.getElementById('cx-list');
  const q=S.search;
  const fil=S.customers.filter(c=>c.name.toLowerCase().includes(q));
  if(fil.length===0) {
    el.innerHTML=`<div class="empty"><div class="empty-ico">${q?'🔍':'👥'}</div><div class="empty-txt">${q?'No results':'No customers yet. Tap + to add.'}</div></div>`;
    return;
  }
  el.innerHTML=fil.map(c=>{
    // Skip records with invalid IDs
    if(!c.id) { console.warn('Missing ID for customer:', c); return ''; }
    return `
    <div class="cust-card" data-id="${c.id}">
      <div class="cust-left">
        <div class="cust-name">${c.name}</div>
        <div class="cust-sub">Updated ${fmt(c.last_updated_date)}</div>
      </div>
      <div class="cust-right">
        <span class="badge b-can">🪣 ${n(c.balance_can)} cans</span>
        <span class="badge b-amt">₹${n(c.balance_rupees).toFixed(0)}</span>
        ${n(c.advance_payment)>0?`<span class="badge b-adv">💰 ₹${n(c.advance_payment).toFixed(0)}</span>`:''}
      </div>
      <button class="icon-btn q-del" data-id="${c.id}" style="margin-left:12px;opacity:.5;">🗑️</button>
    </div>
  `;}).join('');
  el.querySelectorAll('.cust-card').forEach(card=>{
    card.onclick=e=>{
      if(e.target.closest('.q-del')) {
        e.stopPropagation();
        modalConfirm(`Delete ${fil.find(cx=>cx.id===card.dataset.id)?.name}?`, 'Delete this record and history?', async()=>{ await db.deleteCustomer(card.dataset.id); toast('🗑️ Deleted'); pgHome(); });
        return;
      }
      go('customer',{id:card.dataset.id});
    };
  });
}

/* ================================================================
   MODAL: ADD CUSTOMER
   ================================================================ */
function modalAddCustomer() {
  const ov=document.createElement('div'); ov.className='modal-overlay';
  ov.innerHTML=`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">New Customer</div>
      <div class="form-group"><label class="form-label">Name</label><input type="text" id="m-name" class="form-input" placeholder="Enter name"></div>
      <div class="form-group"><label class="form-label">Starting Balance (Cans)</label><input type="number" id="m-can" class="form-input" value="0"></div>
      <div class="form-group"><label class="form-label">Initial Due (₹)</label><input type="number" id="m-amt" class="form-input" value="0"></div>
      <div class="form-group"><label class="form-label">Advance Payment (₹)</label><input type="number" id="m-adv" class="form-input" value="0"></div>
      <button class="btn btn-primary" id="m-save" style="margin-top:10px;">Save Customer</button>
    </div>
  `;
  document.body.appendChild(ov);
  const ms=ov.querySelector('#m-save');
  ms.onclick=async()=>{
    const p={
      name: ov.querySelector('#m-name').value.trim(),
      balance_can: n(ov.querySelector('#m-can').value),
      balance_rupees: n(ov.querySelector('#m-amt').value),
      advance_payment: n(ov.querySelector('#m-adv').value), // Added this
      last_updated_date: todayStr()
    };
    if(!p.name) return toast('Name is required');
    try {
      ms.textContent='Saving…';
      const c=await db.addCustomer(p);
      if(!c || !c.id) throw new Error('Database returned no ID. Check if RLS is disabled in Supabase.');
      await db.addTransaction({customer_id:c.id,balance_can:p.balance_can,balance_rupees:p.balance_rupees,advance_payment:p.advance_payment,date:p.last_updated_date});
      ov.remove(); toast('✅ Customer added!'); pgHome();
    } catch(e){ console.error(e); toast('❌ '+e.message); ms.textContent='Save'; }
  };
  ov.onclick=e=>{ if(e.target===ov) ov.remove(); };
}

/* ================================================================
   PAGE: CUSTOMER DETAIL
   ================================================================ */
async function pgCustomer() {
  const id=S.params.id;
  setTitle('Loading…');
  const main=document.getElementById('main');
  main.innerHTML=`<div class="page"><div class="loading"><div class="spinner"></div>Loading details…</div></div>`;
  try {
    const [c,txs]=await Promise.all([db.getCustomer(id),db.getTransactions(id)]);
    if(!c){ go('home'); return; }
    setTitle(c.name);
    main.innerHTML=`
      <div class="page">
        <div class="detail-hero">
          <div class="hero-name">${c.name}</div>
          <div class="hero-sub">Member since ${fmt(c.created_at || c.last_updated_date)}</div>
          <div class="hero-badges">
            <div class="hero-badge">🪣 ${n(c.balance_can)} Cans Out</div>
            <div class="hero-badge">💸 ₹${n(c.balance_rupees).toFixed(0)} Due</div>
            <div class="hero-badge">💰 ₹${n(c.advance_payment).toFixed(0)} Advance</div>
          </div>
        </div>

        <div class="card" style="padding:16px;margin-bottom:14px;">
          <div class="sec-title" style="margin-bottom:12px;">🔄 Quick Update</div>
          <div class="sum-grid">
            <div class="form-group"><label class="form-label">Cans Out</label><input type="number" id="u-can" class="form-input" value="${c.balance_can}"></div>
            <div class="form-group"><label class="form-label">Due Amount (₹)</label><input type="number" id="u-amt" class="form-input" value="${c.balance_rupees}"></div>
          </div>
          <div class="form-group"><label class="form-label">Advance Payment (₹)</label><input type="number" id="u-adv" class="form-input" value="${c.advance_payment}"></div>
          <button class="btn btn-success" id="save-btn">✅ Save Update</button>
        </div>

        <div class="sec-head">
          <span class="sec-title">Recent Activity</span>
          <button class="sec-action" id="view-hist">View Full History</button>
        </div>
        <div class="card">
          ${txs.length>0?txs.slice(0,3).map(t=>txItem(t)).join(''):'<div class="empty"><div class="empty-txt" style="padding:20px;">No records yet</div></div>'}
        </div>

        <div class="divider"></div>
        <button class="btn btn-outline" id="del-btn" style="color:var(--red);border-color:var(--red);">🗑️ Delete Customer</button>
        <div style="height:20px;"></div>
      </div>
    `;

    // ADDED DELETE LISTENER FOR RECENT ACTIVITY
    main.querySelectorAll('.tx-del').forEach(btn=>{
      btn.onclick=()=>modalConfirm(
        'Delete this record?',
        'This history item will be permanently removed.',
        async()=>{
          const tid=btn.closest('.tx-item').dataset.id;
          if(useLocal) {
            LS.stx(LS.tx().filter(t=>t.id!==tid));
          } else {
            const {error}=await _supabase.from('transactions').delete().eq('id',tid);
            if(error) toast('❌ Error');
          }
          toast('🗑️ Deleted'); pgCustomer();
        }
      );
    });

    document.getElementById('save-btn').onclick=async()=>{
      const p={
        balance_can: n(document.getElementById('u-can').value),
        balance_rupees: n(document.getElementById('u-amt').value),
        advance_payment: n(document.getElementById('u-adv').value),
        last_updated_date: todayStr()
      };
      try {
        document.getElementById('save-btn').textContent='Saving…';
        if(!id || id === 'undefined') throw new Error('Invalid Customer ID');
        await db.updateCustomer(id,p);
        // Only send correct columns to Transactions (no last_updated_date here)
        await db.addTransaction({
          customer_id: id,
          balance_can: p.balance_can,
          balance_rupees: p.balance_rupees,
          advance_payment: p.advance_payment,
          date: p.last_updated_date
        });
        toast('✅ Saved!'); pgCustomer();
      } catch(e){ console.error(e); toast('❌ '+e.message); document.getElementById('save-btn').textContent='✅ Save Update'; }
    };

    document.getElementById('view-hist')?.addEventListener('click',()=>go('history',{id,name:c.name,from:'customer'}));

    document.getElementById('del-btn').onclick=()=>modalConfirm(
      `Delete ${c.name}?`,
      'All transaction history will be permanently removed.',
      async()=>{ await db.deleteCustomer(id); toast('🗑️ Deleted'); go('home'); }
    );

  } catch(e) {
    main.innerHTML=`<div class="page"><div class="empty"><div class="empty-ico">⚠️</div><div class="empty-txt">${e.message}</div></div></div>`;
  }
}

function txItem(t) {
  return `
    <div class="tx-item" data-id="${t.id}">
      <div class="tx-head">
        <span class="tx-date">${fmt(t.date)}</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="tx-ago">${ago(t.date)}</span>
          <button class="icon-btn tx-del" style="height:24px;width:24px;font-size:12px;opacity:.5;">🗑️</button>
        </div>
      </div>
      <div class="tx-badges">
        <span class="badge b-can">🪣 ${n(t.balance_can)} cans</span>
        <span class="badge b-amt">₹${n(t.balance_rupees).toFixed(0)}</span>
        ${n(t.advance_payment)>0?`<span class="badge b-adv">💰 ₹${n(t.advance_payment).toFixed(0)} AP</span>`:''}
      </div>
    </div>`;
}

/* ================================================================
   PAGE: HISTORY
   ================================================================ */
async function pgHistory() {
  const {id,name}=S.params;
  setTitle('History');
  const main=document.getElementById('main');
  main.innerHTML=`<div class="page"><div class="loading"><div class="spinner"></div>Loading history…</div></div>`;
  try {
    const [c,txs]=await Promise.all([db.getCustomer(id),db.getTransactions(id)]);
    if(!c){ 
      main.innerHTML=`<div class="page"><div class="empty"><div class="empty-ico">❓</div><div class="empty-txt">Customer not found</div></div></div>`; 
      return; 
    }
    main.innerHTML=`
      <div class="page">
        <div class="detail-hero">
          <div class="hero-name">${c.name}</div>
          <div class="hero-sub">🪣 ${n(c.balance_can)} cans · ₹${n(c.balance_rupees).toFixed(0)} due · AP ₹${n(c.advance_payment).toFixed(0)}</div>
        </div>
        <div class="sec-head">
          <span class="sec-title">All Transactions</span>
          <span style="font-size:12px;color:var(--text4);font-weight:600;">${txs.length} records</span>
        </div>
        ${txs.length===0
          ?`<div class="card"><div class="empty"><div class="empty-ico">📭</div><div class="empty-txt">No transactions yet</div></div></div>`
          :`<div class="card">${txs.map(t=>txItem(t)).join('')}</div>`
        }
        <div style="height:8px;"></div>
      </div>
    `;

    main.querySelectorAll('.tx-del').forEach(btn=>{
      btn.onclick=()=>modalConfirm(
        'Delete this record?',
        'This history item will be permanently removed.',
        async()=>{
          const tid=btn.closest('.tx-item').dataset.id;
          if(useLocal) {
            LS.stx(LS.tx().filter(t=>t.id!==tid));
          } else {
            const {error}=await _supabase.from('transactions').delete().eq('id',tid);
            if(error) toast('❌ Error');
          }
          toast('🗑️ Deleted'); pgHistory();
        }
      );
    });
  } catch(e) {
    main.innerHTML=`<div class="page"><div class="empty"><div class="empty-ico">⚠️</div><div class="empty-txt">${e.message}</div></div></div>`;
  }
}

/* ================================================================
   PAGE: TODAY SALES
   ================================================================ */
async function pgToday() {
  setTitle('');
  if(!S.navDate) S.navDate=todayStr();
  const ds=S.navDate;
  const main=document.getElementById('main');
  main.innerHTML=`<div class="page"><div class="loading"><div class="spinner"></div>Loading…</div></div>`;
  try {
    const sales=await db.getSalesByDate(ds);
    const totalBR=sales.reduce((s,t)=>s+n(t.balance_rupees),0);
    const totalBC=sales.reduce((s,t)=>s+n(t.balance_can),0);
    const totalAP=sales.reduce((s,t)=>s+n(t.advance_payment),0);
    const isToday=ds===todayStr();
    const isFuture=ds>todayStr();

    main.innerHTML=`
      <div class="page">
        <div class="date-nav">
          <button class="dn-btn" id="dn-prev">←</button>
          <div class="dn-mid">
            <div class="dn-label">${isToday?'📅 Today':fmt(ds)}</div>
            <div class="dn-sub">${fmtLong(ds)}</div>
          </div>
          <button class="dn-btn" id="dn-next" ${isFuture||isToday?'disabled':''}> →</button>
        </div>

        <div class="sum-grid">
          <div class="sum-card"><div class="sum-label">💰 Revenue</div><div class="sum-val green">₹${totalBR.toFixed(0)}</div></div>
          <div class="sum-card"><div class="sum-label">👥 Customers</div><div class="sum-val blue">${sales.length}</div></div>
          <div class="sum-card"><div class="sum-label">🪣 Cans Out</div><div class="sum-val">${totalBC}</div></div>
          <div class="sum-card"><div class="sum-label">💵 Advance</div><div class="sum-val amber">₹${totalAP.toFixed(0)}</div></div>
        </div>

        <div class="sec-head">
          <span class="sec-title">Transactions (${sales.length})</span>
        </div>
        ${sales.length===0
          ?`<div class="card"><div class="empty"><div class="empty-ico">📭</div><div class="empty-txt">No sales on this date</div></div></div>`
          :`<div class="card">${sales.map(t=>`
            <div class="cust-card" data-id="${t.customer_id}">
              <div class="cust-left">
                <div class="cust-name">${t.customer_name}</div>
                <div class="cust-sub">🪣 ${n(t.balance_can)} cans${n(t.advance_payment)>0?` · AP ₹${n(t.advance_payment).toFixed(0)}`:''}</div>
              </div>
              <div class="cust-right">
                <span class="badge b-amt">₹${n(t.balance_rupees).toFixed(0)}</span>
              </div>
            </div>`).join('')}
          </div>`
        }
        <div style="height:8px;"></div>
      </div>
    `;

    document.getElementById('dn-prev').onclick=()=>{ S.navDate=prevDay(S.navDate); pgToday(); };
    document.getElementById('dn-next').onclick=()=>{ if(!isFuture&&!isToday){ S.navDate=nextDay(S.navDate); pgToday(); } };

    main.querySelectorAll('.cust-card[data-id]').forEach(card=>{
      card.onclick=()=>go('customer',{id:card.dataset.id,from:'today-sales'});
    });
  } catch(e) {
    main.innerHTML=`<div class="page"><div class="empty"><div class="empty-ico">⚠️</div><div class="empty-txt">${e.message}</div></div></div>`;
  }
}

/* ================================================================
   PAGE: ALL SALES
   ================================================================ */
async function pgAllSales() {
  setTitle('');
  const main=document.getElementById('main');
  main.innerHTML=`<div class="page"><div class="loading"><div class="spinner"></div>Loading…</div></div>`;
  try {
    const summary=await db.getAllSalesSummary();
    const totalRev=summary.reduce((s,d)=>s+d.total_br,0);
    const totalTx=summary.reduce((s,d)=>s+d.count,0);
    const totalBC=summary.reduce((s,d)=>s+d.total_bc,0);

    main.innerHTML=`
      <div class="page">
        <div class="stats-strip">
          <div class="stat-chip"><div class="stat-lbl">Total Revenue</div><div class="stat-val" style="color:var(--green)">₹${totalRev.toFixed(0)}</div></div>
          <div class="stat-chip"><div class="stat-lbl">Sale Days</div><div class="stat-val" style="color:var(--primary)">${summary.length}</div></div>
          <div class="stat-chip"><div class="stat-lbl">Transactions</div><div class="stat-val">${totalTx}</div></div>
          <div class="stat-chip"><div class="stat-lbl">Cans Total</div><div class="stat-val" style="color:var(--cyan)">${totalBC}</div></div>
        </div>
        <div class="sec-head">
          <span class="sec-title">Sales by Day</span>
          <button class="sec-action" onclick="downloadReport()">📥 Download PDF</button>
        </div>
        ${summary.length===0
          ?`<div class="card"><div class="empty"><div class="empty-ico">📊</div><div class="empty-txt">No sales data yet</div></div></div>`
          :`<div class="card">${summary.map(d=>`
            <div class="cust-card" data-date="${d.date}">
              <div class="cust-left">
                <div class="cust-name">${fmt(d.date)}</div>
                <div class="cust-sub">${ago(d.date)} · ${d.count} customers · 🪣 ${d.total_bc} cans</div>
              </div>
              <div class="cust-right">
                <span class="badge b-amt">₹${d.total_br.toFixed(0)}</span>
              </div>
            </div>`).join('')}
          </div>`
        }
        <div style="height:8px;"></div>
      </div>
    `;

    main.querySelectorAll('.cust-card[data-date]').forEach(card=>{
      card.onclick=()=>{ S.navDate=card.dataset.date; go('today-sales'); };
    });
  } catch(e) {
    main.innerHTML=`<div class="page"><div class="empty"><div class="empty-ico">⚠️</div><div class="empty-txt">${e.message}</div></div></div>`;
  }
}

/* ================================================================
   SETUP SCREEN
   ================================================================ */
function showSetup() {
  document.getElementById('app').innerHTML=`
    <div class="setup-wrap">
      <div class="setup-ico">💧</div>
      <div class="setup-h">AquaTrack</div>
      <div class="setup-sub">Running in <strong>Offline Mode</strong>.<br>All data saved to this device.<br>Add Supabase keys for cloud sync.</div>
      <div class="setup-card">
        <h3>📋 Supabase SQL Setup</h3>
        <div class="code-block">CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  balance_can INTEGER DEFAULT 0,
  balance_rupees NUMERIC(10,2) DEFAULT 0,
  advance_payment NUMERIC(10,2) DEFAULT 0,
  last_updated_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id)
    ON DELETE CASCADE,
  balance_can INTEGER DEFAULT 0,
  balance_rupees NUMERIC(10,2) DEFAULT 0,
  advance_payment NUMERIC(10,2) DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);</div>
        <div class="setup-note">
          1. Go to <strong>supabase.com</strong> → Create Project<br>
          2. Run the SQL above in the SQL Editor<br>
          3. Copy your Project URL & anon key<br>
          4. Replace <code>YOUR_SUPABASE_URL</code> & <code>YOUR_SUPABASE_ANON_KEY</code> at the top of the &lt;script&gt; tag in this file
        </div>
        <button class="btn btn-primary" id="cont-offline">▶ Continue Offline</button>
      </div>
    </div>
  `;
  document.getElementById('cont-offline').onclick=()=>{
    useLocal=true; toast('📱 Running offline'); renderShell(); go('home');
  };
}

/* ================================================================
   RENDER SHELL
   ================================================================ */
function renderShell() {
  const onSubPage = ['customer','history','settings'].includes(S.page);
  const thIco = S.theme==='dark'?'☀️':'🌙';

  document.getElementById('app').innerHTML = `
    <header id="header">
      <div class="hdr-left">
        ${onSubPage ? '<button class="back-btn" onclick="go(\'home\')">←</button>' : ''}
        <div class="app-logo" id="app-logo">
          <div class="logo-icon">💧</div>
          <div class="logo-text">Aqua<span>Track</span></div>
        </div>
      </div>
      <div class="hdr-title" id="hdr-title"></div>
      <div class="hdr-actions">
        <button class="icon-btn" id="theme-tog">${thIco}</button>
        <button class="icon-btn" onclick="go('settings')">⚙️</button>
      </div>
    </header>
    <main id="main"></main>
    <nav id="bottom-nav">
      <button class="nav-btn ${S.page==='home'?'active':''}" onclick="go('home')">
        <span class="nav-icon">👥</span><span class="nav-label">Customers</span>
      </button>
      <button class="nav-btn ${S.page==='today-sales'?'active':''}" onclick="go('today-sales')">
        <span class="nav-icon">📅</span><span class="nav-label">Daily Sales</span>
      </button>
      <button class="nav-btn ${S.page==='all-sales'?'active':''}" onclick="go('all-sales')">
        <span class="nav-icon">📊</span><span class="nav-label">Summary</span>
      </button>
    </nav>
    <div id="toast"></div>
  `;

  document.getElementById('theme-tog').onclick = () => {
    applyTheme(S.theme==='dark'?'light':'dark');
    renderShell();
  };
}

/* ================================================================
   INIT
   ================================================================ */
async function init() {
  applyTheme(S.theme);

  // If keys missing or invalid, go offline by default but show setup once
  if(!SUPABASE_URL || SUPABASE_URL.includes('YOUR_')) {
    useLocal=true; 
    if(!localStorage.getItem('aq_setup_seen')) {
      localStorage.setItem('aq_setup_seen', 'y');
      showSetup(); 
    } else {
      renderShell(); go('home');
    }
    return;
  }

  try {
    _supabase=window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await _supabase.from('customers').select('id').limit(1);
    renderShell();
    go(S.page); // Initial page load
  } catch(e) {
    console.warn('Supabase connection failed. Using local storage.', e);
    useLocal=true; renderShell(); go('home');
  }
}

init();
