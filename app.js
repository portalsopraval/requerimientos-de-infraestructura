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
const fdb    = firebase.firestore();
const fauth  = firebase.auth();

// ── EmailJS Init ───────────────────────────────────────────
emailjs.init('1r8XDNUiPNKGswq3W');

function sendEmail(toEmail, mensaje, ticket, area, prioridad) {
  // Quitar HTML tags del mensaje para el email
  const mensajePlano = mensaje.replace(/<[^>]*>/g, '');
  emailjs.send('service_xcfs28z', 'template_hnkmwy9', {
    to_email: toEmail,
    mensaje:  mensajePlano,
    ticket:   ticket || '',
    area:     area   || '',
    prioridad:prioridad || '',
  }).catch(err => console.warn('EmailJS error:', err));
}

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
    { email:'cmadridp@sopraval.cl',     name:'Cristobal Madrid',  role:'mantenimiento', areaCode:'E', areaGroup:'Mantenimiento', areaSub:'Planificación de Mtto. y Proyectos', title:'Técnico de Mantenimiento' },
    { email:'gzapata@sopraval.cl',      name:'Gonzalo Zapata',    role:'mantenimiento', areaCode:'E', areaGroup:'Mantenimiento', areaSub:'Planificación de Mtto. y Proyectos', title:'Técnico de Mantenimiento' },
    { email:'ccrojas@sopraval.cl',      name:'Cristian Rojas',    role:'mantenimiento', areaCode:'E', areaGroup:'Mantenimiento', areaSub:'Planificación de Mtto. y Proyectos', title:'Técnico de Mantenimiento' },
    { email:'cllopez@sopraval.cl',      name:'Claudio Lopez',     role:'mantenimiento', areaCode:'E', areaGroup:'Mantenimiento', areaSub:'Planificación de Mtto. y Proyectos', title:'Técnico de Mantenimiento' },
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
let chartTendencia = null, chartRankingAreas = null, chartComparativo = null;
let _activeTab = null;

// ── Paginación ─────────────────────────────────────────────
const PAGE_SIZE = 20;
const _pag = { mis:1, costos:1, revision:1, autorizacion:1 };

function pagSlice(arr, page) {
  return arr.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
}
function pagHTML(total, page, tabKey) {
  if (total <= PAGE_SIZE) return '';
  const pages = Math.ceil(total / PAGE_SIZE);
  return `<div class="pag-controls">
    <button onclick="_pag['${tabKey}']=${page-1};reRenderActive()" ${page<=1?'disabled':''}>← Anterior</button>
    <span class="pag-info">Página ${page} de ${pages}</span>
    <span style="color:var(--gray);font-size:.8rem">${total} resultados</span>
    <button onclick="_pag['${tabKey}']=${page+1};reRenderActive()" ${page>=pages?'disabled':''}>Siguiente →</button>
  </div>`;
}

// ── Modo oscuro ─────────────────────────────────────────────
function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  document.getElementById('btn-dark-mode').textContent = isDark ? '🌙' : '☀️';
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
}
// Restaurar tema al cargar
(function() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
})();

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
  if (_activeTab === 'home')           renderHome();
  if (_activeTab === 'mis')            renderMis();
  if (_activeTab === 'costos')         renderCostos();
  if (_activeTab === 'revision')       renderRevision();
  if (_activeTab === 'autorizacion')   renderAutorizacion();
  if (_activeTab === 'visual')         renderVisual();
  if (_activeTab === 'adminpanel')     renderAdminPanel();
  if (_activeTab === 'kpis')           renderKPIs();
  if (_activeTab === 'dashboard-ger')  renderDashboardGer();
  if (_activeTab === 'dashboard-mtt')  renderDashboardMtt();
  if (_activeTab === 'activables')     renderActivables();
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
// La sesión persiste automáticamente vía Firebase Auth.
// Los datos se cargan solo cuando hay usuario autenticado.

async function loadDataAndStart() {
  const [usersSnap, solsSnap] = await Promise.all([
    fdb.collection('users').get(),
    fdb.collection('solicitudes').get(),
  ]);
  _cache.users = usersSnap.docs.map(d => d.data());
  _cache.sols  = solsSnap.docs.map(d => d.data());

  await seedUsers();
  const usersSnap2 = await fdb.collection('users').get();
  _cache.users = usersSnap2.docs.map(d => d.data());

  startListeners();
}

// Punto de entrada: escucha el estado de autenticación Firebase
fauth.onAuthStateChanged(async (firebaseUser) => {
  if (firebaseUser) {
    try {
      await loadDataAndStart();
      const perfil = _cache.users.find(u => u.email.toLowerCase() === firebaseUser.email.toLowerCase());
      if (!perfil) {
        // Cuenta Auth sin perfil Firestore → cerrar sesión
        await fauth.signOut();
        showScreen('login');
        return;
      }
      CU = perfil;
      initDashboard();
      showScreen('dashboard');
      backfillNotificaciones().catch(console.error);
    } catch (err) {
      console.error('Error cargando datos:', err);
      showScreen('login');
    }
  } else {
    showScreen('login');
  }
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

// ── Tabs ───────────────────────────────────────────────────
const TABS = {
  user:         [['home','🏠 Inicio'],['nueva','Nueva Solicitud'],['mis','Mis Solicitudes']],
  jefe_area:    [['home','🏠 Inicio'],['nueva','Nueva Solicitud'],['mis','Mis Solicitudes'],['revision','Revisión de Solicitudes']],
  mantenimiento:[['home','🏠 Inicio'],['dashboard-mtt','📊 Dashboard'],['nueva','Nueva Solicitud'],['mis','Mis Solicitudes'],['costos','Gestión de Costos'],['revision','Revisión de Solicitudes'],['activables','🔧 Activables'],['visual','Gestión Visual']],
  supervisor:   [['home','🏠 Inicio'],['nueva','Nueva Solicitud'],['mis','Mis Solicitudes'],['revision','Revisión de Solicitudes'],['visual','Gestión Visual']],
  gerente:      [['home','🏠 Inicio'],['dashboard-ger','📊 Mi Dashboard'],['autorizacion','Autorización Pendiente'],['revision','Revisión de Solicitudes'],['visual','Gestión Visual']],
  admin:        [['revision','Revisión de Solicitudes'],['visual','Gestión Visual'],['kpis','📊 KPIs'],['adminpanel','⚙️ Gestión de Usuarios']],
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
  if (id === 'home')           renderHome();
  if (id === 'mis')            renderMis();
  if (id === 'costos')         renderCostos();
  if (id === 'revision')       renderRevision();
  if (id === 'autorizacion')   renderAutorizacion();
  if (id === 'visual')         renderVisual();
  if (id === 'adminpanel')     renderAdminPanel();
  if (id === 'kpis')           renderKPIs();
  if (id === 'dashboard-ger')  renderDashboardGer();
  if (id === 'dashboard-mtt')  renderDashboardMtt();
  if (id === 'activables')     renderActivables();
}

// ── Login ──────────────────────────────────────────────────
document.getElementById('go-register').addEventListener('click',          e => { e.preventDefault(); showScreen('register'); });
document.getElementById('go-login').addEventListener('click',             e => { e.preventDefault(); showScreen('login'); });
document.getElementById('go-recover').addEventListener('click',           e => { e.preventDefault(); resetRecoverForm(); showScreen('recover'); });
document.getElementById('go-login-from-recover').addEventListener('click',e => { e.preventDefault(); showScreen('login'); });

document.getElementById('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const email  = document.getElementById('login-email').value.trim().toLowerCase();
  const pass   = document.getElementById('login-pass').value;
  const errEl  = document.getElementById('login-error');
  const btnLogin = e.target.querySelector('button[type="submit"]');
  errEl.textContent = '';
  btnLogin.disabled = true;
  btnLogin.textContent = 'Ingresando...';

  try {
    await fauth.signInWithEmailAndPassword(email, pass);
    // onAuthStateChanged se encarga del resto
  } catch (authErr) {
    if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/wrong-password') {
      // Intentar migración automática: buscar en Firestore con contraseña en texto
      try {
        await loadDataAndStart(); // cargar cache si está vacío
      } catch(_) {}
      const firestoreUser = _cache.users.find(u =>
        u.email.toLowerCase() === email && u.password === pass
      );
      if (firestoreUser) {
        try {
          // Crear cuenta Firebase Auth para este usuario (migración transparente)
          await fauth.createUserWithEmailAndPassword(email, pass);
          // Eliminar la contraseña en texto del perfil Firestore
          await fdb.collection('users').doc(firestoreUser.id).update({
            password: firebase.firestore.FieldValue.delete()
          });
          // onAuthStateChanged se encarga de continuar
        } catch (createErr) {
          errEl.textContent = 'Error al migrar cuenta. Contacte al administrador.';
          console.error('Error migración:', createErr);
        }
      } else {
        errEl.textContent = 'Correo o contraseña incorrectos.';
      }
    } else if (authErr.code === 'auth/too-many-requests') {
      errEl.textContent = 'Demasiados intentos. Espere unos minutos o recupere su contraseña.';
    } else {
      errEl.textContent = 'Error al iniciar sesión. Intente nuevamente.';
      console.error(authErr);
    }
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = 'Ingresar al sistema';
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  CU = null; _activeTab = null; chartCount = null; chartCost = null;
  document.getElementById('form-login').reset();
  await fauth.signOut();
  // onAuthStateChanged mostrará el login automáticamente
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
  const btn      = e.target.querySelector('button[type="submit"]');
  if (nueva.length < 6)   { errEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.'; return; }
  if (nueva !== confirma) { errEl.textContent = 'Las contraseñas no coinciden.'; return; }
  errEl.textContent = '';
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    // Re-autenticar antes de cambiar contraseña (requisito Firebase)
    const credential = firebase.auth.EmailAuthProvider.credential(CU.email, actual);
    await fauth.currentUser.reauthenticateWithCredential(credential);
    await fauth.currentUser.updatePassword(nueva);
    document.getElementById('modal-pass-overlay').style.display = 'none';
    toast('Contraseña actualizada correctamente.', 'ok');
  } catch (err) {
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      errEl.textContent = 'La contraseña actual es incorrecta.';
    } else {
      errEl.textContent = 'Error al cambiar contraseña. Intente nuevamente.';
      console.error(err);
    }
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar nueva contraseña';
  }
});

// ── Recuperar contraseña (pantalla login) ─────────────────
function resetRecoverForm() {
  document.getElementById('form-recover').reset();
  document.getElementById('rec-error').textContent = '';
  document.getElementById('rec-ok').style.display = 'none';
  document.getElementById('rec-btn').textContent = 'Enviar correo de recuperación';
}

document.getElementById('form-recover').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('rec-error');
  const okEl  = document.getElementById('rec-ok');
  const btn   = document.getElementById('rec-btn');
  errEl.textContent = ''; okEl.style.display = 'none';

  const email = document.getElementById('rec-email').value.trim().toLowerCase();
  btn.disabled = true; btn.textContent = 'Enviando...';
  try {
    await fauth.sendPasswordResetEmail(email);
    okEl.textContent = `Se envió un correo de recuperación a ${email}. Revise su bandeja de entrada (y la carpeta de spam).`;
    okEl.style.display = 'block';
    btn.textContent = 'Correo enviado ✓';
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      errEl.textContent = 'No existe ninguna cuenta con ese correo.';
    } else {
      errEl.textContent = 'Error al enviar el correo. Intente nuevamente.';
      console.error(err);
    }
    btn.disabled = false;
    btn.textContent = 'Enviar correo de recuperación';
  }
});

// ── Registro ───────────────────────────────────────────────
document.getElementById('form-register').addEventListener('submit', async e => {
  e.preventDefault();
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const pass  = document.getElementById('reg-pass').value;
  const area  = document.getElementById('reg-area').value;
  const errEl = document.getElementById('reg-error');
  const btn   = e.target.querySelector('button[type="submit"]');
  if (!area) { errEl.textContent = 'Seleccione su área de trabajo.'; return; }
  errEl.textContent = '';
  btn.disabled = true; btn.textContent = 'Creando cuenta...';
  try {
    await fauth.createUserWithEmailAndPassword(email, pass);
    const [areaCode, areaGroup, areaSub] = area.split('|');
    const newUser = {
      id: uid(), name, email, role: 'user',
      areaCode, areaGroup, areaSub, title: '',
      createdAt: new Date().toISOString()
      // sin campo password — Firebase Auth gestiona las credenciales
    };
    await DB.addUser(newUser);
    // onAuthStateChanged detecta la sesión y entra al dashboard automáticamente
    document.getElementById('form-register').reset();
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      errEl.textContent = 'Ese correo ya está registrado.';
    } else if (err.code === 'auth/weak-password') {
      errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.';
    } else {
      errEl.textContent = 'Error al crear la cuenta. Intente nuevamente.';
      console.error(err);
    }
    btn.disabled = false; btn.textContent = 'Crear cuenta';
  }
});

// ── Dashboard init ─────────────────────────────────────────
function initDashboard() {
  document.getElementById('nav-avatar').textContent = initials(CU.name);
  document.getElementById('nav-name').textContent   = CU.name;
  document.getElementById('nav-area').textContent   = CU.title || CU.areaGroup || '';
  // Sincronizar ícono modo oscuro
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.getElementById('btn-dark-mode').textContent = isDark ? '☀️' : '🌙';

  // Botón de notificaciones: visible para TODOS los roles
  const btnNotif = document.getElementById('btn-notif');
  btnNotif.style.display = 'flex';
  fdb.collection('notificaciones')
    .where('toUserId', '==', CU.id)
    .onSnapshot(snap => {
      _cache.notifs = snap.docs.map(d => ({ docId: d.id, ...d.data() })).filter(n => !n.read);
      updateNotifBadge();
    });

  buildTabs();
}

// ── NUEVA SOLICITUD ────────────────────────────────────────
let fotosBase64 = []; // array de hasta 3 imágenes comprimidas

// Compresión de imagen vía canvas (max 1200px, JPEG 72%)
function compressImage(file, maxW = 1200, quality = 0.72) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderFotosPreview() {
  const grid = document.getElementById('fotos-preview-grid');
  if (!fotosBase64.length) { grid.style.display = 'none'; grid.innerHTML = ''; return; }
  grid.style.display = 'grid';
  grid.innerHTML = fotosBase64.map((b64, i) => `
    <div class="foto-thumb-wrap">
      <img src="${b64}" class="foto-thumb" alt="Foto ${i+1}" />
      <button type="button" class="foto-thumb-remove" data-idx="${i}" title="Quitar foto">✕</button>
      <span class="foto-thumb-num">${i+1}</span>
    </div>`).join('');
  grid.querySelectorAll('.foto-thumb-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      fotosBase64.splice(parseInt(btn.dataset.idx), 1);
      fotoInput.value = '';
      renderFotosPreview();
      document.getElementById('file-name-display').textContent = fotosBase64.length
        ? `${fotosBase64.length} foto${fotosBase64.length > 1 ? 's' : ''} adjunta${fotosBase64.length > 1 ? 's' : ''}`
        : 'Haga clic o arrastre imágenes aquí';
    });
  });
}

const fotoInput = document.getElementById('sol-foto');
fotoInput.addEventListener('change', async () => {
  const files = Array.from(fotoInput.files);
  if (!files.length) return;
  const disponibles = 3 - fotosBase64.length;
  if (disponibles <= 0) { toast('Máximo 3 fotos por solicitud.', 'err'); fotoInput.value = ''; return; }
  const seleccionadas = files.slice(0, disponibles);
  if (files.length > disponibles) toast(`Solo se agregarán ${disponibles} foto${disponibles > 1 ? 's' : ''} (máximo 3).`, '');
  for (const file of seleccionadas) {
    if (file.size > 10 * 1024 * 1024) { toast(`"${file.name}" supera 10 MB.`, 'err'); continue; }
    const compressed = await compressImage(file);
    fotosBase64.push(compressed);
  }
  fotoInput.value = '';
  document.getElementById('file-name-display').textContent =
    `${fotosBase64.length} foto${fotosBase64.length > 1 ? 's' : ''} adjunta${fotosBase64.length > 1 ? 's' : ''}`;
  renderFotosPreview();
});

document.getElementById('btn-reset-sol').addEventListener('click', () => {
  fotosBase64 = [];
  fotoInput.value = '';
  renderFotosPreview();
  document.getElementById('file-name-display').textContent = 'Haga clic o arrastre imágenes aquí';
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

  if (!areaVal)          { err.textContent = 'Seleccione el área del requerimiento.'; return; }
  if (!motivo)           { err.textContent = 'Seleccione el motivo del requerimiento.'; return; }
  if (!prioridad)        { err.textContent = 'Seleccione la prioridad del requerimiento.'; return; }
  if (!fotosBase64.length) { err.textContent = 'Debe adjuntar al menos una fotografía de respaldo.'; return; }
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
    foto:  fotosBase64[0],         // compatibilidad hacia atrás
    fotos: [...fotosBase64],        // array completo
    estado: 'Pendiente',
    esActivable: false,
    costo: null,
    notasMtt: '',
    comentarioGerente: '',
    comentarios: [],
    historial: [{ fecha: new Date().toISOString(), usuario: CU.name, rol: CU.role, accion: 'Ingresada', detalle: `Prioridad: ${document.querySelector('input[name="prioridad"]:checked')?.value||''}`, tipo:'ok' }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    valorizedAt: null,
    decidedAt: null,
  };

  await DB.addSol(nueva);

  // Notificar a usuarios de mantenimiento y admin sobre la nueva solicitud
  const destinatarios = DB.users().filter(u =>
    ['mantenimiento', 'admin'].includes(u.role) && u.id !== CU.id
  );
  if (destinatarios.length > 0) {
    const batch = fdb.batch();
    const prioBadge = { Alta:'🔴', Media:'🟡', Baja:'🟢' };
    destinatarios.forEach(u => {
      const nid = uid();
      batch.set(fdb.collection('notificaciones').doc(nid), {
        id: nid,
        toUserId: u.id,
        toEmail: u.email,
        type: 'nueva',
        icon: '📋',
        message: `Nueva solicitud ${nueva.ticket} <strong>${esc(nueva.titulo)}</strong> ingresada por <strong>${esc(CU.name)}</strong> · ${nueva.areaGroup} ${prioBadge[nueva.prioridad]||''}`,
        solicitudId: nueva.id,
        ticket: nueva.ticket,
        titulo: nueva.titulo,
        esActivable: false,
        read: false,
        createdAt: nueva.createdAt,
      });
    });
    await batch.commit();
    // Enviar email a cada destinatario
    destinatarios.forEach(u => {
      sendEmail(
        u.email,
        `Nueva solicitud ${nueva.ticket} "${nueva.titulo}" ingresada por ${CU.name} · ${nueva.areaGroup}`,
        nueva.ticket, nueva.areaGroup, nueva.prioridad
      );
    });
  }

  toast('Requerimiento enviado correctamente. Mantenimiento revisará el costo estimado.','ok');
  document.getElementById('form-solicitud').reset();
  document.querySelectorAll('input[name="prioridad"]').forEach(r => r.checked = false);
  fotosBase64 = [];
  fotoInput.value = '';
  renderFotosPreview();
  document.getElementById('file-name-display').textContent = 'Haga clic o arrastre imágenes aquí';
});

// ── MIS SOLICITUDES ────────────────────────────────────────
document.getElementById('mis-search').addEventListener('input', renderMis);

function renderMis() {
  const q    = document.getElementById('mis-search').value.toLowerCase();
  let   sols = DB.sols().filter(s => s.userId === CU.id);
  if (q) sols = sols.filter(s => srch(s, q));
  sols.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  if (_pag.mis > Math.ceil(sols.length/PAGE_SIZE) || sols.length === 0) _pag.mis = 1;
  const page = pagSlice(sols, _pag.mis);
  const el = document.getElementById('mis-lista');
  el.innerHTML = sols.length
    ? `<div class="sol-list">${page.map(s => solCard(s)).join('')}</div>${pagHTML(sols.length,_pag.mis,'mis')}`
    : '<p class="empty-msg">No tiene solicitudes registradas aún.</p>';
  attachCards(el);
}

// ── GESTIÓN DE COSTOS (Mantenimiento) ─────────────────────
// Fescobara es coordinador: deriva solicitudes a técnicos
const esCoordinador = () => CU && CU.email === 'fescobara@sopraval.cl';

document.getElementById('costos-search').addEventListener('input', renderCostos);
document.getElementById('costos-filter-estado').addEventListener('change', renderCostos);

function renderCostos() {
  const q      = document.getElementById('costos-search').value.toLowerCase();
  const estado = document.getElementById('costos-filter-estado').value;
  let sols = DB.sols();

  if (esCoordinador()) {
    // Fescobara ve solicitudes Pendiente (para derivar)
    sols = sols.filter(s => s.estado === 'Pendiente');
  } else {
    // Técnicos ven solo solicitudes Derivada asignadas a ellos
    sols = sols.filter(s => s.estado === 'Derivada' && s.asignadoA?.id === CU.id);
  }

  if (estado) sols = sols.filter(s => s.estado === estado);
  if (q)      sols = sols.filter(s => srch(s, q));
  sols.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  if (_pag.costos > Math.ceil(sols.length/PAGE_SIZE) || sols.length === 0) _pag.costos = 1;
  const page = pagSlice(sols, _pag.costos);
  const el = document.getElementById('costos-lista');

  // Título dinámico según rol
  const titulo = document.getElementById('costos-titulo');
  if (titulo) titulo.textContent = esCoordinador() ? 'Solicitudes Pendientes — Derivar a Técnico' : 'Mis Solicitudes Asignadas — Ingresar Costo';

  el.innerHTML = sols.length
    ? `<div class="sol-list">${page.map(s => solCard(s, !esCoordinador())).join('')}</div>${pagHTML(sols.length,_pag.costos,'costos')}`
    : `<p class="empty-msg">${esCoordinador() ? 'No hay solicitudes pendientes de derivar.' : 'No tienes solicitudes asignadas.'}</p>`;
  attachCards(el);
}

// ── REVISIÓN DE SOLICITUDES ────────────────────────────────
['rev-search','rev-filter-area','rev-filter-estado','rev-filter-motivo','rev-filter-prioridad','rev-fecha-desde','rev-fecha-hasta'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener(id==='rev-search'?'input':'change', () => { _pag.revision=1; renderRevision(); });
});
document.getElementById('btn-rev-clear-dates').addEventListener('click', () => {
  document.getElementById('rev-fecha-desde').value = '';
  document.getElementById('rev-fecha-hasta').value = '';
  _pag.revision = 1; renderRevision();
});

function renderRevision() {
  const q        = document.getElementById('rev-search').value.toLowerCase();
  const area     = document.getElementById('rev-filter-area').value;
  const estado   = document.getElementById('rev-filter-estado').value;
  const motivo   = document.getElementById('rev-filter-motivo').value;
  const prioridad= document.getElementById('rev-filter-prioridad').value;
  const desde    = document.getElementById('rev-fecha-desde').value;
  const hasta    = document.getElementById('rev-fecha-hasta').value;

  let sols = DB.sols();
  if (CU.role === 'jefe_area') sols = sols.filter(s => s.areaCode === CU.areaCode);
  if (area)      sols = sols.filter(s => s.areaCode  === area);
  if (estado)    sols = sols.filter(s => s.estado    === estado);
  if (motivo)    sols = sols.filter(s => s.motivo    === motivo);
  if (prioridad) sols = sols.filter(s => s.prioridad === prioridad);
  if (desde)     sols = sols.filter(s => s.createdAt >= desde);
  if (hasta)     sols = sols.filter(s => s.createdAt <= hasta + 'T23:59:59');
  if (q)         sols = sols.filter(s => srch(s, q));
  sols.sort((a,b) => b.createdAt.localeCompare(a.createdAt));

  if (_pag.revision > Math.ceil(sols.length/PAGE_SIZE) || sols.length === 0) _pag.revision = 1;
  const page = pagSlice(sols, _pag.revision);
  document.getElementById('rev-stats').innerHTML = statsBar(sols);
  const el = document.getElementById('rev-lista');
  const showCost = ['mantenimiento','supervisor','gerente','admin'].includes(CU.role);
  el.innerHTML = sols.length
    ? `<div class="sol-list">${page.map(s => solCard(s, showCost)).join('')}</div>${pagHTML(sols.length,_pag.revision,'revision')}`
    : '<p class="empty-msg">No hay solicitudes que coincidan con los filtros.</p>';
  attachCards(el);
}

function statsBar(sols) {
  const cnt = (est) => sols.filter(s=>s.estado===est).length;
  const estados = ['Pendiente','Derivada','Valorizada','Autorizada','Postergada','Rechazada'];
  return `<div class="stats-bar">${estados.map(e=>
    `<div class="stat-pill"><span class="stat-n">${cnt(e)}</span>${e}</div>`
  ).join('')}<div class="stat-pill"><span class="stat-n">${sols.length}</span>Total</div></div>`;
}

// ── AUTORIZACIÓN (Gerente de Planta) ──────────────────────
function renderAutorizacion() {
  const sols = DB.sols().filter(s => s.estado === 'Valorizada').sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  document.getElementById('auth-stats').innerHTML = statsBar(DB.sols());
  if (_pag.autorizacion > Math.ceil(sols.length/PAGE_SIZE) || sols.length === 0) _pag.autorizacion = 1;
  const page = pagSlice(sols, _pag.autorizacion);
  const el = document.getElementById('auth-lista');
  el.innerHTML = sols.length
    ? `<div class="sol-list">${page.map(s => solCard(s, true)).join('')}</div>${pagHTML(sols.length,_pag.autorizacion,'autorizacion')}`
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
    ${(() => { const fs = s.fotos?.length ? s.fotos : (s.foto ? [s.foto] : []); return fs.length ? `<div class="detail-fotos-grid">${fs.map((f,i)=>`<div class="detail-foto-item"><img src="${f}" alt="Foto ${i+1}" class="foto-modal-thumb" /></div>`).join('')}</div>` : ''; })()}
  `;

  // Sección derivar (solo Fescobara, solicitudes Pendiente)
  const secDerivar = document.getElementById('modal-derivar-section');
  const mostrarDerivar = esCoordinador() && s.estado === 'Pendiente';
  secDerivar.style.display = mostrarDerivar ? '' : 'none';
  if (mostrarDerivar) {
    // Poblar dropdown de técnicos
    const tecnicos = DB.users().filter(u => u.role === 'mantenimiento' && u.email !== 'fescobara@sopraval.cl');
    const sel = document.getElementById('modal-tecnico-asignado');
    sel.innerHTML = '<option value="">— Seleccionar técnico —</option>' +
      tecnicos.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    document.getElementById('modal-activable-derivar-si').checked = false;
    document.getElementById('modal-activable-derivar-no').checked = true;
  }

  const secCosto = document.getElementById('modal-costo-section');
  const mostrarCosto = CU.role === 'mantenimiento' && !esCoordinador() && s.estado === 'Derivada' && s.asignadoA?.id === CU.id;
  secCosto.style.display = mostrarCosto ? '' : 'none';
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
  document.getElementById('btn-eliminar-sol').style.display = canDelete ? '' : 'none';

  // Historial
  const histEl = document.getElementById('modal-historial-section');
  const histList = document.getElementById('modal-historial-list');
  const hist = (s.historial || []).slice().sort((a,b) => a.fecha.localeCompare(b.fecha));
  if (hist.length > 0) {
    histEl.style.display = '';
    histList.innerHTML = hist.map(h => `
      <div class="historial-item">
        <div class="historial-dot dot-${h.tipo||'ok'}"></div>
        <div class="historial-body">
          <div class="historial-accion">${esc(h.accion)}</div>
          ${h.detalle ? `<div class="historial-detalle">${esc(h.detalle)}</div>` : ''}
          <div class="historial-meta">👤 ${esc(h.usuario)} · ${fmt(h.fecha)}</div>
        </div>
      </div>`).join('');
  } else {
    histEl.style.display = 'none';
  }

  // Comentarios
  const comsList = document.getElementById('modal-comentarios-list');
  const coms = (s.comentarios || []).slice().sort((a,b) => a.fecha.localeCompare(b.fecha));
  comsList.innerHTML = coms.length
    ? coms.map(c => `
        <div class="comentario-item">
          <div class="comentario-header">
            <span><span class="comentario-autor">${esc(c.userName)}</span><span class="comentario-rol">${ROLE_LABELS[c.userRole]||c.userRole||''}</span></span>
            <span class="comentario-fecha">${fmt(c.fecha)}</span>
          </div>
          <div class="comentario-texto">${esc(c.texto)}</div>
        </div>`).join('')
    : '<p style="font-size:.82rem;color:var(--gray);padding:4px 0">Sin comentarios aún.</p>';

  document.getElementById('comentario-texto').value = '';
  document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  openSolId = null;
}

// ── PDF individual por solicitud ───────────────────────────
document.getElementById('btn-pdf-sol').addEventListener('click', () => {
  const s = DB.sols().find(x => x.id === openSolId);
  if (!s) return;
  const fotos = s.fotos?.length ? s.fotos : (s.foto ? [s.foto] : []);
  const hist  = (s.historial||[]).slice().sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const w = window.open('', '_blank', 'width=900,height=700');
  w.document.write(`<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8"><title>${esc(s.ticket||'SOL')} – Portal Sopraval</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;padding:32px;color:#1a1a1a;font-size:13px}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #F07B1B;padding-bottom:12px;margin-bottom:20px}
h1{color:#1B3580;font-size:1rem}
.ticket{background:#1B3580;color:#fff;padding:3px 12px;border-radius:4px;font-size:.85rem;font-weight:700;white-space:nowrap}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:16px}
.lbl{font-size:.72rem;color:#777;text-transform:uppercase;letter-spacing:.4px;margin-bottom:1px}
.val{font-weight:600;font-size:.88rem}
.desc{background:#f5f5f5;padding:12px;border-radius:6px;margin-bottom:16px;line-height:1.6;font-size:.88rem}
.fotos{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.fotos img{max-height:200px;max-width:260px;border-radius:6px;border:1px solid #ddd;object-fit:cover}
.sect{font-weight:700;font-size:.8rem;color:#1B3580;margin:16px 0 8px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #ddd;padding-bottom:4px}
.hist{display:flex;gap:10px;padding:5px 0;font-size:.8rem;border-bottom:1px solid #f0f0f0}
.dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;margin-top:3px}
.dot-ok{background:#16a34a}.dot-warn{background:#d97706}.dot-err{background:#dc2626}
.footer{margin-top:24px;padding-top:12px;border-top:1px solid #ddd;font-size:.72rem;color:#aaa;text-align:center}
@media print{body{padding:16px}}
</style></head><body>
<div class="header">
  <div><h1>Portal de Requerimientos – Sopraval / Agrosuper</h1>
  <div style="margin-top:4px;font-size:.78rem;color:#777">Generado el ${new Date().toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric'})}</div></div>
  <div class="ticket">${esc(s.ticket||'—')}</div>
</div>
<h2 style="font-size:1rem;color:#1B3580;margin-bottom:16px">${esc(s.titulo)}</h2>
<div class="grid">
  <div><div class="lbl">Estado</div><div class="val">${s.estado}</div></div>
  <div><div class="lbl">Prioridad</div><div class="val">${s.prioridad||'—'}</div></div>
  <div><div class="lbl">Área</div><div class="val">${esc(s.areaGroup)} › ${esc(s.areaSub)}</div></div>
  <div><div class="lbl">Motivo</div><div class="val">${esc(s.motivo)}</div></div>
  <div><div class="lbl">Solicitante</div><div class="val">${esc(s.userName)}</div></div>
  <div><div class="lbl">Fecha solicitud</div><div class="val">${fmt(s.createdAt)}</div></div>
  <div><div class="lbl">Costo estimado</div><div class="val">${s.costo!=null?clp(s.costo):'Pendiente de valorización'}</div></div>
  ${s.decidedAt?`<div><div class="lbl">Fecha decisión</div><div class="val">${fmt(s.decidedAt)}</div></div>`:''}
</div>
${s.comentarioGerente?`<div class="desc"><strong>Comentario Gerencia:</strong> ${esc(s.comentarioGerente)}</div>`:''}
<div class="desc">${esc(s.descripcion)}</div>
${fotos.length?`<div class="sect">Fotografías de respaldo (${fotos.length})</div><div class="fotos">${fotos.map(f=>`<img src="${f}" />`).join('')}</div>`:''}
${hist.length?`<div class="sect">Historial de cambios</div>${hist.map(h=>`<div class="hist"><div class="dot dot-${h.tipo||'ok'}"></div><div><strong>${esc(h.accion)}</strong>${h.detalle?' · '+esc(h.detalle):''} <span style="color:#aaa">– ${esc(h.usuario||'')} · ${fmt(h.fecha)}</span></div></div>`).join('')}`:''}
<div class="footer">Portal de Requerimientos de Infraestructura · Sopraval / Agrosuper</div>
</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
});

// Agregar comentario
document.getElementById('btn-add-comentario').addEventListener('click', async () => {
  const texto = document.getElementById('comentario-texto').value.trim();
  if (!texto) { toast('Escriba un comentario antes de agregar.','err'); return; }
  const comentario = { id: uid(), userId: CU.id, userName: CU.name, userRole: CU.role, texto, fecha: new Date().toISOString() };
  await DB.updateSol(openSolId, {
    comentarios: firebase.firestore.FieldValue.arrayUnion(comentario)
  });
  document.getElementById('comentario-texto').value = '';
  // Re-render comentarios en modal
  const s = DB.sols().find(x => x.id === openSolId);
  if (s) {
    const coms = [...(s.comentarios||[]), comentario].sort((a,b)=>a.fecha.localeCompare(b.fecha));
    document.getElementById('modal-comentarios-list').innerHTML = coms.map(c => `
      <div class="comentario-item">
        <div class="comentario-header">
          <span><span class="comentario-autor">${esc(c.userName)}</span><span class="comentario-rol">${ROLE_LABELS[c.userRole]||''}</span></span>
          <span class="comentario-fecha">${fmt(c.fecha)}</span>
        </div>
        <div class="comentario-texto">${esc(c.texto)}</div>
      </div>`).join('');
  }
  toast('Comentario agregado.','ok');
});

// ── DERIVAR SOLICITUD (Fescobara → técnico) ───────────────
document.getElementById('btn-derivar-sol').addEventListener('click', async () => {
  const tecnicoId = document.getElementById('modal-tecnico-asignado').value;
  if (!tecnicoId) { toast('Selecciona una Jefatura para derivar la solicitud.', 'err'); return; }
  const activable = document.querySelector('input[name="activable-derivar"]:checked')?.value === 'si';
  const tecnico   = DB.users().find(u => u.id === tecnicoId);
  if (!tecnico) { toast('Técnico no encontrado.', 'err'); return; }
  const sol = DB.sols().find(s => s.id === openSolId);
  if (!sol) return;

  await DB.updateSol(openSolId, {
    estado:     'Derivada',
    esActivable: activable,
    asignadoA:  { id: tecnico.id, name: tecnico.name, email: tecnico.email },
    updatedAt:  new Date().toISOString(),
    historial:  firebase.firestore.FieldValue.arrayUnion({
      fecha: new Date().toISOString(), usuario: CU.name, rol: CU.role,
      accion: 'Derivada', detalle: `Asignada a ${tecnico.name}${activable ? ' · Activable' : ''}`, tipo:'ok'
    }),
  });

  // Notificar al técnico asignado
  const nid = uid();
  await fdb.collection('notificaciones').doc(nid).set({
    id: nid, toUserId: tecnico.id, toEmail: tecnico.email,
    type: 'derivada', icon: '📋',
    message: `Se te asignó la solicitud ${sol.ticket||''} <strong>${esc(sol.titulo)}</strong> para ingresar costo estimado.`,
    solicitudId: sol.id, ticket: sol.ticket||'', titulo: sol.titulo,
    esActivable: activable, read: false, createdAt: new Date().toISOString(),
  });
  sendEmail(
    tecnico.email,
    `Se te asignó la solicitud ${sol.ticket||''} "${sol.titulo}" para ingresar costo estimado.`,
    sol.ticket||'', sol.areaGroup||'', sol.prioridad||''
  );

  toast(`Solicitud derivada a ${tecnico.name} correctamente.`, 'ok');
  closeModal();
  renderCostos();
});

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
    historial: firebase.firestore.FieldValue.arrayUnion({
      fecha: new Date().toISOString(), usuario: CU.name, rol: CU.role,
      accion: 'Valorizada', detalle: `Costo: ${clp(costo)}${notas ? ' · '+notas : ''}${activable ? ' · Activable' : ''}`, tipo:'ok'
    }),
  });
  // Notificar al Gerente que hay una solicitud lista para autorizar
  const sol = DB.sols().find(s => s.id === openSolId);
  const gerenteUsers = DB.users().filter(u => u.role === 'gerente');
  if (sol && gerenteUsers.length > 0) {
    const batchGer = fdb.batch();
    gerenteUsers.forEach(u => {
      const nid = uid();
      batchGer.set(fdb.collection('notificaciones').doc(nid), {
        id: nid, toUserId: u.id, toEmail: u.email,
        type: 'valorizada', icon: '💰',
        message: `Solicitud ${sol.ticket||''} <strong>${esc(sol.titulo)}</strong> fue <strong>VALORIZADA</strong> con costo ${clp(costo)}. Pendiente de su autorización.`,
        solicitudId: openSolId, ticket: sol.ticket||'', titulo: sol.titulo,
        esActivable: !!activable, read: false, createdAt: new Date().toISOString(),
      });
    });
    await batchGer.commit();
    // Enviar email al gerente
    gerenteUsers.forEach(u => {
      sendEmail(
        u.email,
        `Solicitud ${sol.ticket||''} "${sol.titulo}" fue VALORIZADA y está pendiente de su autorización.`,
        sol.ticket||'', sol.areaGroup||'', sol.prioridad||''
      );
    });
  }

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
  const tipoHist = decision==='Autorizada'?'ok':decision==='Rechazada'?'err':'warn';
  await DB.updateSol(openSolId, {
    estado:            decision,
    comentarioGerente: comentario,
    decidedAt:         new Date().toISOString(),
    updatedAt:         new Date().toISOString(),
    historial: firebase.firestore.FieldValue.arrayUnion({
      fecha: new Date().toISOString(), usuario: CU.name, rol: CU.role,
      accion: decision, detalle: comentario || '', tipo: tipoHist
    }),
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
  // Enviar email a mantenimiento
  mantenimientoUsers.forEach(u => {
    sendEmail(u.email, msgs[decision] || `Requerimiento ${decision}`, sol.ticket||'', sol.areaGroup||'', sol.prioridad||'');
  });

  // Notificar al solicitante sobre la decisión
  const solicitante = DB.users().find(u => u.id === sol.userId);
  if (solicitante && solicitante.id !== CU.id) {
    const msgSol = {
      Autorizada: `Tu solicitud ${sol.ticket||''} <strong>${esc(sol.titulo)}</strong> fue <strong>AUTORIZADA</strong> por Gerencia. ✅`,
      Postergada: `Tu solicitud ${sol.ticket||''} <strong>${esc(sol.titulo)}</strong> fue <strong>POSTERGADA</strong> por Gerencia. ⏸️`,
      Rechazada:  `Tu solicitud ${sol.ticket||''} <strong>${esc(sol.titulo)}</strong> fue <strong>RECHAZADA</strong> por Gerencia. ❌`,
    };
    const nid = uid();
    await fdb.collection('notificaciones').doc(nid).set({
      id: nid, toUserId: solicitante.id, toEmail: solicitante.email,
      type: decision.toLowerCase(), icon: iconos[decision]||'🔔',
      message: msgSol[decision]||`Tu solicitud fue ${decision}`,
      solicitudId: sol.id, ticket: sol.ticket||'', titulo: sol.titulo,
      esActivable: false, read: false, createdAt: new Date().toISOString(),
    });
    // Enviar email al solicitante
    sendEmail(
      solicitante.email,
      msgSol[decision] || `Tu solicitud fue ${decision}`,
      sol.ticket||'', sol.areaGroup||'', sol.prioridad||''
    );
  }

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
    historial: firebase.firestore.FieldValue.arrayUnion({
      fecha: new Date().toISOString(), usuario: CU.name, rol: CU.role,
      accion: `Cambio a ${nuevoEstado}`, detalle: comentario || '', tipo:'warn'
    }),
  });
  toast('Estado actualizado.', 'ok');
  closeModal();
  renderRevision();
});

// ── HOME – RESUMEN GENERAL (todos los roles) ───────────────
function renderHome() {
  const sols = DB.sols();
  const total      = sols.length;
  const pendiente  = sols.filter(s => s.estado === 'Pendiente').length;
  const valorizada = sols.filter(s => s.estado === 'Valorizada').length;
  const autorizada = sols.filter(s => s.estado === 'Autorizada').length;
  const postergada = sols.filter(s => s.estado === 'Postergada').length;
  const rechazada  = sols.filter(s => s.estado === 'Rechazada').length;

  let recientes;
  if (['admin','mantenimiento','supervisor','gerente'].includes(CU.role)) {
    recientes = [...sols].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,5);
  } else if (CU.role === 'jefe_area') {
    recientes = sols.filter(s => s.areaCode === CU.areaCode).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,5);
  } else {
    recientes = sols.filter(s => s.userId === CU.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,5);
  }
  const showCost = ['mantenimiento','supervisor','gerente','admin'].includes(CU.role);

  const el = document.getElementById('home-content');
  el.innerHTML = `
    <div class="home-kpi-grid">
      <div class="home-kpi-card">
        <div class="home-kpi-icon">📋</div>
        <div class="home-kpi-value">${total}</div>
        <div class="home-kpi-label">Total solicitudes</div>
      </div>
      <div class="home-kpi-card hk-pendiente">
        <div class="home-kpi-icon">⏳</div>
        <div class="home-kpi-value">${pendiente}</div>
        <div class="home-kpi-label">Pendientes</div>
      </div>
      <div class="home-kpi-card hk-valorizada">
        <div class="home-kpi-icon">💰</div>
        <div class="home-kpi-value">${valorizada}</div>
        <div class="home-kpi-label">Valorizadas</div>
      </div>
      <div class="home-kpi-card hk-autorizada">
        <div class="home-kpi-icon">✅</div>
        <div class="home-kpi-value">${autorizada}</div>
        <div class="home-kpi-label">Autorizadas</div>
      </div>
      <div class="home-kpi-card hk-postergada">
        <div class="home-kpi-icon">⏸️</div>
        <div class="home-kpi-value">${postergada}</div>
        <div class="home-kpi-label">Postergadas</div>
      </div>
      <div class="home-kpi-card hk-rechazada">
        <div class="home-kpi-icon">❌</div>
        <div class="home-kpi-value">${rechazada}</div>
        <div class="home-kpi-label">Rechazadas</div>
      </div>
    </div>
    <div class="card" style="margin-top:24px">
      <h3 style="margin-bottom:14px;font-size:1rem;font-weight:700">📋 Solicitudes recientes</h3>
      ${recientes.length
        ? `<div class="sol-list">${recientes.map(s => solCard(s, showCost)).join('')}</div>`
        : '<p class="empty-msg">Sin solicitudes recientes.</p>'}
    </div>
    ${(() => {
      const pendPorArea = {};
      sols.filter(s => s.estado === 'Pendiente').forEach(s => {
        pendPorArea[s.areaGroup] = (pendPorArea[s.areaGroup]||0) + 1;
      });
      const saturadas = Object.entries(pendPorArea).filter(([,n]) => n >= 3).sort((a,b)=>b[1]-a[1]);
      if (!saturadas.length) return '';
      return `<div class="card saturacion-card" style="margin-top:20px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <span style="font-size:1.2rem">⚠️</span>
          <h3 style="font-size:.95rem;font-weight:700;color:#d97706">Áreas con alta acumulación de pendientes</h3>
        </div>
        <div class="saturacion-grid">
          ${saturadas.map(([area,n]) => `
            <div class="saturacion-item ${n >= 6 ? 'sat-alta' : n >= 4 ? 'sat-media' : 'sat-baja'}">
              <div class="sat-n">${n}</div>
              <div class="sat-area">${esc(area)}</div>
              <div class="sat-label">pendiente${n>1?'s':''}</div>
            </div>`).join('')}
        </div>
      </div>`;
    })()}`;
  attachCards(el);
}

// ── DASHBOARD GERENTE ───────────────────────────────────────
function renderDashboardGer() {
  const sols = DB.sols();
  const now  = new Date();

  const pendientes = sols.filter(s => ['Pendiente','Valorizada'].includes(s.estado))
    .sort((a,b) => a.createdAt.localeCompare(b.createdAt));

  const decididas  = sols.filter(s => ['Autorizada','Postergada','Rechazada'].includes(s.estado));
  const nAut = decididas.filter(s => s.estado === 'Autorizada').length;
  const nPos = decididas.filter(s => s.estado === 'Postergada').length;
  const nRec = decididas.filter(s => s.estado === 'Rechazada').length;
  const tasa = nAut + nPos + nRec > 0 ? Math.round(nAut / (nAut + nPos + nRec) * 100) : 0;

  const alta  = pendientes.filter(s => s.prioridad === 'Alta').length;
  const media = pendientes.filter(s => s.prioridad === 'Media').length;
  const baja  = pendientes.filter(s => s.prioridad === 'Baja').length;

  const diasEspera = iso => Math.floor((now - new Date(iso)) / (1000*60*60*24));

  const filas = pendientes.map(s => {
    const dias = diasEspera(s.createdAt);
    const clss = dias >= 7 ? 'dias-critico' : dias >= 3 ? 'dias-advertencia' : 'dias-ok';
    return `<tr class="fila-link" onclick="activateTab('autorizacion');setTimeout(()=>openModal('${s.id}'),80)">
      <td>${esc(s.ticket||'—')}</td>
      <td>${esc(s.titulo)}</td>
      <td>${esc(s.areaGroup)}</td>
      <td>${{Alta:'🔴 Alta',Media:'🟡 Media',Baja:'🟢 Baja'}[s.prioridad]||s.prioridad}</td>
      <td><span class="badge badge-${CSS.escape(s.estado)}">${s.estado}</span></td>
      <td><span class="${clss}">${dias} día${dias!==1?'s':''}</span></td>
    </tr>`;
  }).join('');

  document.getElementById('dash-ger-content').innerHTML = `
    <div class="dash-grid-2" style="margin-bottom:20px">
      <div class="card">
        <div class="dash-section-title">🚦 Pendientes por prioridad</div>
        <div class="semaforo-grid">
          <div class="semaforo-item sem-alta">
            <div class="sem-value">${alta}</div>
            <div class="sem-label">🔴 Alta</div>
          </div>
          <div class="semaforo-item sem-media">
            <div class="sem-value">${media}</div>
            <div class="sem-label">🟡 Media</div>
          </div>
          <div class="semaforo-item sem-baja">
            <div class="sem-value">${baja}</div>
            <div class="sem-label">🟢 Baja</div>
          </div>
        </div>
        <div class="dash-total-pill">${pendientes.length} total pendiente${pendientes.length!==1?'s':''}</div>
      </div>
      <div class="card">
        <div class="dash-section-title">📊 Mis decisiones históricas</div>
        <div class="decision-grid">
          <div class="decision-item dec-autorizada">
            <div class="dec-value">${nAut}</div>
            <div class="dec-label">Autorizadas</div>
          </div>
          <div class="decision-item dec-postergada">
            <div class="dec-value">${nPos}</div>
            <div class="dec-label">Postergadas</div>
          </div>
          <div class="decision-item dec-rechazada">
            <div class="dec-value">${nRec}</div>
            <div class="dec-label">Rechazadas</div>
          </div>
        </div>
        <div class="dash-tasa-pill">Tasa de aprobación: <strong>${tasa}%</strong></div>
      </div>
    </div>
    <div class="card">
      <div class="dash-section-title">⏳ Solicitudes pendientes de decisión</div>
      ${pendientes.length === 0
        ? '<p class="empty-msg" style="margin-top:12px">✅ No hay solicitudes pendientes.</p>'
        : `<div style="overflow-x:auto"><table class="kpi-table" style="margin-top:12px">
            <thead><tr><th>Ticket</th><th>Título</th><th>Área</th><th>Prioridad</th><th>Estado</th><th>Días esperando</th></tr></thead>
            <tbody>${filas}</tbody>
          </table></div>`}
    </div>`;
}

// ── DASHBOARD MANTENIMIENTO ─────────────────────────────────
function renderDashboardMtt() {
  const sols = DB.sols();
  const now       = new Date();
  const thisMon   = now.toISOString().slice(0,7);
  const thisYear  = String(now.getFullYear());

  const pendValorizar = sols.filter(s => s.estado === 'Pendiente').length;
  const valorizada    = sols.filter(s => s.estado === 'Valorizada').length;
  const autorizada    = sols.filter(s => s.estado === 'Autorizada').length;

  const costoMes   = sols.filter(s => s.costo!=null && s.createdAt.startsWith(thisMon)).reduce((a,s)=>a+Number(s.costo),0);
  const costoAnio  = sols.filter(s => s.costo!=null && s.createdAt.startsWith(thisYear)).reduce((a,s)=>a+Number(s.costo),0);
  const costoTotal = sols.filter(s => s.costo!=null).reduce((a,s)=>a+Number(s.costo),0);

  const conTiempo = sols.filter(s => s.valorizedAt && s.createdAt);
  const tiempoProm = conTiempo.length > 0
    ? (conTiempo.reduce((a,s) => a + (new Date(s.valorizedAt)-new Date(s.createdAt))/(1000*60*60*24), 0) / conTiempo.length).toFixed(1)
    : null;

  const activablesPend = sols.filter(s =>
    s.esActivable && s.estado === 'Autorizada' &&
    (!s.seguimientoActivable || s.seguimientoActivable === 'pendiente')
  );

  const filasAct = activablesPend.map(s => `
    <tr class="fila-link" onclick="activateTab('activables')">
      <td>${esc(s.ticket||'—')}</td>
      <td>${esc(s.titulo)}</td>
      <td>${esc(s.areaGroup)}</td>
      <td>${s.costo!=null?clp(s.costo):'—'}</td>
      <td><span class="badge badge-activable">⏳ Pendiente</span></td>
    </tr>`).join('');

  document.getElementById('dash-mtt-content').innerHTML = `
    <div class="home-kpi-grid" style="margin-bottom:20px">
      <div class="home-kpi-card hk-pendiente">
        <div class="home-kpi-icon">📥</div>
        <div class="home-kpi-value">${pendValorizar}</div>
        <div class="home-kpi-label">Por valorizar</div>
      </div>
      <div class="home-kpi-card hk-valorizada">
        <div class="home-kpi-icon">💲</div>
        <div class="home-kpi-value">${valorizada}</div>
        <div class="home-kpi-label">Valorizadas</div>
      </div>
      <div class="home-kpi-card hk-autorizada">
        <div class="home-kpi-icon">✅</div>
        <div class="home-kpi-value">${autorizada}</div>
        <div class="home-kpi-label">Autorizadas</div>
      </div>
      <div class="home-kpi-card" style="border-top:3px solid var(--orange)">
        <div class="home-kpi-icon">📅</div>
        <div class="home-kpi-value" style="font-size:1.05rem">${costoMes>0?clp(costoMes):'—'}</div>
        <div class="home-kpi-label">Costo este mes</div>
      </div>
      <div class="home-kpi-card" style="border-top:3px solid var(--blue)">
        <div class="home-kpi-icon">📆</div>
        <div class="home-kpi-value" style="font-size:1.05rem">${costoAnio>0?clp(costoAnio):'—'}</div>
        <div class="home-kpi-label">Costo este año</div>
      </div>
      <div class="home-kpi-card">
        <div class="home-kpi-icon">⏱️</div>
        <div class="home-kpi-value">${tiempoProm!=null?tiempoProm+' días':'—'}</div>
        <div class="home-kpi-label">Prom. valorización</div>
      </div>
    </div>
    <div class="card">
      <div class="dash-section-title">🔧 Activables pendientes de gestión</div>
      ${activablesPend.length === 0
        ? '<p class="empty-msg" style="margin-top:12px">✅ No hay activables pendientes.</p>'
        : `<div style="overflow-x:auto"><table class="kpi-table" style="margin-top:12px">
            <thead><tr><th>Ticket</th><th>Título</th><th>Área</th><th>Costo</th><th>Seguimiento</th></tr></thead>
            <tbody>${filasAct}</tbody>
          </table></div>`}
    </div>`;
}

// ── ACTIVABLES – SEGUIMIENTO ────────────────────────────────
const SEGUIMIENTO_LABELS = {
  pendiente:   '⏳ Pendiente',
  en_proceso:  '🔄 En proceso',
  api_emitida: '📄 API emitida',
  sim_emitida: '📋 SIM emitida',
  completado:  '✅ Completado',
};

function renderActivables() {
  const sols = DB.sols().filter(s => s.esActivable && s.estado === 'Autorizada')
    .sort((a,b) => (b.decidedAt||b.createdAt).localeCompare(a.decidedAt||a.createdAt));
  const canEdit = ['mantenimiento','admin'].includes(CU.role);

  const filas = sols.map(s => {
    const seg = s.seguimientoActivable || 'pendiente';
    const segHtml = canEdit
      ? `<select class="activable-seg-select filter-select" data-id="${s.id}" style="font-size:.8rem;padding:4px 8px">
          ${Object.entries(SEGUIMIENTO_LABELS).map(([k,v]) =>
            `<option value="${k}"${seg===k?' selected':''}>${v}</option>`
          ).join('')}
        </select>`
      : `<span class="badge">${SEGUIMIENTO_LABELS[seg]||seg}</span>`;
    const segClass = seg === 'completado' ? 'fila-completada' : '';
    return `<tr class="${segClass}">
      <td class="fila-link" onclick="openModal('${s.id}')">${esc(s.ticket||'—')}</td>
      <td class="fila-link" onclick="openModal('${s.id}')">${esc(s.titulo)}</td>
      <td class="fila-link" onclick="openModal('${s.id}')">${esc(s.areaGroup)}</td>
      <td class="fila-link" onclick="openModal('${s.id}')">${s.costo!=null?clp(s.costo):'—'}</td>
      <td class="fila-link" onclick="openModal('${s.id}')">${fmtD(s.decidedAt)}</td>
      <td>${segHtml}</td>
    </tr>`;
  }).join('');

  const el = document.getElementById('activables-content');
  el.innerHTML = sols.length === 0
    ? '<div class="card"><p class="empty-msg">No hay solicitudes activables autorizadas.</p></div>'
    : `<div class="card"><div style="overflow-x:auto">
        <table class="kpi-table activables-table" style="margin-top:4px">
          <thead><tr><th>Ticket</th><th>Título</th><th>Área</th><th>Costo</th><th>Fecha autorización</th><th>Seguimiento</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div></div>`;

  if (canEdit) {
    el.querySelectorAll('.activable-seg-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const solId  = sel.dataset.id;
        const newSeg = sel.value;
        await DB.updateSol(solId, {
          seguimientoActivable: newSeg,
          updatedAt: new Date().toISOString(),
        });
        toast(`Seguimiento: ${SEGUIMIENTO_LABELS[newSeg]}`, 'ok');
        if (newSeg === 'completado') {
          sel.closest('tr').classList.add('fila-completada');
        } else {
          sel.closest('tr').classList.remove('fila-completada');
        }
      });
    });
  }
}

// ── GESTIÓN VISUAL ─────────────────────────────────────────
const AREA_LABELS = {
  A:'Producción', B:'Administración', C:'Calidad',
  D:'Personas', E:'Mantenimiento', F:'Despacho',
  G:'Planta de Rendering', H:'Excelencia Operacional'
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
  const btn   = e.target.querySelector('button[type="submit"]');

  if (!role) { errEl.textContent = 'Seleccione el rol del usuario.'; return; }
  if (!area) { errEl.textContent = 'Seleccione el área del usuario.'; return; }
  if (DB.users().find(u => u.email.toLowerCase() === email)) {
    errEl.textContent = 'Ya existe un usuario con ese correo.'; return;
  }
  errEl.textContent = '';
  btn.disabled = true; btn.textContent = 'Creando...';

  try {
    // Crear cuenta Firebase Auth via REST API (no afecta la sesión actual del admin)
    const apiKey = firebaseConfig.apiKey;
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass, returnSecureToken: false })
      }
    );
    const data = await resp.json();
    if (data.error) {
      if (data.error.message === 'EMAIL_EXISTS') {
        errEl.textContent = 'Ya existe una cuenta Firebase Auth con ese correo.';
      } else {
        errEl.textContent = `Error Auth: ${data.error.message}`;
      }
      btn.disabled = false; btn.textContent = 'Crear usuario';
      return;
    }

    const [areaCode, areaGroup, areaSub] = area.split('|');
    const newUser = {
      id: uid(), name, email, role,
      areaCode, areaGroup, areaSub, title,
      createdAt: new Date().toISOString()
      // sin campo password
    };
    await DB.addUser(newUser);
    document.getElementById('modal-nuevo-user-overlay').style.display = 'none';
    toast(`Usuario ${name} creado correctamente.`, 'ok');
    renderAdminPanel();
  } catch (err) {
    errEl.textContent = 'Error de red al crear el usuario. Intente nuevamente.';
    console.error(err);
    btn.disabled = false; btn.textContent = 'Crear usuario';
  }
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
        <div class="notif-item${n.esActivable ? ' notif-activable' : ''} notif-clickable" data-solid="${n.solicitudId||''}" data-docid="${n.docId}">
          <div class="notif-icon">${n.icon||'🔔'}</div>
          <div class="notif-body">
            <div class="notif-msg">${n.message}</div>
            <div class="notif-time">${fmt(n.createdAt)}</div>
          </div>
          <button class="notif-mark-read" data-docid="${n.docId}" title="Marcar como leído">✕</button>
        </div>`).join('')
    : '<p class="notif-empty">Sin notificaciones nuevas.</p>';

  // Clic en notificación → abrir modal de la solicitud y marcarla como leída
  list.querySelectorAll('.notif-clickable').forEach(item => {
    item.addEventListener('click', async e => {
      if (e.target.classList.contains('notif-mark-read')) return; // no interceptar el ✕
      const solId  = item.dataset.solid;
      const docId  = item.dataset.docid;
      panel.style.display = 'none';
      if (solId) {
        // Marcar como leída al abrir
        fdb.collection('notificaciones').doc(docId).update({ read: true }).catch(console.error);
        // Navegar a la pestaña correcta según rol antes de abrir el modal
        const tabMap = {
          admin:         'revision',
          mantenimiento: 'costos',
          gerente:       'dashboard-ger',
          supervisor:    'revision',
          jefe_area:     'revision',
          user:          'mis',
        };
        const targetTab = tabMap[CU.role] || 'revision';
        activateTab(targetTab);
        // Pequeña espera para que el render de la pestaña termine
        setTimeout(() => openModal(solId), 80);
      }
    });
  });

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

// ── KPIs ADMIN ────────────────────────────────────────────
function renderKPIs() {
  if (CU.role !== 'admin') return;
  const sols = DB.sols();
  const total = sols.length;
  const pendiente  = sols.filter(s=>s.estado==='Pendiente').length;
  const valorizada = sols.filter(s=>s.estado==='Valorizada').length;
  const autorizada = sols.filter(s=>s.estado==='Autorizada').length;
  const postergada = sols.filter(s=>s.estado==='Postergada').length;
  const rechazada  = sols.filter(s=>s.estado==='Rechazada').length;
  const activables = sols.filter(s=>s.esActivable).length;
  const conCosto   = sols.filter(s=>s.costo!=null);
  const totalCosto = conCosto.reduce((a,s)=>a+Number(s.costo),0);
  const tasaAprobacion = autorizada+rechazada+postergada > 0
    ? Math.round(autorizada/(autorizada+rechazada+postergada)*100) : 0;

  // Tiempo promedio resolución (días)
  const resueltas = sols.filter(s=>s.decidedAt&&s.createdAt);
  const tiempoPromedio = resueltas.length > 0
    ? Math.round(resueltas.reduce((a,s)=>{
        const diff = (new Date(s.decidedAt)-new Date(s.createdAt))/(1000*60*60*24);
        return a+diff;
      },0)/resueltas.length)
    : null;

  // Por solicitante
  const porUser = {};
  sols.forEach(s=>{ porUser[s.userName]=(porUser[s.userName]||0)+1; });
  const topUsers = Object.entries(porUser).sort((a,b)=>b[1]-a[1]).slice(0,8);

  // Por área
  const porArea = {};
  sols.forEach(s=>{ const k=s.areaGroup||'Sin área'; porArea[k]=(porArea[k]||0)+1; });
  const topAreas = Object.entries(porArea).sort((a,b)=>b[1]-a[1]);

  document.getElementById('kpis-content').innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-value">${total}</div><div class="kpi-label">Total solicitudes</div></div>
      <div class="kpi-card"><div class="kpi-value" style="color:#d97706">${pendiente}</div><div class="kpi-label">Pendientes</div></div>
      <div class="kpi-card"><div class="kpi-value" style="color:#16a34a">${autorizada}</div><div class="kpi-label">Autorizadas</div></div>
      <div class="kpi-card"><div class="kpi-value" style="color:#dc2626">${rechazada}</div><div class="kpi-label">Rechazadas</div></div>
      <div class="kpi-card"><div class="kpi-value">${tasaAprobacion}%</div><div class="kpi-label">Tasa de aprobación</div><div class="kpi-sub">sobre decididas</div></div>
      <div class="kpi-card"><div class="kpi-value" style="color:var(--orange)">${activables}</div><div class="kpi-label">Activables</div></div>
      <div class="kpi-card"><div class="kpi-value" style="font-size:1.2rem">${totalCosto>0?clp(totalCosto):'—'}</div><div class="kpi-label">Costo total comprometido</div></div>
      <div class="kpi-card"><div class="kpi-value">${tiempoPromedio!=null?tiempoPromedio+' días':'—'}</div><div class="kpi-label">Tiempo prom. resolución</div></div>
    </div>
    <div class="card" style="margin-bottom:20px">
      <div class="kpi-section-title">Solicitudes por usuario</div>
      <table class="kpi-table">
        <thead><tr><th>Usuario</th><th>N° Solicitudes</th><th>%</th></tr></thead>
        <tbody>${topUsers.map(([name,cnt])=>`<tr><td>${esc(name)}</td><td>${cnt}</td><td>${total>0?Math.round(cnt/total*100):0}%</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="card">
      <div class="kpi-section-title">Solicitudes por área</div>
      <table class="kpi-table">
        <thead><tr><th>Área</th><th>N° Solicitudes</th><th>%</th></tr></thead>
        <tbody>${topAreas.map(([area,cnt])=>`<tr><td>${esc(area)}</td><td>${cnt}</td><td>${total>0?Math.round(cnt/total*100):0}%</td></tr>`).join('')}</tbody>
      </table>
    </div>

    <!-- #4 Tendencia mensual -->
    <div class="card" style="margin-bottom:20px">
      <div class="kpi-section-title">📈 Tendencia mensual (últimos 12 meses)</div>
      <div style="position:relative;height:260px;margin-top:12px">
        <canvas id="chart-tendencia"></canvas>
      </div>
    </div>

    <!-- #5 Ranking áreas por costo + #6 Resolución por área -->
    <div class="dash-grid-2" style="margin-bottom:20px">
      <div class="card">
        <div class="kpi-section-title">💰 Ranking áreas por costo acumulado</div>
        <div style="position:relative;height:280px;margin-top:12px">
          <canvas id="chart-ranking-areas"></canvas>
        </div>
      </div>
      <div class="card">
        <div class="kpi-section-title">🏁 Resolución por área</div>
        <table class="kpi-table" style="margin-top:12px">
          <thead><tr><th>Área</th><th>Prom. días</th><th>% Rechazadas</th></tr></thead>
          <tbody id="kpi-resolucion-body"></tbody>
        </table>
      </div>
    </div>

    <!-- #8 Comparativo anual -->
    <div class="card">
      <div class="kpi-section-title">📅 Comparativo anual</div>
      <div style="position:relative;height:260px;margin-top:12px">
        <canvas id="chart-comparativo"></canvas>
      </div>
    </div>`;

  // Destruir charts anteriores
  if (chartTendencia)    { chartTendencia.destroy();    chartTendencia    = null; }
  if (chartRankingAreas) { chartRankingAreas.destroy(); chartRankingAreas = null; }
  if (chartComparativo)  { chartComparativo.destroy();  chartComparativo  = null; }

  // #4 Tendencia mensual — últimos 12 meses
  const meses12 = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    meses12.push(d.toISOString().slice(0,7));
  }
  const tendData = meses12.map(m => sols.filter(s => s.createdAt.startsWith(m)).length);
  const tendLabels = meses12.map(m => {
    const [y,mo] = m.split('-');
    return ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(mo)-1] + ' ' + y.slice(2);
  });
  chartTendencia = new Chart(document.getElementById('chart-tendencia'), {
    type: 'line',
    data: {
      labels: tendLabels,
      datasets: [{
        label: 'Solicitudes ingresadas',
        data: tendData,
        borderColor: '#1B3580', backgroundColor: 'rgba(27,53,128,.1)',
        tension: 0.35, fill: true, pointRadius: 4, pointBackgroundColor: '#1B3580'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });

  // #5 Ranking áreas por costo — barra horizontal
  const costoPorArea = {};
  sols.forEach(s => { if (s.costo!=null) costoPorArea[s.areaGroup] = (costoPorArea[s.areaGroup]||0) + Number(s.costo); });
  const rankAreas  = Object.entries(costoPorArea).sort((a,b)=>b[1]-a[1]);
  chartRankingAreas = new Chart(document.getElementById('chart-ranking-areas'), {
    type: 'bar',
    data: {
      labels: rankAreas.map(([a]) => a),
      datasets: [{
        label: 'Costo CLP',
        data: rankAreas.map(([,c]) => c),
        backgroundColor: AREA_COLORS.slice(0, rankAreas.length),
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + clp(ctx.parsed.x) } }
      },
      scales: { x: { ticks: { callback: v => clp(v) } } }
    }
  });

  // #6 Resolución por área — tabla
  const resolucionPorArea = {};
  sols.forEach(s => {
    if (!resolucionPorArea[s.areaGroup]) resolucionPorArea[s.areaGroup] = { tiempos:[], total:0, rechazadas:0 };
    const r = resolucionPorArea[s.areaGroup];
    r.total++;
    if (s.estado === 'Rechazada') r.rechazadas++;
    if (s.decidedAt && s.createdAt) r.tiempos.push((new Date(s.decidedAt)-new Date(s.createdAt))/(1000*60*60*24));
  });
  document.getElementById('kpi-resolucion-body').innerHTML = Object.entries(resolucionPorArea)
    .sort((a,b)=>b[1].total-a[1].total)
    .map(([area, r]) => {
      const prom = r.tiempos.length > 0 ? (r.tiempos.reduce((a,b)=>a+b,0)/r.tiempos.length).toFixed(1) : '—';
      const pctRec = r.total > 0 ? Math.round(r.rechazadas/r.total*100) : 0;
      return `<tr><td>${esc(area)}</td><td>${prom!=='—'?prom+' días':'—'}</td><td>${pctRec}%</td></tr>`;
    }).join('');

  // #8 Comparativo anual — solicitudes por año
  const porAnio = {};
  sols.forEach(s => {
    const anio = s.createdAt.slice(0,4);
    porAnio[anio] = (porAnio[anio]||0) + 1;
  });
  const anios = Object.keys(porAnio).sort();
  chartComparativo = new Chart(document.getElementById('chart-comparativo'), {
    type: 'bar',
    data: {
      labels: anios,
      datasets: [
        { label: 'Ingresadas', data: anios.map(a=>porAnio[a]||0), backgroundColor: '#1B3580', borderRadius: 4 },
        { label: 'Autorizadas', data: anios.map(a=>sols.filter(s=>s.createdAt.startsWith(a)&&s.estado==='Autorizada').length), backgroundColor: '#16a34a', borderRadius: 4 },
        { label: 'Rechazadas',  data: anios.map(a=>sols.filter(s=>s.createdAt.startsWith(a)&&s.estado==='Rechazada').length),  backgroundColor: '#dc2626', borderRadius: 4 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

// ── EXPORTAR EXCEL / PDF ──────────────────────────────────
document.getElementById('btn-export-excel').addEventListener('click', () => {
  const sols = DB.sols();
  const rows = sols.map(s => ({
    'Ticket':      s.ticket||'',
    'Título':      s.titulo,
    'Área':        s.areaGroup,
    'Sub-área':    s.areaSub,
    'Motivo':      s.motivo,
    'Prioridad':   s.prioridad,
    'Estado':      s.estado,
    'Solicitante': s.userName,
    'Costo (CLP)': s.costo!=null?Number(s.costo):'',
    'Activable':   s.esActivable?'Sí':'No',
    'Fecha ingreso': fmtD(s.createdAt),
    'Fecha decisión': s.decidedAt?fmtD(s.decidedAt):'',
    'Comentario Gerencia': s.comentarioGerente||'',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Solicitudes');
  const today = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `solicitudes_sopraval_${today}.xlsx`);
  toast('Archivo Excel descargado.', 'ok');
});

document.getElementById('btn-export-pdf').addEventListener('click', () => {
  window.print();
});

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
        <button class="btn-admin-reset-pass" data-uid="${u.id}" data-name="${esc(u.name)}" data-email="${esc(u.email)}" title="Enviar correo de recuperación">🔑 Reset clave</button>
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

  // Eventos resetear contraseña (envía email de recuperación vía Firebase Auth)
  document.querySelectorAll('.btn-admin-reset-pass').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userEmail = btn.dataset.email;
      const userName  = btn.dataset.name;
      if (!confirm(`Se enviará un correo de recuperación de contraseña a:\n${userName} (${userEmail})\n\n¿Continuar?`)) return;
      btn.disabled = true;
      try {
        await fauth.sendPasswordResetEmail(userEmail);
        toast(`Correo de recuperación enviado a ${userName}.`, 'ok');
      } catch (err) {
        toast(`Error al enviar correo a ${userName}. Verifique que el usuario tenga cuenta activa.`, 'err');
        console.error(err);
      } finally {
        btn.disabled = false;
      }
    });
  });
}
