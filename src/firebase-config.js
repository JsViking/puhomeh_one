// Конфиг веб-приложения Firebase. Где взять: Firebase Console → ⚙ Project settings →
// General → Your apps → (веб-приложение </>) → SDK setup and configuration → Config.
//
// Эти значения НЕ секретные — они всё равно видны в браузере любому игроку.
// Защищают базу правила Firestore из файла firestore.rules.
//
// Если поставить здесь null — рейтинг будет работать локально (в браузере игрока).
export const firebaseConfig = {
  apiKey: 'AIzaSyDa8P7QjLb5e7MobW1SG05Yq633xbRa__I',
  authDomain: 'puhomeh.firebaseapp.com',
  projectId: 'puhomeh',
  storageBucket: 'puhomeh.firebasestorage.app',
  messagingSenderId: '1092682476775',
  appId: '1:1092682476775:web:782f0578ae33b6c5de8642',
};
