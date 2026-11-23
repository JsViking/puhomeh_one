# Котики: приключения Пухомеха

Маленькая изометрическая игра в стиле старых японских 16-битных игр на чистом **WebGPU** — без движков,
без сборщика и без npm-зависимостей. Котик Пухомех бегает по городку, собирает еду и убегает от собак.

- Управление: WASD / стрелки, Пробел — мяу, N — ночь, M — музыка, C — CRT-эффект. На телефоне — джойстик пальцем.
- Нужен браузер с WebGPU: Chrome / Edge 113+, Chrome на Android 121+, Safari 26+.
- WebGPU работает только на `https://` или `http://localhost`.

## Запуск локально

```bash
python3 -m http.server 8765
```

Открыть http://localhost:8765. Подойдёт любой статический сервер (`npx serve -l 8765` и т.п.).

## Как устроено

| Файл | Что внутри |
|---|---|
| `src/gpu.js`, `src/shaders.wgsl.js` | WebGPU: устройство, пайплайны, инстансный рендер спрайтов, пост-обработка (CRT) |
| `src/raster.js`, `src/atlas.js` | Все спрайты рисуются кодом при старте и пакуются в одну текстуру-атлас |
| `src/map.js` | Карта городка ASCII-строками |
| `src/game.js`, `src/dog.js` | Логика: котик, еда, собаки с поиском пути, жизни |
| `src/scene.js` | Сборка кадра и сортировка по глубине для изометрии |
| `src/leaderboard.js`, `src/online.js` | Рейтинг: Firestore, а без него — localStorage |
| `src/audio.js` | Звуки и фоновая чиптюн-музыка на WebAudio |

## Онлайн-рейтинг на Firebase

Без настройки рейтинг локальный. Чтобы сделать общий:

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project** (Google Analytics не нужен).
2. **Build → Firestore Database → Create database** → регион (например, `eur3`) → **Start in production mode**.
3. **Firestore → Rules** → вставить содержимое `firestore.rules` → **Publish**.
4. **⚙ Project settings → General → Your apps → `</>` (Web)** → зарегистрировать приложение (Hosting не включать) →
   скопировать объект `firebaseConfig` в `src/firebase-config.js` вместо `null`.

Ключи из конфига не секретные — их видно в браузере любому игроку; базу защищают правила.
Дополнительно можно ограничить API-ключ доменом сайта: Google Cloud Console → APIs & Services → Credentials →
ключ → Application restrictions → Websites → `https://<логин>.github.io/*`.

> Честно: рейтинг в браузерной игре без своего сервера нельзя полностью защитить от подделки результата —
> правила отсекают мусор (имя до 12 символов, время 10–3600 с, только добавление), но не хитрого читера.

## Публикация на GitHub Pages

1. Создать на GitHub **публичный** репозиторий (на бесплатном тарифе Pages работает для публичных).
2. Отправить код:
   ```bash
   git remote add origin git@github.com:<логин>/<репозиторий>.git
   git push -u origin main
   ```
3. Репозиторий → **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   ветка `main`, папка `/ (root)` → **Save**.
4. Через минуту игра будет на `https://<логин>.github.io/<репозиторий>/`.
