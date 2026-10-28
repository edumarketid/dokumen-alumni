// ================= KONFIGURASI SUPABASE =================
const SUPABASE_URL = 'https://osppykhtjgtloespzecv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zcHB5a2h0amd0bG9lc3B6ZWN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwOTk3ODcsImV4cCI6MjEwODY3NTc4N30.yVGY4IFFQy1afJIvy2_tD9BKqf9s1AubJoNtK2K9wr8';

// Pastikan inisialisasi supabase hanya ada satu di sini
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentStudent = null;
let isAdminLoggedIn = false;

// Utility Hash SHA-256
async function hashPin(pin) {
  const msgBuffer = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function hideAll() {
  ['home', 'activation', 'login', 'adminLogin', 'dashboard', 'adminDashboard'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function showHome() { hideAll(); document.getElementById('home').classList.remove('hidden'); }
function showActivation() { hideAll(); document.getElementById('activation').classList.remove('hidden'); document.getElementById('activationResult').innerHTML = ''; document.getElementById('activationNisn').value = ''; }
function showLogin() { hideAll(); document.getElementById('login').classList.remove('hidden'); document.getElementById('loginMessage').innerHTML = ''; document.getElementById('loginNisn').value = ''; document.getElementById('loginPin').value = ''; }
function toggleAdminLogin() { 
  hideAll(); 
  document.getElementById('adminLogin').classList.remove('hidden'); 
  document.getElementById('adminLoginMessage').innerHTML = ''; 
  document.getElementById('adminPass').value = ''; 
}

// CEK NISN AKTIVASI
async function checkNisn() {
  const nisn = document.getElementById('activationNisn').value.trim();
  const result = document.getElementById('activationResult');
  if (!nisn) { result.innerHTML = '<div class="message">NISN wajib diisi.</div>'; return; }

  showLoadingMessage('Memeriksa NISN...');
  const { data, error } = await supabase.from('siswa').select('*').eq('nisn', nisn).single();
  hideLoadingMessage();

  if (error || !data) {
    result.innerHTML = '<div class="message">NISN tidak ditemukan dalam database sekolah.</div>';
    return;
  }

  if (data.pin_hash) {
    result.innerHTML = '<div class="message">Akun ini sudah aktif. Silakan login menggunakan NISN dan PIN.</div>';
    return;
  }

  result.innerHTML = `
    <div class="message"><b>Data ditemukan:</b> ${data.nama}</div>
    <label>Buat PIN (6 Angka)</label>
    <input id="newPin" type="password" inputmode="numeric" maxlength="6" placeholder="******">
    <label>Ulangi PIN</label>
    <input id="confirmPin" type="password" inputmode="numeric" maxlength="6" placeholder="******">
    <button class="btn-primary" onclick="activate('${data.nisn}')">Aktivasi Akun Sekarang</button>
  `;
}

// AKTIVASI AKUN
async function activate(nisn) {
  const pin = document.getElementById('newPin').value.trim();
  const confirm = document.getElementById('confirmPin').value.trim();

  if (!/^\d{6}$/.test(pin)) { alert('PIN harus terdiri dari 6 angka.'); return; }
  if (pin !== confirm) { alert('Konfirmasi PIN tidak sama.'); return; }

  showLoadingMessage('Mengaktifkan akun...');
  const pinHash = await hashPin(pin);

  const { error } = await supabase.from('siswa').update({
    pin_hash: pinHash,
    status: 'AKTIF',
    aktivasi_at: new Date()
  }).eq('nisn', nisn);

  hideLoadingMessage();
  if (error) { alert('Gagal mengaktifkan: ' + error.message); return; }

  alert('Aktivasi berhasil! Silakan login.');
  document.getElementById('loginNisn').value = nisn;
  showLogin();
}

// LOGIN SISWA
async function doLogin() {
  const nisn = document.getElementById('loginNisn').value.trim();
  const pin = document.getElementById('loginPin').value.trim();
  const message = document.getElementById('loginMessage');

  if (!nisn || !pin) { message.innerHTML = '<div class="message">NISN dan PIN wajib diisi.</div>'; return; }

  showLoadingMessage('Memeriksa login...');
  const { data, error } = await supabase.from('siswa').select('*').eq('nisn', nisn).single();
  hideLoadingMessage();

  if (error || !data || !data.pin_hash) {
    message.innerHTML = '<div class="message">NISN atau PIN salah.</div>';
    return;
  }

  const pinHash = await hashPin(pin);
  if (pinHash !== data.pin_hash) {
    message.innerHTML = '<div class="message">NISN atau PIN salah.</div>';
    return;
  }

  await supabase.from('siswa').update({ login_at: new Date() }).eq('nisn', nisn);
  currentStudent = data;
  loadDashboard();
}

// LOGIN ADMIN
async function doAdminLogin() {
  const username = document.getElementById('adminUser').value.trim();
  const pass = document.getElementById('adminPass').value.trim();
  const message = document.getElementById('adminLoginMessage');

  if (!username || !pass) { message.innerHTML = '<div class="message">Username dan Password wajib diisi.</div>'; return; }

  showLoadingMessage('Memeriksa admin...');
  const passHash = await hashPin(pass);

  const { data, error } = await supabase.from('admin_config').select('*').eq('username', username).single();
  hideLoadingMessage();

  if (error || !data || data.password_hash !== passHash) {
    message.innerHTML = '<div class="message">Password admin salah.</div>';
    return;
  }

  isAdminLoggedIn = true;
  hideAll();
  document.getElementById('adminDashboard').classList.remove('hidden');
  document.getElementById('uploadMessage').innerHTML = '';
}

// UPLOAD DOKUMEN ADMIN
async function uploadDocumentByAdmin() {
  const category = document.getElementById('uploadCategory').value;
  const nisn = document.getElementById('uploadNisn').value.trim();
  const fileInput = document.getElementById('uploadFile');
  const msg = document.getElementById('uploadMessage');

  if (!nisn || fileInput.files.length === 0) {
    msg.innerHTML = '<div class="message" style="border-left-color: #ef4444; color: #b91c1c;">NISN dan File wajib diisi.</div>';
    return;
  }

  const file = fileInput.files[0];
  const fileName = `${nisn}_${file.name}`;
  const filePath = `${category}/${fileName}`;

  showLoadingMessage('Mengunggah file...');

  const { error } = await supabase.storage
    .from('student-documents')
    .upload(filePath, file, { upsert: true });

  hideLoadingMessage();

  if (error) {
    msg.innerHTML = `<div class="message" style="border-left-color: #ef4444; color: #b91c1c;">Gagal upload: ${error.message}</div>`;
  } else {
    msg.innerHTML = `<div class="message" style="border-left-color: #22c55e; color: #15803d;">Berhasil upload dokumen ke folder ${category}!</div>`;
    fileInput.value = '';
    document.getElementById('uploadNisn').value = '';
  }
}

// DASHBOARD SISWA & ALUMNI
async function loadDashboard() {
  hideAll();
  document.getElementById('dashboard').classList.remove('hidden');
  document.getElementById('studentName').textContent = currentStudent.nama;

  let metaHtml = `<span class="badge">NISN: ${currentStudent.nisn}</span>`;
  if (currentStudent.tipe_pengguna) {
    const isAlumni = currentStudent.tipe_pengguna.toUpperCase() === 'ALUMNI';
    metaHtml += ` <span class="badge ${isAlumni ? 'badge-alumni' : ''}">${currentStudent.tipe_pengguna.toUpperCase()}</span>`;
  }
  if (currentStudent.angkatan) {
    metaHtml += ` <span class="badge">Angkatan ${currentStudent.angkatan}</span>`;
  }
  document.getElementById('studentMeta').innerHTML = metaHtml;
  document.getElementById('documents').innerHTML = '<div class="empty">Memuat dokumen Anda...</div>';

  const { data: categories, error: catError } = await supabase.storage
    .from('student-documents')
    .list('', { limit: 100, sortBy: { column: 'name', order: 'asc' } });

  const container = document.getElementById('documents');
  if (catError || !categories || categories.length === 0) {
    container.innerHTML = '<div class="empty">Dokumen Anda belum tersedia.</div>';
    return;
  }

  let allStudentDocuments = [];
  for (const cat of categories) {
    if (!cat.id && cat.name) {
      const categoryName = cat.name;
      const { data: files, error: fileError } = await supabase.storage
        .from('student-documents')
        .list(categoryName + '/', { limit: 500 });

      if (!fileError && files) {
        files.forEach(file => {
          if (file.name.includes(currentStudent.nisn)) {
            allStudentDocuments.push({
              jenis: categoryName,
              namaFile: file.name.replace(currentStudent.nisn + '_', ''),
              filePath: `${categoryName}/${file.name}`
            });
          }
        });
      }
    }
  }

  if (allStudentDocuments.length === 0) {
    container.innerHTML = '<div class="empty">Belum ada dokumen yang diunggah untuk akun ini.</div>';
    return;
  }

  allStudentDocuments.sort((a, b) => a.jenis.localeCompare(b.jenis));
  let html = '';
  allStudentDocuments.forEach(doc => {
    html += `
      <div class="document">
        <div class="document-title">📄 ${doc.jenis}</div>
        <div class="document-file">${doc.namaFile}</div>
        <button class="btn-primary" onclick="openDocument('${doc.filePath}')">Lihat Dokumen</button>
        <button class="btn-secondary" onclick="downloadDocument('${doc.filePath}', '${doc.namaFile}')">Download File</button>
      </div>
    `;
  });
  container.innerHTML = html;
}

async function getFileUrl(filePath) {
  const { data, error } = await supabase.storage.from('student-documents').createSignedUrl(filePath, 60);
  if (error) { alert('Gagal membuka dokumen.'); return null; }
  return data.signedUrl;
}

async function openDocument(filePath) {
  showLoadingMessage('Menyiapkan file...');
  const url = await getFileUrl(filePath);
  hideLoadingMessage();
  if (url) window.open(url, '_blank');
}

async function downloadDocument(filePath, fileName) {
  showLoadingMessage('Menyiapkan download...');
  const url = await getFileUrl(filePath);
  hideLoadingMessage();
  if (url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

function doLogout() {
  currentStudent = null;
  isAdminLoggedIn = false;
  showHome();
}

function showLoadingMessage(text) {
  const loading = document.getElementById('loadingMessage');
  loading.textContent = text;
  loading.style.display = 'block';
}

function hideLoadingMessage() {
  document.getElementById('loadingMessage').style.display = 'none';
}