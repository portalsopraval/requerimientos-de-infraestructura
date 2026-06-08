/* ═══════════════════════════════════════════════════════════
   AGROSUPER – Portal de Requerimientos de Infraestructura
   Almacenamiento: Cloud Firestore (Firebase)
   ─────────────────────────────────────────────────────────
   ROLES:
     user         → ingresa solicitudes, ve las suyas
     jefe_area    → ídem + ve solicitudes de su área
     mantenimiento→ agrega costos, ve todas
     supervisor   → ve todas con costos (Jefa Administración)
     gerente      → autoriza / posterga / rechaza
     admin        → gestión de usuarios y roles (solo gvelizm)
═══════════════════════════════════════════════════════════ */

// ── Firebase Init ──────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDLA0GPjLrWJIDoPjo9vXPmnJLnUi-9jMY",
  authDomain:        "portal-necesidades-la-calera.firebaseapp.com",
  projectId:         "portal-necesidades-la-calera",
  storageBucket:     "portal-necesidades-la-calera.firebasestorage.app",
  messagingSenderId: "945581573169",
  appId:             "1:945581573169:web:09dbd4804ca4acddaf0110"
};
firebase.initializeApp(firebaseConfig);
const fdb = firebase.firestore();

// ── Cache en memoria ───────────────────────────────────────
const _cache = { users: [], sols: [], notifs: [] };

// ── DB facade ──────────────────────────────────────────────
const DB = {
  users:     () => _cache.users,
  sols:      () => _cache.sols,
  addUser:   (user) => fdb.collection('users').doc(user.id).set(user),
  addSol:    (sol)  => fdb.collection('solicitudes').doc(sol.id).set(sol),
  updateSol: (id, data) => fdb.collection('solicitudes').doc(id).update(data),
};

// ── Helpers ────────────────────────────────────────────────
const uid  = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const esc  = s  => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt  = iso => iso ? new Date(iso).toLocaleString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
const fmtD = iso => iso ? new Date(iso).toLocaleDateString('es-CL') : '—';
const clp  = n   => Number(n).toLocaleString('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
const initials   = name => name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
const motivoCss  = m => 'badge-motivo-' + String(m).replace(/\s+/g, '-');
const areaName   = letter => ({A:'Producción',B:'Administración',C:'Calidad',D:'Personas',E:'Mantenimiento',F:'Despacho',G:'Rendering',H:'Excelencia Operacional'}[letter]||letter);

// Genera ticket correlativo usando contador atómico en Firestore
async function generateTicket() {
  const year = new Date().getFullYear();
  const counterRef = fdb.collection('config').doc('ticket_counter');
  const counter = await fdb.runTransaction(async t => {
    const doc = await t.get(counterRef);
    const current = doc.exists ? (doc.data()[String(year)] || 0) : 0;
    const next = current + 1;
    t.set(counterRef, { [String(year)]: next }, { merge: true });
    return next;
  });
  return `REQ-${year}-${String(counter).padStart(3, '0')}`;
}

// ── Seed usuarios precargados ──────────────────────────────
async function seedUsers() {
  const preset = [
    { email:'fescobara@sopraval.cl',    name:'Fabián Escobar',    role:'mantenimiento', areaCode:'E', areaGroup:'Mantenimiento', areaSub:'Planificación de Mtto. y Proyectos', title:'Subgerente de Mantenimiento' },
    { email:'bgutierrezl@agrosuper.com',name:'Barbara Gutierrez', role:'supervisor',    areaCode:'B', areaGroup:'Administración',areaSub:'Administración Gral.',                title:'Jefa de Administración' },
    { email:'jbarrios@agrosuper.com',   name:'Jorge Barrios',     role:'jefe_area',     areaCode:'A', areaGroup:'Producción',    areaSub:'Producción',                           title:'Subgerente de Producción' },
    { email:'rabarzua@sopraval.cl',     name:'Rodrigo Abarzua',   role:'gerente',       areaCode:'G0',areaGroup:'Gerencia',      areaSub:'Gerencia de Planta',                   title:'Gerente de Planta' },
    { email:'mcordovas@agrosuper.com',  name:'Gabriela Cordova',  role:'jefe_area',     areaCode:'C', areaGroup:'Calidad',       areaSub:'Calidad',                              title:'Jefe de Calidad' },
    { email:'amorgado@sopraval.cl',     name:'Andrea Morgado',    role:'jefe_area',     areaCode:'D', areaGroup:'Personas',      areaSub:'Personas General',                     title:'Jefe de Personas' },
    { email:'rtrigo@sopraval.cl',       name:'Ricardo Trigo',     role:'jefe_area',     areaCode:'F', areaGroup:'Despacho',      areaSub:'Despacho',                             title:'Jefe de Despacho' },
    { email:'nmarquez@sopraval.cl',     name:'Nicolás Marquez',   role:'jefe_area',     areaCode:'G', areaGroup:'Rendering',     areaSub:'Planta de Rendering',                  title:'Jefe de Planta Rendering' },
    { email:'gvelizm@sopraval.cl',      name:'Gino Veliz',        role:'admin',         areaCode:'G0',areaGroup:'Gerencia',      areaSub:'Administración Portal',                title:'Administrador del Sistema' },
  ];
  const existingEmails = new Set(_cache.users.map(u => u.email));
  const batch = fdb.batch();
  let count = 0;
  preset.forEach(p => {
    if (!existingEmails.has(p.email)) {
      const id = uid();
      batch.set(fdb.collection('users').doc(id), {
        id, password: p.email === 'gvelizm@sopraval.cl' ? 'Sopraval2026' : 'Sopraval2026', createdAt: new Date().toISOString(), ...p
      });
      count++;
    }
  });
  if (count > 0) await batch.commit();
}

// ── Estado global ──────────────────────────────────────────
let CU = null;
let openSolId = null;
let chartCount = null, chartCost = null;
let _activeTab = null;

// ── Toast ──────────────────────────────────────────────────
function toast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.className = 'toast', 3500);
}

// ── Navegación de pantallas ────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-'+id).classList.add('active');
}

// ── Re-render pestaña activa ───────────────────────────────
function reRenderActive() {
  if (!CU || !_activeTab) return;
  if (_activeTab === 'mis')          renderMis();
  if (_activeTab === 'costos')       renderCostos();
  if (_activeTab === 'revision')     renderRevision();
  if (_activeTab === 'autorizacion') renderAutorizacion();
  if (_activeTab === 'visual')       renderVisual();
  if (_activeTab === 'adminpanel')   renderAdminPanel();
}

// ── Listeners en tiempo real ───────────────────────────────
function startListeners() {
  fdb.collection('users').onSnapshot(snap => {
    _cache.users = snap.docs.map(d => d.data());
  });
  fdb.collection('solicitudes').onSnapshot(snap => {
    _cache.sols = snap.docs.map(d => d.data());
    reRenderActive();
  });
  // Listener de notificaciones se inicia en initDashboard() según el rol
}

// ── App Init ───────────────────────────────────────────────
async function appInit() {
  document.getElementById('screen-login').classList.remove('active');

  // Carga inicial de datos
  const [usersSnap, solsSnap] = await Promise.all([
    fdb.collection('users').get(),
    fdb.collection('solicitudes').get(),
  ]);
  _cache.users = usersSnap.docs.map(d => d.data());
  _cache.sols  = solsSnap.docs.map(d => d.data());

  // Seed usuarios si es necesario
  await seedUsers();
  // Recargar users tras seed
  const usersSnap2 = await fdb.collection('users').get();
  _cache.users = usersSnap2.docs.map(d => d.data());

  // Iniciar listeners en tiempo real
  startListeners();

  // Mostrar login
  showScreen('login');
}

appInit().catch(err => {
  console.error('Error iniciando app:', err);
  showScreen('login'); // mostrar login igual si hay error
});

// Migración: crear notificaciones para solicitudes decididas antes del sistema de notificaciones
async function backfillNotificaciones() {
  const flag = await fdb.collection('config').doc('notif_backfill').get();
  if (flag.exists) return; // ya ejecutado

  const [solsSnap, notifsSnap] = await Promise.all([
    fdb.collection('solicitudes').get(),
    fdb.collection('notificaciones').get(),
  ]);
  const sols   = solsSnap.docs.map(d => d.data());
  const notifSolIds = new Set(notifsSnap.docs.map(d => d.data().solicitudId));
  const decididas = sols.filter(s => ['Autorizada','Postergada','Rechazada'].includes(s.estado) && !notifSolIds.has(s.id));
  if (decididas.length === 0) {
    await fdb.collection('config').doc('notif_backfill').set({ done: true });
    return;
  }

  const usersSnap = await fdb.collection('users').get();
  const mttUsers  = usersSnap.docs.map(d => d.data()).filter(u => u.role === 'mantenimiento');
  const iconos    = { Autorizada:'✅', Postergada:'⏸️', Rechazada:'❌' };

  const batch = fdb.batch();
  decididas.forEach(sol => {
    const msg = sol.estado === 'Autorizada'
      ? `${sol.ticket||''} <strong>${sol.titulo}</strong> fue <strong>AUTORIZADO</strong> por Gerencia.${sol.esActivable ? ' Requiere gestión de <strong>API o SIM</strong>.' : ''}`
      : `${sol.ticket||''} <strong>${sol.titulo}</strong> fue <strong>${sol.estado.toUpperCase()}</strong> por Gerencia.`;
    mttUsers.forEach(u => {
      const nid = Date.now().toString(36) + Math.random().toString(36).slice(2,6);
      batch.set(fdb.collection('notificaciones').doc(nid), {
        id: nid, toUserId: u.id, toEmail: u.email,
        type: sol.estado.toLowerCase(),
        icon: iconos[sol.estado] || '🔔',
        message: msg, solicitudId: sol.id,
        ticket: sol.ticket || '', titulo: sol.titulo,
        esActivable: !!sol.esActivable, read: false,
        createdAt: sol.decidedAt || sol.updatedAt || new Date().toISOString(),
      });
    });
  });
  await batch.commit();
  await fdb.collection('config').doc('notif_backfill').set({ done: true });
  console.log(`Backfill: ${decididas.length} notificaciones creadas.`);
}
backfillNotificaciones().catch(console.error);

// ── Tabs ───────────────────────────────────────────────────
const TABS = {
  user:         [['nueva','Nueva Solicitud'],['mis','Mis Solicitudes']],
  jefe_area:    [['nueva','Nueva Solicitud'],['mis','Mis Solicitudes'],['revision','Revisión de Solicitudes']],
  mantenimiento:[['nueva','Nueva Solicitud'],['mis','Mis Solicitudes'],['costos','Gestión de Costos'],['revision','Revisión de Solicitudes'],['visual','Gestión Visual']],
  supervisor:   [['nueva','Nueva Solicitud'],['mis','Mis Solicitudes'],['revision','Revisión de Solicitudes'],['visual','Gestión Visual']],
  gerente:      [['autorizacion','Autorización Pendiente'],['revision','Revisión de Solicitudes'],['visual','Gestión Visual']],
  admin:        [['revision','Revisión de Solicitudes'],['visual','Gestión Visual'],['adminpanel','⚙️ Gestión de Usuarios']],
};

function buildTabs() {
  const bar  = document.getElementById('tab-bar');
  const tabs = TABS[CU.role] || TABS.user;
  bar.innerHTML = tabs.map(([id,label]) =>
    `<button class="tab-btn" data-pane="${id}">${label}</button>`
  ).join('');
  bar.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.pane));
  });
  activateTab(tabs[0][0]);
}

function activateTab(id) {
  _activeTab = id;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.pane === id));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'pane-'+id));
  if (id === 'mis')          renderMis();
  if (id === 'costos')       renderCostos();
  if (id === 'revision')     renderRevision();
  if (id === 'autorizacion') renderAutorizacion();
  if (id === 'visual')       renderVisual();
  if (id === 'adminpanel')   renderAdminPanel();
}

// ── Login ──────────────────────────────────────────────────
document.getElementById('go-register').addEventListener('click',          e => { e.preventDefault(); showScreen('register'); });
document.getElementById('go-login').addEventListener('click',             e => { e.preventDefault(); showScreen('login'); });
document.getElementById('go-recover').addEventListener('click',           e => { e.preventDefault(); resetRecoverForm(); showScreen('recover'); });
document.getElementById('go-login-from-recover').addEventListener('click',e => { e.preventDefault(); showScreen('login'); });

document.getElementById('form-login').addEventListener('submit', e => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pass  = document.getElementById('login-pass').value;
  const err   = document.getElementById('login-error');
  const user  = DB.users().find(u => u.email.toLowerCase() === email && u.password === pass);
  if (!user) { err.textContent = 'Correo o contraseña incorrectos.'; return; }
  err.textContent = '';
  CU = user;
  initDashboard();
  showScreen('dashboard');
});

document.getElementById('btn-logout').addEventListener('click', () => {
  CU = null; _activeTab = null; chartCount = null; chartCost = null;
  document.getElementById('form-login').reset();
  showScreen('login');
});

// ── Cambiar contraseña (navbar) ───────────────────────────
document.getElementById('btn-cambiar-pass').addEventListener('click', () => {
  document.getElementById('form-cambiar-pass').reset();
  document.getElementById('cp-error').textContent = '';
  document.getElementById('modal-pass-overlay').style.display = 'flex';
});
document.getElementById('modal-pass-close').addEventListener('click', () => {
  document.getElementById('modal-pass-overlay').style.display = 'none';
});
document.getElementById('modal-pass-overlay').addEventListener('click', e => {
  if (e.target.id === 'modal-pass-overlay')
    document.getElementById('modal-pass-overlay').style.display = 'none';
});
document.getElementById('form-cambiar-pass').addEventListener('submit', async e => {
  e.preventDefault();
  const actual   = document.getElementById('cp-actual').value;
  const nueva    = document.getElementById('cp-nueva').value;
  const confirma = document.getElementById('cp-confirma').value;
  const errEl    = document.getElementById('cp-error');
  if (actual !== CU.password)        { errEl.textContent = 'La contraseña actual es incorrecta.'; return; }
  if (nueva.length < 6)              { errEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.'; return; }
  if (nueva !== confirma)            { errEl.textContent = 'Las contraseñas no coinciden.'; return; }
  errEl.textContent = '';
  await fdb.collection('users').doc(CU.id).update({ password: nueva });
  CU.password = nueva;
  document.getElementById('modal-pass-overlay').style.display = 'none';
  toast('Contraseña actualizada correctamente.', 'ok');
});

// ── Recuperar contraseña (pantalla login) ─────────────────
let _recoverStep = 1;
let _recoverUser = null;

function resetRecoverForm() {
  _recoverStep = 1; _recoverUser = null;
  document.getElementById('form-recover').reset();
  document.getElementById('rec-new-pass-wrap').style.display = 'none';
  document.getElementById('rec-error').textContent = '';
  document.getElementById('rec-ok').style.display = 'none';
  document.getElementById('rec-btn').textContent = 'Verificar correo';
}

document.getElementById('form-recover').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('rec-error');
  const okEl  = document.getElementById('rec-ok');
  errEl.textContent = ''; okEl.style.display = 'none';

  if (_recoverStep === 1) {
    const email = document.getElementById('rec-email').value.trim().toLowerCase();
    const user  = DB.users().find(u => u.email.toLowerCase() === email);
    if (!user) { errEl.textContent = 'No existe ninguna cuenta con ese correo.'; return; }
    _recoverUser = user;
    _recoverStep = 2;
    document.getElementById('rec-new-pass-wrap').style.display = '';
    document.getElementById('rec-btn').textContent = 'Cambiar contraseña';
    okEl.textContent = `Cuenta encontrada: ${user.name}. Ingrese su nueva contraseña.`;
    okEl.style.display = 'block';
  } else {
    const nueva    = document.getElementById('rec-new-pass').value;
    const confirma = document.getElementById('rec-confirm-pass').value;
    if (nueva.length < 6)   { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
    if (nueva !== confirma) { errEl.textContent = 'Las contraseñas no coinciden.'; return; }
    await fdb.collection('users').doc(_recoverUser.id).update({ password: nueva });
    toast('Contraseña restablecida. Ya puede iniciar sesión.', 'ok');
    resetRecoverForm();
    showScreen('login');
  }
});

// ── Registro ───────────────────────────────────────────────
document.getElementById('form-register').addEventListener('submit', async e => {
  e.preventDefault();
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const pass  = document.getElementById('reg-pass').value;
  const area  = document.getElementById('reg-area').value;
  const err   = document.getElementById('reg-error');
  if (!area) { err.textContent = 'Seleccione su área de trabajo.'; return; }
  if (DB.users().find(u => u.email.toLowerCase() === email)) { err.textContent = 'Ese correo ya está registrado.'; return; }
  const [areaCode, areaGroup, areaSub] = area.split('|');
  const newUser = { id:uid(), name, email, password:pass, role:'user', areaCode, areaGroup, areaSub, title:'', createdAt:new Date().toISOString() };
  await DB.addUser(newUser);
  toast('Cuenta creada. Ahora puede iniciar sesión.','ok');
  showScreen('login');
  document.getElementById('form-register').reset();
  err.textContent = '';
});

// ── Dashboard init ─────────────────────────────────────────
function initDashboard() {
  document.getElementById('nav-avatar').textContent = initials(CU.name);
  document.getElementById('nav-name').textContent   = CU.name;
  document.getElementById('nav-area').textContent   = CU.title || CU.areaGroup || '';

  // Botón de notificaciones: visible para mantenimiento
  const btnNotif = document.getElementById('btn-notif');
  if (CU.role === 'mantenimiento') {
    btnNotif.style.display = 'flex';
    // Arrancar listener de notificaciones (filtramos read en cliente para evitar índice compuesto)
    fdb.collection('notificaciones')
      .where('toUserId', '==', CU.id)
      .onSnapshot(snap => {
        _cache.notifs = snap.docs.map(d => ({ docId: d.id, ...d.data() })).filter(n => !n.read);
        updateNotifBadge();
      });
  } else {
    btnNotif.style.display = 'none';
    document.getElementById('notif-panel').style.display = 'none';
  }

  buildTabs();
}

// ── NUEVA SOLICITUD ────────────────────────────────────────
let fotoBase64 = null;

const fotoInput = document.getElementById('sol-foto');
fotoInput.addEventListener('change', () => {
  const file = fotoInput.files[0];
  if (!file) return;
  if (file.size > 2.5 * 1024 * 1024) {
    toast('La imagen supera los 2 MB. Elija una más pequeña.','err');
    fotoInput.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => {
    fotoBase64 = ev.target.result;
    document.getElementById('foto-preview').src = fotoBase64;
    document.getElementById('foto-preview-wrap').style.display = '';
    document.getElementById('file-name-display').textContent = file.name;
  };
  reader.readAsDataURL(file);
});

document.getElementById('foto-remove').addEventListener('click', () => {
  fotoBase64 = null;
  fotoInput.value = '';
  document.getElementById('foto-preview-wrap').style.display = 'none';
  document.getElementById('file-name-display').textContent = 'Haga clic o arrastre una imagen aquí';
});

document.getElementById('btn-reset-sol').addEventListener('click', () => {
  fotoBase64 = null;
  document.getElementById('foto-preview-wrap').style.display = 'none';
  document.getElementById('file-name-display').textContent = 'Haga clic o arrastre una imagen aquí';
  document.getElementById('sol-error').textContent = '';
});

document.getElementById('form-solicitud').addEventListener('submit', async e => {
  e.preventDefault();
  const titulo      = document.getElementById('sol-titulo').value.trim();
  const descripcion = document.getElementById('sol-descripcion').value.trim();
  const areaVal     = document.getElementById('sol-area').value;
  const motivo      = document.getElementById('sol-motivo').value;
  const prioridad   = document.querySelector('input[name="prioridad"]:checked')?.value;
  const err         = document.getElementById('sol-error');

  if (!areaVal)    { err.textContent = 'Seleccione el área del requerimiento.'; return; }
  if (!motivo)     { err.textContent = 'Seleccione el motivo del requerimiento.'; return; }
  if (!prioridad)  { err.textContent = 'Seleccione la prioridad del requerimiento.'; return; }
  if (!fotoBase64) { err.textContent = 'Debe adjuntar una fotografía de respaldo.'; return; }
  err.textContent = '';

  const [areaCode, areaGroup, areaSub] = areaVal.split('|');
  const ticket = await generateTicket();
  const nueva = {
    id: uid(),
    ticket,
    userId:    CU.id,
    userName:  CU.name,
    userEmail: CU.email,
    areaCode, areaGroup, areaSub,
    titulo, descripcion, motivo, prioridad,
    foto: fotoBase64,
    estado: 'Pendiente',
    esActivable: false,
    costo: null,
    notasMtt: '',
    comentarioGerente: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    valorizedAt: null,
    decidedAt: null,
  };

  await DB.addSol(nueva);
  toast('Requerimiento enviado correctamente. Mantenimiento revisará el costo estimado.','ok');
  document.getElementById('form-solicitud').reset();
  document.querySelectorAll('input[name="prioridad"]').forEach(r => r.checked = false);
  fotoBase64 = null;
  document.getElementById('foto-preview-wrap').style.display = 'none';
  document.getElementById('file-name-display').textContent = 'Haga clic o arrastre una imagen aquí';
});

// ── MIS SOLICITUDES ────────────────────────────────────────
document.getElementById('mis-search').addEventListener('input', renderMis);

function renderMis() {
  const q    = document.getElementById('mis-search').value.toLowerCase();
  let   sols = DB.sols().filter(s => s.userId === CU.id);
  if (q) sols = sols.filter(s => srch(s, q));
  sols.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  const el = document.getElementById('mis-lista');
  el.innerHTML = sols.length
    ? `<div class="sol-list">${sols.map(s => solCard(s)).join('')}</div>`
    : '<p class="empty-msg">No tiene solicitudes registradas aún.</p>';
  attachCards(el);
}

// ── GESTIÓN DE COSTOS (Mantenimiento) ─────────────────────
document.getElementById('costos-search').addEventListener('input', renderCostos);
document.getElementById('costos-filter-estado').addEventListener('change', renderCostos);

function renderCostos() {
  const q      = document.getElementById('costos-search').value.toLowerCase();
  const estado = document.getElementById('costos-filter-estado').value;
  let sols = DB.sols();
  if (estado) sols = sols.filter(s => s.estado === estado);
  if (q)      sols = sols.filter(s => srch(s, q));
  sols.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  const el = document.getElementById('costos-lista');
  el.innerHTML = sols.length
    ? `<div class="sol-list">${sols.map(s => solCard(s, true)).join('')}</div>`
    : '<p class="empty-msg">No hay solicitudes que coincidan.</p>';
  attachCards(el);
}

// ── REVISIÓN DE SOLICITUDES ────────────────────────────────
['rev-search','rev-filter-area','rev-filter-estado','rev-filter-motivo','rev-filter-prioridad'].forEach(id => {
  document.getElementById(id).addEventListener(id==='rev-search'?'input':'change', renderRevision);
});

function renderRevision() {
  const q        = document.getElementById('rev-search').value.toLowerCase();
  const area     = document.getElementById('rev-filter-area').value;
  const estado   = document.getElementById('rev-filter-estado').value;
  const motivo   = document.getElementById('rev-filter-motivo').value;
  const prioridad= document.getElementById('rev-filter-prioridad').value;

  let sols = DB.sols();
  if (CU.role === 'jefe_area') sols = sols.filter(s => s.areaCode === CU.areaCode);
  if (area)      sols = sols.filter(s => s.areaCode  === area);
  if (estado)    sols = sols.filter(s => s.estado    === estado);
  if (motivo)    sols = sols.filter(s => s.motivo    === motivo);
  if (prioridad) sols = sols.filter(s => s.prioridad === prioridad);
  if (q)         sols = sols.filter(s => srch(s, q));
  sols.sort((a,b) => b.createdAt.localeCompare(a.createdAt));

  document.getElementById('rev-stats').innerHTML = statsBar(sols);
  const el = document.getElementById('rev-lista');
  el.innerHTML = sols.length
    ? `<div class="sol-list">${sols.map(s => solCard(s, CU.role==='mantenimiento'||CU.role==='supervisor'||CU.role==='gerente')).join('')}</div>`
    : '<p class="empty-msg">No hay solicitudes que coincidan con los filtros.</p>';
  attachCards(el);
}

function statsBar(sols) {
  const cnt = (est) => sols.filter(s=>s.estado===est).length;
  const estados = ['Pendiente','Valorizada','Autorizada','Postergada','Rechazada'];
  return `<div class="stats-bar">${estados.map(e=>
    `<div class="stat-pill"><span class="stat-n">${cnt(e)}</span>${e}</div>`
  ).join('')}<div class="stat-pill"><span class="stat-n">${sols.length}</span>Total</div></div>`;
}

// ── AUTORIZACIÓN (Gerente de Planta) ──────────────────────
function renderAutorizacion() {
  const sols = DB.sols().filter(s => ['Pendiente','Valorizada'].includes(s.estado)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  document.getElementById('auth-stats').innerHTML = statsBar(DB.sols());
  const el = document.getElementById('auth-lista');
  el.innerHTML = sols.length
    ? `<div class="sol-list">${sols.map(s => solCard(s, true)).join('')}</div>`
    : '<p class="empty-msg">No hay requerimientos pendientes de autorización.</p>';
  attachCards(el);
}

// ── CARD HTML ──────────────────────────────────────────────
function solCard(s, showCost=false) {
  const costoHtml    = showCost && s.costo != null
    ? `<div class="sol-costo">Costo: <span>${clp(s.costo)}</span></div>` : '';
  const ticketHtml    = s.ticket ? `<span class="sol-ticket">${esc(s.ticket)}</span>` : '';
  const activableHtml = s.esActivable ? `<span class="badge badge-activable">🔧 Activable</span>` : '';
  const prioIcon      = {Alta:'🔴', Media:'🟡', Baja:'🟢'};
  const prioHtml      = s.prioridad ? `<span class="badge badge-prio-${s.prioridad}">${prioIcon[s.prioridad]||''} ${s.prioridad}</span>` : '';
  return `
  <div class="sol-card" data-id="${s.id}">
    <div class="sol-card-left">
      <div class="sol-card-title">${ticketHtml}${esc(s.titulo)}</div>
      <div class="sol-card-meta">
        <span>📍 ${s.areaGroup} › ${s.areaSub}</span>
        <span>📅 ${fmt(s.createdAt)}</span>
        <span>👤 ${esc(s.userName)}</span>
      </div>
      <div class="sol-card-desc">${esc(s.descripcion)}</div>
    </div>
    <div class="sol-card-right">
      ${prioHtml}
      <span class="badge badge-${CSS.escape(s.estado)}">${s.estado}</span>
      <span class="badge ${motivoCss(s.motivo)}">${s.motivo}</span>
      ${activableHtml}
      ${costoHtml}
    </div>
  </div>`;
}

function attachCards(container) {
  container.querySelectorAll('.sol-card').forEach(el => {
    el.addEventListener('click', () => openModal(el.dataset.id));
  });
}

function srch(s, q) {
  return [s.titulo,s.descripcion,s.areaGroup,s.areaSub,s.motivo,s.userName,s.estado]
    .some(f => String(f||'').toLowerCase().includes(q));
}

// ── MODAL ──────────────────────────────────────────────────
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target.id==='modal-overlay') closeModal(); });

function openModal(id) {
  const s = DB.sols().find(x => x.id === id);
  if (!s) return;
  openSolId = id;

  document.getElementById('modal-title').innerHTML =
    (s.ticket ? `<span class="modal-ticket">${esc(s.ticket)}</span> ` : '') + esc(s.titulo);

  document.getElementById('modal-body').innerHTML = `
    <div class="detail-grid">
      <div class="detail-item">
        <span class="detail-label">N° Ticket</span>
        <span class="detail-value"><strong>${s.ticket ? esc(s.ticket) : '—'}</strong></span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Prioridad</span>
        <span class="detail-value">${s.prioridad ? `<span class="badge badge-prio-${s.prioridad}">${{Alta:'🔴',Media:'🟡',Baja:'🟢'}[s.prioridad]||''} ${s.prioridad}</span>` : '—'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Estado</span>
        <span class="detail-value"><span class="badge badge-${CSS.escape(s.estado)}">${s.estado}</span>${s.esActivable ? ' <span class="badge badge-activable">🔧 Activable</span>' : ''}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Motivo</span>
        <span class="detail-value"><span class="badge ${motivoCss(s.motivo)}">${s.motivo}</span></span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Área</span>
        <span class="detail-value">${esc(s.areaGroup)} › ${esc(s.areaSub)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Solicitante</span>
        <span class="detail-value">${esc(s.userName)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Fecha solicitud</span>
        <span class="detail-value">${fmt(s.createdAt)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Costo estimado</span>
        <span class="detail-value">${s.costo != null ? clp(s.costo) : 'Pendiente de valorización'}</span>
      </div>
      ${s.notasMtt ? `<div class="detail-item detail-full"><span class="detail-label">Notas de Mantenimiento</span><span class="detail-value">${esc(s.notasMtt)}</span></div>` : ''}
      ${s.decidedAt ? `<div class="detail-item"><span class="detail-label">Fecha decisión</span><span class="detail-value">${fmt(s.decidedAt)}</span></div>` : ''}
    </div>
    <div class="detail-desc-box">${esc(s.descripcion)}</div>
    ${s.comentarioGerente ? `<div class="obs-box"><strong>Comentario Gerencia:</strong> ${esc(s.comentarioGerente)}</div>` : ''}
    ${s.foto ? `<div class="detail-foto"><img src="${s.foto}" alt="Fotografía de respaldo" /></div>` : ''}
  `;

  const secCosto = document.getElementById('modal-costo-section');
  secCosto.style.display = (CU.role === 'mantenimiento' && s.estado === 'Pendiente') ? '' : 'none';
  if (secCosto.style.display !== 'none') {
    document.getElementById('modal-costo').value      = '';
    document.getElementById('modal-notas-mtt').value  = s.notasMtt || '';
    const radioSi  = document.getElementById('modal-activable-si');
    const radioNo  = document.getElementById('modal-activable-no');
    if (s.esActivable) { radioSi.checked = true; } else { radioNo.checked = true; }
  }

  const secAuth = document.getElementById('modal-auth-section');
  const gerenteCanDecide = CU.role === 'gerente' && ['Pendiente','Valorizada'].includes(s.estado);
  secAuth.style.display = gerenteCanDecide ? '' : 'none';
  if (gerenteCanDecide) {
    document.getElementById('modal-comentario-gerente').value = '';
    const avisoEl = document.getElementById('aviso-activable');
    avisoEl.style.display = s.esActivable ? 'flex' : 'none';
  }

  const secChange = document.getElementById('modal-change-section');
  secChange.style.display = (CU.role === 'gerente' && ['Autorizada','Postergada','Rechazada'].includes(s.estado)) ? '' : 'none';
  if (secChange.style.display !== 'none') {
    document.getElementById('modal-nuevo-estado').value        = s.estado;
    document.getElementById('modal-comentario-cambio').value   = '';
  }

  // Botón eliminar: autor si Pendiente, o admin siempre
  const canDelete = CU.role === 'admin' || (s.userId === CU.id && s.estado === 'Pendiente');
  const btnDel = document.getElementById('btn-eliminar-sol');
  btnDel.style.display = canDelete ? '' : 'none';

  document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  openSolId = null;
}

// Eliminar solicitud
document.getElementById('btn-eliminar-sol').addEventListener('click', async () => {
  const sol = DB.sols().find(s => s.id === openSolId);
  if (!sol) return;
  const confirmMsg = CU.role === 'admin'
    ? `¿Eliminar el requerimiento "${sol.titulo}" (${sol.ticket||'sin ticket'})?\nEsta acción no se puede deshacer.`
    : `¿Eliminar tu requerimiento "${sol.titulo}"?\nSolo puedes eliminarlo mientras esté Pendiente. Esta acción no se puede deshacer.`;
  if (!confirm(confirmMsg)) return;
  await fdb.collection('solicitudes').doc(openSolId).delete();
  closeModal();
  toast('Requerimiento eliminado correctamente.', 'ok');
  reRenderActive();
});

// Guardar costo
document.getElementById('btn-guardar-costo').addEventListener('click', async () => {
  const costo = parseFloat(document.getElementById('modal-costo').value);
  if (isNaN(costo) || costo < 0) { toast('Ingrese un costo válido.','err'); return; }
  const notas     = document.getElementById('modal-notas-mtt').value.trim();
  const activable = document.querySelector('input[name="activable"]:checked')?.value === 'si';
  await DB.updateSol(openSolId, {
    costo, notasMtt: notas, esActivable: activable,
    estado: 'Valorizada',
    valorizedAt: new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  });
  const msgActivable = activable ? ' · Marcado como ACTIVABLE (requerirá API o SIM).' : '';
  toast('Costo ingresado. Requerimiento enviado a autorización del Gerente de Planta.' + msgActivable, 'ok');
  closeModal();
  renderCostos();
});

// Decisiones gerente
async function decidir(decision) {
  const comentario = document.getElementById('modal-comentario-gerente').value.trim();
  const sol = DB.sols().find(s => s.id === openSolId);
  if (!sol) return;
  await DB.updateSol(openSolId, {
    estado:            decision,
    comentarioGerente: comentario,
    decidedAt:         new Date().toISOString(),
    updatedAt:         new Date().toISOString(),
  });
  toast(`Requerimiento ${decision.toLowerCase()} correctamente.`, decision==='Autorizada'?'ok':decision==='Rechazada'?'err':'warn');

  // Crear notificaciones para todos los usuarios de mantenimiento
  const mantenimientoUsers = DB.users().filter(u => u.role === 'mantenimiento');
  const iconos = { Autorizada:'✅', Postergada:'⏸️', Rechazada:'❌' };
  const msgs = {
    Autorizada: `Requerimiento ${sol.ticket||''} <strong>${esc(sol.titulo)}</strong> fue <strong>AUTORIZADO</strong> por Gerencia.${sol.esActivable ? ' Requiere gestión de <strong>API o SIM</strong>.' : ''}`,
    Postergada: `Requerimiento ${sol.ticket||''} <strong>${esc(sol.titulo)}</strong> fue <strong>POSTERGADO</strong> por Gerencia.`,
    Rechazada:  `Requerimiento ${sol.ticket||''} <strong>${esc(sol.titulo)}</strong> fue <strong>RECHAZADO</strong> por Gerencia.`,
  };
  const batch = fdb.batch();
  mantenimientoUsers.forEach(u => {
    const nid = uid();
    batch.set(fdb.collection('notificaciones').doc(nid), {
      id: nid, toUserId: u.id, toEmail: u.email,
      type: decision.toLowerCase(),
      icon: iconos[decision] || '🔔',
      message: msgs[decision] || `Requerimiento ${decision}`,
      solicitudId: sol.id,
      ticket: sol.ticket || '',
      titulo: sol.titulo,
      esActivable: !!sol.esActivable,
      read: false,
      createdAt: new Date().toISOString(),
    });
  });
  await batch.commit();

  if (decision === 'Autorizada' && sol.esActivable) {
    setTimeout(() => showAvisoActivable(sol), 400);
  }
  closeModal();
  renderAutorizacion();
}

function showAvisoActivable(sol) {
  const overlay = document.createElement('div');
  overlay.className = 'aviso-activable-modal';
  overlay.innerHTML = `
    <div class="aam-box">
      <div class="aam-header">
        <span class="aam-icon">🔧</span>
        <h3>Requerimiento Activable — Acción Requerida</h3>
      </div>
      <div class="aam-body">
        <p>El requerimiento <strong>${esc(sol.ticket)}</strong> — <em>${esc(sol.titulo)}</em> fue <span class="badge badge-Autorizada">Autorizado</span></p>
        <p style="margin-top:10px">Este requerimiento fue marcado como <strong>ACTIVABLE</strong>. Mantenimiento debe gestionar el documento correspondiente:</p>
        <div class="aam-opciones">
          <div class="aam-opt aam-api">
            <span class="aam-opt-icon">📄</span>
            <div><strong>API</strong><small>Acta de Pedido Interno</small></div>
          </div>
          <div class="aam-opt aam-sim">
            <span class="aam-opt-icon">📋</span>
            <div><strong>SIM</strong><small>Solicitud de Inversión y Mantenimiento</small></div>
          </div>
        </div>
        <p class="aam-nota">Comuníquese con Mantenimiento para iniciar el proceso según el tipo de activable.</p>
      </div>
      <div class="aam-footer">
        <button class="btn-primary" id="aam-cerrar">Entendido</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('aam-cerrar').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

document.getElementById('btn-autorizar').addEventListener('click',  () => decidir('Autorizada'));
document.getElementById('btn-postergar').addEventListener('click',  () => decidir('Postergada'));
document.getElementById('btn-rechazar').addEventListener('click',   () => decidir('Rechazada'));

document.getElementById('btn-cambiar-estado').addEventListener('click', async () => {
  const nuevoEstado = document.getElementById('modal-nuevo-estado').value;
  const comentario  = document.getElementById('modal-comentario-cambio').value.trim();
  const sol = DB.sols().find(s => s.id === openSolId);
  if (!sol) return;
  await DB.updateSol(openSolId, {
    estado:            nuevoEstado,
    comentarioGerente: comentario || sol.comentarioGerente,
    updatedAt:         new Date().toISOString(),
  });
  toast('Estado actualizado.', 'ok');
  closeModal();
  renderRevision();
});

// ── GESTIÓN VISUAL ─────────────────────────────────────────
const AREA_LABELS = {
  A:'A) Producción', B:'B) Administración', C:'C) Calidad',
  D:'D) Personas', E:'E) Mantenimiento', F:'F) Despacho',
  G:'G) Planta de Rendering', H:'H) Excelencia Operacional'
};
const AREA_COLORS = ['#C8102E','#E8A838','#2563EB','#16A34A','#9333EA','#0891B2','#EA580C','#0D9488'];
const AREA_KEYS   = Object.keys(AREA_LABELS);

function renderVisual() {
  const sols = DB.sols();
  const counts = {}, costs = {};
  AREA_KEYS.forEach(k => { counts[k] = 0; costs[k] = 0; });
  sols.forEach(s => {
    if (counts[s.areaCode] !== undefined) {
      counts[s.areaCode]++;
      if (s.costo) costs[s.areaCode] += Number(s.costo);
    }
  });

  const labels  = AREA_KEYS.map(k => AREA_LABELS[k]);
  const cntData = AREA_KEYS.map(k => counts[k]);
  const costData= AREA_KEYS.map(k => costs[k]);

  if (chartCount) { chartCount.destroy(); chartCount = null; }
  if (chartCost)  { chartCost.destroy();  chartCost  = null; }

  const pieOpts = () => ({
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position:'right', labels:{ font:{family:'Montserrat',size:11}, boxWidth:14, padding:10 } },
      tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}` } },
    }
  });

  chartCount = new Chart(document.getElementById('chart-count'), {
    type: 'pie',
    data: { labels, datasets:[{ data:cntData, backgroundColor:AREA_COLORS, borderWidth:2, borderColor:'#fff' }] },
    options: { ...pieOpts(), plugins: { ...pieOpts().plugins, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} solicitudes` } } } }
  });

  chartCost = new Chart(document.getElementById('chart-cost'), {
    type: 'pie',
    data: { labels, datasets:[{ data:costData, backgroundColor:AREA_COLORS, borderWidth:2, borderColor:'#fff' }] },
    options: { ...pieOpts(), plugins: { ...pieOpts().plugins, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${clp(ctx.parsed)}` } } } }
  });

  const rows = AREA_KEYS.map((k,i) => `
    <tr>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${AREA_COLORS[i]};margin-right:6px"></span>${AREA_LABELS[k]}</td>
      <td class="num">${counts[k]}</td>
      <td class="num">${costs[k] > 0 ? clp(costs[k]) : '—'}</td>
      <td>${counts[k] > 0 ? Math.round(costs[k]/counts[k]).toLocaleString('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}) : '—'}</td>
    </tr>`).join('');

  const totalCount = Object.values(counts).reduce((a,b)=>a+b,0);
  const totalCost  = Object.values(costs).reduce((a,b)=>a+b,0);

  document.getElementById('visual-table').innerHTML = `
    <table class="visual-table">
      <thead>
        <tr><th>Área</th><th>N° Solicitudes</th><th>Costo Total</th><th>Costo Promedio</th></tr>
      </thead>
      <tbody>
        ${rows}
        <tr style="border-top:2px solid var(--gray-border);font-weight:700">
          <td>TOTAL</td>
          <td class="num">${totalCount}</td>
          <td class="num">${totalCost > 0 ? clp(totalCost) : '—'}</td>
          <td>—</td>
        </tr>
      </tbody>
    </table>`;
}

// ── MODAL AGREGAR USUARIO (admin) ────────────────────────
document.getElementById('btn-nuevo-usuario').addEventListener('click', () => {
  document.getElementById('form-nuevo-user').reset();
  document.getElementById('nu-error').textContent = '';
  document.getElementById('modal-nuevo-user-overlay').style.display = 'flex';
});
document.getElementById('modal-nuevo-user-close').addEventListener('click', () => {
  document.getElementById('modal-nuevo-user-overlay').style.display = 'none';
});
document.getElementById('modal-nuevo-user-overlay').addEventListener('click', e => {
  if (e.target.id === 'modal-nuevo-user-overlay')
    document.getElementById('modal-nuevo-user-overlay').style.display = 'none';
});
document.getElementById('form-nuevo-user').addEventListener('submit', async e => {
  e.preventDefault();
  const name  = document.getElementById('nu-name').value.trim();
  const email = document.getElementById('nu-email').value.trim().toLowerCase();
  const pass  = document.getElementById('nu-pass').value;
  const title = document.getElementById('nu-title').value.trim();
  const role  = document.getElementById('nu-role').value;
  const area  = document.getElementById('nu-area').value;
  const errEl = document.getElementById('nu-error');

  if (!role) { errEl.textContent = 'Seleccione el rol del usuario.'; return; }
  if (!area) { errEl.textContent = 'Seleccione el área del usuario.'; return; }
  if (DB.users().find(u => u.email.toLowerCase() === email)) {
    errEl.textContent = 'Ya existe un usuario con ese correo.'; return;
  }
  errEl.textContent = '';
  const [areaCode, areaGroup, areaSub] = area.split('|');
  const newUser = {
    id: uid(), name, email, password: pass, role,
    areaCode, areaGroup, areaSub, title,
    createdAt: new Date().toISOString()
  };
  await DB.addUser(newUser);
  document.getElementById('modal-nuevo-user-overlay').style.display = 'none';
  toast(`Usuario ${name} creado correctamente.`, 'ok');
  renderAdminPanel();
});

// ── NOTIFICACIONES ────────────────────────────────────────
function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  const btn   = document.getElementById('btn-notif');
  if (!badge || !btn) return;
  const count = _cache.notifs.length;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function openNotifPanel() {
  const panel  = document.getElementById('notif-panel');
  const list   = document.getElementById('notif-list');
  if (!panel || !list) return;

  // toggle
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }

  const notifs = _cache.notifs.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  list.innerHTML = notifs.length
    ? notifs.map(n => `
        <div class="notif-item${n.esActivable ? ' notif-activable' : ''}">
          <div class="notif-icon">${n.icon||'🔔'}</div>
          <div class="notif-body">
            <div class="notif-msg">${n.message}</div>
            <div class="notif-time">${fmt(n.createdAt)}</div>
          </div>
          <button class="notif-mark-read" data-docid="${n.docId}" title="Marcar como leído">✕</button>
        </div>`).join('')
    : '<p class="notif-empty">Sin notificaciones nuevas.</p>';

  list.querySelectorAll('.notif-mark-read').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await fdb.collection('notificaciones').doc(btn.dataset.docid).update({ read: true });
    });
  });

  panel.style.display = 'block';

  // Cerrar al hacer clic fuera
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!document.getElementById('notif-wrap').contains(e.target)) {
        panel.style.display = 'none';
        document.removeEventListener('click', handler);
      }
    });
  }, 0);
}

async function markAllNotifsRead() {
  const batch = fdb.batch();
  _cache.notifs.forEach(n => {
    batch.update(fdb.collection('notificaciones').doc(n.docId), { read: true });
  });
  await batch.commit();
  document.getElementById('notif-panel').style.display = 'none';
}

// ── PANEL ADMINISTRACIÓN (solo admin) ─────────────────────
const ROLE_LABELS = {
  user:         'Usuario',
  jefe_area:    'Jefe de Área',
  mantenimiento:'Mantenimiento',
  supervisor:   'Supervisora Admin.',
  gerente:      'Gerente de Planta',
  admin:        'Administrador',
};

function renderAdminPanel() {
  if (CU.role !== 'admin') return;
  const q     = (document.getElementById('admin-search')?.value || '').toLowerCase();
  let users   = DB.users().filter(u => u.id !== CU.id); // no mostrarse a sí mismo
  if (q) users = users.filter(u =>
    [u.name, u.email, u.areaGroup, ROLE_LABELS[u.role]||u.role].some(f => String(f||'').toLowerCase().includes(q))
  );
  users.sort((a,b) => a.name.localeCompare(b.name, 'es'));

  const roleOptions = Object.entries(ROLE_LABELS)
    .filter(([k]) => k !== 'admin')
    .map(([k,v]) => `<option value="${k}">${v}</option>`).join('');

  const rows = users.map(u => `
    <tr>
      <td>
        <div class="admin-user-name">${esc(u.name)}</div>
        <div class="admin-user-email">${esc(u.email)}</div>
      </td>
      <td>${esc(u.areaGroup||'—')}</td>
      <td>
        <select class="admin-role-select" data-uid="${u.id}">
          ${Object.entries(ROLE_LABELS).map(([k,v]) =>
            `<option value="${k}"${u.role===k?' selected':''}>${v}</option>`
          ).join('')}
        </select>
      </td>
      <td style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-admin-save" data-uid="${u.id}">Guardar rol</button>
        <button class="btn-admin-reset-pass" data-uid="${u.id}" data-name="${esc(u.name)}" title="Resetear contraseña">🔑 Reset clave</button>
        <button class="btn-admin-delete" data-uid="${u.id}" data-name="${esc(u.name)}" title="Eliminar usuario">🗑️ Eliminar</button>
      </td>
    </tr>`).join('');

  document.getElementById('admin-tabla').innerHTML = users.length
    ? `<table class="admin-table">
        <thead><tr><th>Usuario</th><th>Área</th><th>Rol</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
       </table>`
    : '<p class="empty-msg">No se encontraron usuarios.</p>';

  // Eventos guardar rol
  document.querySelectorAll('.btn-admin-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid    = btn.dataset.uid;
      const select = document.querySelector(`.admin-role-select[data-uid="${uid}"]`);
      const newRole= select.value;
      const user   = DB.users().find(u => u.id === uid);
      if (!user) return;
      if (newRole === user.role) { toast('El rol ya es ese, no hay cambios.', ''); return; }
      btn.disabled = true; btn.textContent = '...';
      await fdb.collection('users').doc(uid).update({ role: newRole });
      toast(`Rol de ${user.name} actualizado a: ${ROLE_LABELS[newRole]||newRole}`, 'ok');
      btn.disabled = false; btn.textContent = 'Guardar rol';
    });
  });

  // Eventos eliminar usuario
  document.querySelectorAll('.btn-admin-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId   = btn.dataset.uid;
      const userName = btn.dataset.name;
      if (!confirm(`¿Está seguro que desea eliminar al usuario "${userName}"?\nEsta acción no se puede deshacer.`)) return;
      btn.disabled = true; btn.textContent = '...';
      await fdb.collection('users').doc(userId).delete();
      toast(`Usuario ${userName} eliminado correctamente.`, 'ok');
      renderAdminPanel();
    });
  });

  // Eventos resetear contraseña
  document.querySelectorAll('.btn-admin-reset-pass').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId   = btn.dataset.uid;
      const userName = btn.dataset.name;
      const nuevaClave = prompt(`Nueva contraseña para ${userName}:\n(Mínimo 6 caracteres)`);
      if (nuevaClave === null) return; // canceló
      if (nuevaClave.length < 6) { toast('La contraseña debe tener al menos 6 caracteres.', 'err'); return; }
      await fdb.collection('users').doc(userId).update({ password: nuevaClave });
      toast(`Contraseña de ${userName} restablecida correctamente.`, 'ok');
    });
  });
}
