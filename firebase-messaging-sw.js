// Service Worker — Portal Sopraval
// Habilita notificaciones push en background (FCM ready).
// Para activar push cuando el navegador está cerrado, configurar
// Firebase Cloud Messaging VAPID key en Firebase Console.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            'AIzaSyDLA0GPjLrWJIDoPjo9vXPmnJLnUi-9jMY',
  authDomain:        'portal-necesidades-la-calera.firebaseapp.com',
  projectId:         'portal-necesidades-la-calera',
  storageBucket:     'portal-necesidades-la-calera.firebasestorage.app',
  messagingSenderId: '945581573169',
  appId:             '1:945581573169:web:09dbd4804ca4acddaf0110',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const { title = 'Portal Sopraval', body = '' } = payload.notification || {};
  self.registration.showNotification(title, {
    body,
    icon: '/logo-sopraval.png',
    badge: '/logo-sopraval.png',
  });
});
