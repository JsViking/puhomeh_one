// Конфиг веб-приложения Firebase. Где взять: Firebase Console → ⚙ Project settings →
// General → Your apps → (веб-приложение </>) → SDK setup and configuration → Config.
//
// Эти значения НЕ секретные — они всё равно видны в браузере любому игроку.
// Защищают базу правила Firestore из файла firestore.rules.
//
// Пока здесь null — рейтинг работает локально (в браузере игрока).
export const firebaseConfig = null;

/* Пример заполненного конфига:
export const firebaseConfig = {
  apiKey: 'AIza...',
  authDomain: 'my-cats-game.firebaseapp.com',
  projectId: 'my-cats-game',
  storageBucket: 'my-cats-game.appspot.com',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abcdef',
};
*/
