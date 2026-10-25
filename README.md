# ♟️ Модульные Шахматы (Modular Chess) — Desktop, Web & Mobile Edition

Современная шахматная платформа с открытым исходным кодом, объединяющая классические шахматные правила, глубокие нейросетевые модели (Deep Learning CNN), профессиональный движок Stockfish и высокопроизводительные вычисления на WebAssembly. Доступна как портативное Windows-приложение (Electron), адаптивное веб-приложение и мобильное приложение для Android (Capacitor).

![Chess Interface](https://via.placeholder.com/800x450?text=Modular+Chess+Platform)

---

## 🚀 Ключевые возможности

### 🧠 Нейросетевой искусственный интеллект (ModularChessNet V1.0 – V1.7)
- **Двухголовая сверточная архитектура (Two-Headed CNN)**:
  - **Policy Head**: прогнозирует вероятности ходов гроссмейстерского уровня (4672 UCI-выхода в современных версиях и 4096 в базовых).
  - **Value Head**: глубокая позиционная оценка вероятности победы в диапазоне от `-1.0` (победа черных) до `+1.0` (победа белых).
- **Линейка обученных моделей**:
  - `modular_chess_v1_7.onnx`: топовая модель с файн-тюнингом эндшпилей, оптимизированным значением функции потерь (Loss ~2.20) и максимальным рейтингом силы игры.
  - `modular_chess_v1_6.onnx`, `modular_chess_v1_5.onnx`, `modular_chess_v1.onnx`: предыдущие итерации архитектуры.
- **Алгоритмы поиска**:
  - **Alpha-Beta Search (Negamax)**: 4 секунды на обдумывание (`time_limit_ms=4000`), таблицы транспозиции (Transposition Table), сортировка ходов с учетом вероятностей нейросети (Neural Policy Priors), эвристики Killer Moves и History Heuristic, Late Move Reduction (LMR), форсированный поиск взятий (Quiescence Search) и **Lazy Evaluation** (отсечение до 50% вызовов ONNX при гарантированном выходе за пределы $\alpha$/$\beta$).
  - **MCTS (Monte Carlo Tree Search)**: 160 симуляций, формула PUCT ($c_{puct}=1.0$), First Play Urgency (FPU: `parent_q - 0.15`), обнаружение циклов и штраф за повторение ходов в выигрышных эндшпилях.
  - **5-Ply Minimax (Deep Search)**: параллельный пакетный инференс (Batched ONNX inference) кандидатов с маскированием легальных ходов.
- **Двойной рантайм**:
  - **Сервер / Python**: инференс на базе `onnxruntime` с оптимизациями CPU (`intra_op_num_threads = 2`, `ORT_SEQUENTIAL`).
  - **Браузер / Web**: прямой запуск моделей в браузере через `onnxruntime-web` с поддержкой многопоточного SIMD WebAssembly (`ort-wasm-simd-threaded.wasm`).

### 🐟 Интеграция со Stockfish
- Встроенный движок **Stockfish 19 (WebAssembly)** для игры на максимальной сложности без задержек.
- Поддержка нативного бинарного движка Stockfish на сервере для высокоточного послематчевого анализа.
- **Глубокая аналитика**:
  - Расчет **точности игры** (Accuracy %) для каждого хода и всей партии.
  - Классификация каждого хода: `!!` (Блестящий), `!` (Хороший), `?!` (Неточность), `?` (Ошибка), `??` (Зевок).

### ⚡ Ядро вычислений на WebAssembly (AssemblyScript)
- Критичные операции проверки атакованных полей (`isSquareAttacked`) и материальной оценки скомпилированы в `build/release.wasm`.
- Прямая работа с памятью без налога на границу JS-WASM (Boundary Tax Elimination) и нулевые аллокации (0 bytes GC allocations) во время вычислений.

### 🌐 Сетевой мультиплеер и WebRTC
- **Прямой P2P-канал (WebRTC Data Channels)**: минимальный пинг и прямая передача ходов между игроками.
- **Сверхбыстрая бинарная сериализация**: сжатие хода и таймеров всего в **15 байт** (вместо ~110 байт JSON) и состояния доски в **81 байт** (экономия трафика >80%).
- **Сигнальный сервер на порту 5000**: пересылка SDP-офферов и кандидатов с автоматическим определением локальных IP-адресов.
- Встроенный текстовый чат, эмодзи-реакции, предложения ничьей, сдача партии и автоматическое переподключение в течение 45 секунд.

### 📱 Кроссплатформенность и мобильный интерфейс (v2.5)
- **Desktop**: портативный исполняемый файл Windows (Portable EXE) на базе Electron.
- **Mobile (Android)**: сборка под Android через Capacitor (`npm run build:mobile`).
- **Drag-and-Drop & Touch**: управление фигурами как кликами, так и плавным перетаскиванием с масштабированием 1.2x и мягкой тенью. Защита от случайной прокрутки экрана на мобильных устройствах.
- **Адаптивный дизайн**: верстка на Tailwind CSS с динамическим масштабированием доски до 780px, темной и светлой темами (Glassmorphism), шрифтом Outfit.
- **Звуковая тема**: чистые звуковые эффекты Lichess SFX (ход, взятие, предупреждение о малом количестве времени).
- **Сохранения**: 3 независимых слота сохранений в LocalStorage, экспорт и импорт в JSON.

---

## 📋 Структура проекта

```text
├── android/                # Проект мобильного приложения Android (Capacitor)
├── assembly/               # Исходный код ядра на AssemblyScript (компилируется в WASM)
│   ├── index.ts            # Расчет атак и материальной оценки в WASM
│   └── tsconfig.json
├── build/                  # Скомпилированные файлы WebAssembly ядра
│   └── release.wasm        # Готовый бинарный файл release.wasm
├── css/                    # Стили интерфейса (Glassmorphism, Tailwind CSS)
├── images/                 # Графические ресурсы и ассеты
├── js/                     # Клиентская логика и модули ИИ
│   ├── ai_easy.js          # Легкий ИИ (Minimax, глубина 1)
│   ├── ai_medium.js        # Средний ИИ (Minimax + Alpha-Beta, глубина 2)
│   ├── ai_hard.js          # Сложный ИИ (Minimax + Alpha-Beta, PST, Quiescence)
│   ├── ai_very_hard.js     # Экстра-сложный ИИ (Iterative Deepening + History)
│   ├── ai_neural.js        # Клиентский модуль нейросетевого ИИ (ONNX WebAssembly)
│   ├── ai_unreal.js        # Адаптер интеграции Stockfish WASM
│   ├── analysis_manager.js # Менеджер послематчевого анализа и расчета точности
│   ├── logic.js            # Ядро правил шахмат и валидации FIDE
│   ├── transport_socket.js # WebRTC P2P транспорт и WebSocket-сигналинг
│   └── ui.js               # Отрисовка доски, drag-and-drop, таймеры и интерфейс
├── pieces/                 # Векторные SVG-фигуры
├── scripts/                # Скрипты нейросетевого инференса и бенчмарков
│   ├── neural_engine.py    # Серверный движок V1.7: Alpha-Beta (Negamax), MCTS, 5-Ply
│   ├── test_alphabeta.py   # Пакет тестов точности Alpha-Beta поиска (8/8 PASS)
│   ├── test_mcts.py        # Пакет тестов MCTS поиска (8/8 PASS)
│   ├── generate_book.js    # Генератор дебютной книги
│   └── generate_endgame.js # Генератор эндшпильных позиций
├── sounds/                 # Аудио-эффекты игры (Lichess SFX)
├── stockfish/              # Бинарные файлы и исходный код Stockfish
├── tests/                  # Модульные и интеграционные тесты (Jest)
├── colab_train_*.ipynb     # Ноутбуки Google Colab для обучения моделей V1.5 - V1.7
├── train_chess_engine*.py  # Скрипты обучения архитектуры PyTorch
├── modular_chess_v1_7.onnx # Основная обученная нейросетевая модель V1.7
├── build-mobile.js         # Скрипт подготовки и синхронизации Android-сборки
├── main.js                 # Главный процесс Electron
├── server.js               # Express + Socket.io сервер (порт 5000)
├── package.json            # Зависимости проекта и скрипты
└── README.md               # Документация проекта
```

---

## 🤖 Сравнение уровней сложности и движков

| Уровень / Режим | Алгоритм / Технология | Глубина | Особенности | Скорость отклика |
| :--- | :--- | :--- | :--- | :--- |
| **Easy** | Minimax | 1 полуход | Базовая материальная оценка | Мгновенно (<10 мс) |
| **Medium** | Minimax + Alpha-Beta | 2 полухода | Материальный баланс и позиционирование | < 100 мс |
| **Hard** | Minimax + Alpha-Beta + **WASM** | 3 полухода | PST, Quiescence Search, WASM-ядро | ~150 - 300 мс |
| **Extra Hard** | Iterative Deepening | 4+ полухода | History Heuristic, лимит времени 3.5 с | < 3500 мс |
| **Neural V1.7 (Alpha-Beta)** | **Two-Headed CNN + Negamax** | 4-6+ полуходов | Policy Priors, Transposition Table, Lazy Eval | Настраиваемая (4 сек) |
| **Neural V1.7 (MCTS)** | **Two-Headed CNN + MCTS** | 160 симуляций | PUCT, First Play Urgency, анти-повторения | ~1500 - 2500 мс |
| **Stockfish 19** | Stockfish WASM (NNUE) | 15+ полуходов | Профессиональный гроссмейстерский уровень | Настраиваемая |

---

## ⚡ Компиляция ядра WebAssembly (AssemblyScript)

Критичные вычисления (проверка битых полей и оценка материала) написаны на **AssemblyScript** (`assembly/index.ts`) и компилируются в нативный **WebAssembly**:

```bash
npx asc assembly/index.ts --target release
```

*Скомпилированный файл `release.wasm` сохраняется в директорию `build/`.*

---

## 🌐 Запуск игрового сервера и мультиплеера

Сервер обеспечивает WebSocket-сигналинг для WebRTC P2P-соединений, раздачу веб-клиента и инференс нейросетевого движка:

1. **Запуск сервера**:
   ```bash
   npm run server
   ```

   Сервер запускается на порту **5000** и автоматически выводит локальный и сетевой IP-адреса:
   ```text
   -----------------------------------
   Chess server is running!
   Local:   http://localhost:5000
   Network: http://192.168.0.106:5000
   -----------------------------------
   ```

2. **Подключение с телефона или других устройств**:
   Откройте в браузере адрес `http://<Network-IP>:5000` (например, `http://192.168.0.106:5000`).

---

## 📱 Сборка мобильного приложения (Android)

Проект интегрирован с фреймворком **Capacitor** для компиляции в нативное приложение Android:

1. Подготовка веб-ассетов и синхронизация:
   ```bash
   npm run build:mobile
   ```
2. Открытие проекта в Android Studio:
   ```bash
   npx cap open android
   ```
3. Сборка APK / AAB через Android Studio или Gradle:
   ```bash
   cd android && ./gradlew assembleDebug
   ```

---

## 🧪 Тестирование и контроль качества

В проекте реализована надежная система автоматизированного тестирования (217 тестов Jest, покрывающих логику правил FIDE, сетевые протоколы, интерфейс, точность и стабильность):

```bash
# Запуск полного набора тестов Jest
npm test

# Запуск с детальным отчетом о покрытии кода (Coverage)
npm test -- --coverage
```

### Бенчмарки нейросетевого движка (Python)

```bash
# Проверка Alpha-Beta поиска V1.7 (8 позиционных тестов FIDE)
python scripts/test_alphabeta.py

# Проверка MCTS поиска V1.7 (8 тестов симуляций)
python scripts/test_mcts.py
```

---

## ⌨️ Шпаргалка по командам (NPM Scripts)

| Команда | Назначение |
| :--- | :--- |
| `npm start` | Запуск десктопного приложения в режиме Electron |
| `npm run server` | Запуск игрового сервера на порту 5000 (`http://localhost:5000`) |
| `npm run dist` | Сборка портативного Windows EXE-файла в директорию `release/` |
| `npm test` | Запуск всех 217 модульных и интеграционных тестов Jest |
| `npm run build:css` | Компиляция и минификация стилей Tailwind CSS |
| `npm run build:mobile` | Подготовка и синхронизация ассетов с проектом Android Capacitor |

---

## 💻 Стек технологий

- **Клиент**: JavaScript (ES6+), AssemblyScript, HTML5 Canvas, Tailwind CSS v4.
- **Десктоп**: Electron, Electron-Builder.
- **Мобильные платформы**: Capacitor Android.
- **Нейросети и ML**: PyTorch, ONNX Runtime (`onnxruntime`, `onnxruntime-web`), WebAssembly SIMD.
- **Традиционный ИИ**: Stockfish 19 (WASM & Native), Minimax, Alpha-Beta, MCTS.
- **Сетевое взаимодействие**: WebRTC Data Channels, Socket.io, Express.
- **Тестирование**: Jest, Supertest.

---

## 📜 Лицензия

Проект распространяется с открытым исходным кодом.

---

Разработано при поддержке **Antigravity AI**.
