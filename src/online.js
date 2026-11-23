// Онлайн-рейтинг в Cloud Firestore. SDK Firebase грузится с CDN только если конфиг заполнен —
// без сборщика и npm, обычными ES-модулями.
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const COLLECTION = 'scores';
let ready = null;

export const enabled = () => !!firebaseConfig;

function connect() {
  ready ??= (async () => {
    const [{ initializeApp }, fs] = await Promise.all([
      import(`${SDK}firebase-app.js`),
      import(`${SDK}firebase-firestore.js`),
    ]);
    const app = initializeApp(firebaseConfig);
    return { fs, db: fs.getFirestore(app) };
  })();
  // Не удалось подключиться — в следующий раз попробуем заново
  ready.catch(() => { ready = null; });
  return ready;
}

export async function fetchTop(limit) {
  const { fs, db } = await connect();
  const q = fs.query(fs.collection(db, COLLECTION), fs.orderBy('time'), fs.limit(limit));
  const snap = await fs.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, name: String(d.data().name), time: Number(d.data().time) }));
}

// Формат документа строго совпадает с проверками в firestore.rules
export async function addScore(name, time) {
  const { fs, db } = await connect();
  const ref = await fs.addDoc(fs.collection(db, COLLECTION), { name, time, createdAt: fs.serverTimestamp() });
  return ref.id;
}
