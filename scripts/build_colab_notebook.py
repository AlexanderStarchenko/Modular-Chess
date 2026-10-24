import json
import os

notebook = {
    "nbformat": 4,
    "nbformat_minor": 0,
    "metadata": {
        "colab": {
            "name": "Modular_Chess_AI_v1_Training.ipynb",
            "provenance": []
        },
        "accelerator": "GPU",
        "gpuClass": "standard",
        "language_info": {
            "name": "python"
        }
    },
    "cells": []
}

def add_md(text):
    notebook["cells"].append({
        "cell_type": "markdown",
        "metadata": {},
        "source": [line + "\n" for line in text.strip().split("\n")]
    })

def add_code(code):
    notebook["cells"].append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [line + "\n" for line in code.strip().split("\n")]
    })

add_md("""# ♟️ Modular Chess Engine V1 — Обучение нейросети с учителем Stockfish
Этот блокнот обучает **первую версию собственного шахматного ИИ (ModularChessNet-V1)** методом дистилляции знаний (**Supervised Learning / Knowledge Distillation**) от гроссмейстерского движка **Stockfish**.

### 🚀 Ключевые параметры:
* **Аппаратное ускорение**: GPU NVIDIA Tesla T4 (Google Colab).
* **Тензорные ядра (Tensor Cores)**: Включен режим смешанной точности FP16 (`torch.cuda.amp.autocast`) + масштабирование каналов и слоев (кратность 8/16/64/128).
* **Датасет**: 1 500 000 позиций с оценками и лучшими ходами Stockfish (Lichess Evaluations).
* **Эпохи**: 15 эпох.
* **Архитектура**: Dual-Head ResNet (Policy Head для предсказания лучшего хода + Value Head для позиционной оценки).
* **Экспорт**: Веса `.pt` и легковесный универсальный формат `.onnx` для встраивания в браузер/десктоп.

> **💡 Важно перед запуском**: Убедитесь, что в Google Colab включен T4 GPU:  
> Меню **Среда выполнения (Runtime)** ➔ **Сменить среду (Change runtime type)** ➔ **T4 GPU** ➔ **Сохранить**.""")

add_code("""# 1. Проверка GPU и доступности тензорных ядер (Tensor Cores)
import torch

print(f"PyTorch Version: {torch.__version__}")
if not torch.cuda.is_available():
    raise SystemError("⚠️ Внимание! GPU не обнаружен. Перейдите в меню: Среда выполнения -> Сменить среду -> выберите T4 GPU.")

device = torch.device("cuda")
gpu_name = torch.cuda.get_device_name(0)
capability = torch.cuda.get_device_capability(0)

print(f"✅ Используется GPU: {gpu_name}")
print(f"⚡ Compute Capability: {capability[0]}.{capability[1]}")

if capability[0] >= 7:
    print("🔥 Тензорные ядра (Tensor Cores) поддерживаются и будут задействованы (FP16 AMP)!")
else:
    print("ℹ️ Базовое ускорение CUDA.")

# Оптимизация автотюнинга сверток cuDNN под тензорные ядра
torch.backends.cudnn.benchmark = True""")

add_code("""# 2. Установка необходимых библиотек
!pip install -q python-chess pyarrow datasets tqdm onnx matplotlib
print("✅ Зависимости успешно установлены!")""")

add_code("""# 3. Подготовка датасета (1.5 млн позиций с учителем Stockfish)
import os
import urllib.request
import pyarrow.parquet as pq
import numpy as np
from tqdm.auto import tqdm

DATA_URL = "https://huggingface.co/datasets/Lichess/chess-position-evaluations/resolve/refs%2Fconvert%2Fparquet/default/train/0000.parquet"
PARQUET_FILE = "stockfish_evals_part0.parquet"
TARGET_SAMPLES = 1_500_000

if not os.path.exists(PARQUET_FILE):
    print("📥 Скачивание обучающей выборки Stockfish (около 2 ГБ, скорость сети Colab ~150-250 МБ/с)... займет около 15-20 секунд.")
    urllib.request.urlretrieve(DATA_URL, PARQUET_FILE)
    print("✅ Файл загружен!")
else:
    print("ℹ️ Файл датасета уже найден на диске.")""")

add_code("""# 4. Векторизация FEN и ходов в тензоры (16 каналов 8x8)
# Размерность каналов 16 кратна 8, что идеально нагружает тензорные ядра Turing T4!

PIECE_MAP = {
    'P': 0, 'N': 1, 'B': 2, 'R': 3, 'Q': 4, 'K': 5,
    'p': 6, 'n': 7, 'b': 8, 'r': 9, 'q': 10, 'k': 11
}

def fen_to_tensor_fast(fen: str) -> np.ndarray:
    \"\"\"Преобразует строку FEN в бинарный тензор 16x8x8\"\"\"
    planes = np.zeros((16, 8, 8), dtype=np.float32)
    parts = fen.split()
    board_str = parts[0]
    turn_str = parts[1] if len(parts) > 1 else 'w'
    castling_str = parts[2] if len(parts) > 2 else '-'
    
    r = 0
    c = 0
    for ch in board_str:
        if ch == '/':
            r += 1
            c = 0
        elif ch.isdigit():
            c += int(ch)
        else:
            p_idx = PIECE_MAP.get(ch)
            if p_idx is not None:
                planes[p_idx, r, c] = 1.0
            c += 1
            
    # Канал 12: Чей ход (1.0 белые, 0.0 черные)
    if turn_str == 'w':
        planes[12, :, :] = 1.0
        
    # Каналы 13-14: Рокировки
    if 'K' in castling_str: planes[13, 0:4, 0:4] = 1.0
    if 'Q' in castling_str: planes[13, 0:4, 4:8] = 1.0
    if 'k' in castling_str: planes[14, 4:8, 0:4] = 1.0
    if 'q' in castling_str: planes[14, 4:8, 4:8] = 1.0
    
    return planes

def uci_to_policy_idx(uci: str):
    \"\"\"Преобразует UCI ход (e2e4) в индекс класса (0..4095)\"\"\"
    if not uci or len(uci) < 4:
        return None
    from_c = ord(uci[0]) - 97
    from_r = 8 - int(uci[1])
    to_c = ord(uci[2]) - 97
    to_r = 8 - int(uci[3])
    if 0 <= from_r < 8 and 0 <= from_c < 8 and 0 <= to_r < 8 and 0 <= to_c < 8:
        return (from_r * 8 + from_c) * 64 + (to_r * 8 + to_c)
    return None

print("⚙️ Чтение и векторизация 1,500,000 позиций...")
parquet_file = pq.ParquetFile(PARQUET_FILE)

all_boards = np.zeros((TARGET_SAMPLES, 16, 8, 8), dtype=np.float32)
all_policies = np.zeros(TARGET_SAMPLES, dtype=np.int64)
all_values = np.zeros((TARGET_SAMPLES, 1), dtype=np.float32)

loaded = 0
pbar = tqdm(total=TARGET_SAMPLES, desc="Обработка позиций")

for batch in parquet_file.iter_batches(batch_size=32768, columns=['fen', 'line', 'cp', 'mate']):
    df = batch.to_pandas()
    for _, row in df.iterrows():
        line = row['line']
        if not line:
            continue
        first_move = line.split()[0]
        pol_idx = uci_to_policy_idx(first_move)
        if pol_idx is None:
            continue
            
        cp = row['cp']
        mate = row['mate']
        
        # Расчет оценки Value: от -1.0 до +1.0
        if mate is not None and not np.isnan(mate):
            val = 1.0 if mate > 0 else -1.0
        elif cp is not None and not np.isnan(cp):
            val = float(np.tanh(cp / 400.0))
        else:
            continue
            
        all_boards[loaded] = fen_to_tensor_fast(row['fen'])
        all_policies[loaded] = pol_idx
        all_values[loaded, 0] = val
        loaded += 1
        pbar.update(1)
        
        if loaded >= TARGET_SAMPLES:
            break
    if loaded >= TARGET_SAMPLES:
        break

pbar.close()
print(f"🎉 Успешно подготовлено {loaded:,} позиций в оперативной памяти!")""")

add_code("""# 5. Создание PyTorch Dataset и DataLoader с Pinned Memory
from torch.utils.data import TensorDataset, DataLoader

X_tensor = torch.from_numpy(all_boards[:loaded])
y_policy = torch.from_numpy(all_policies[:loaded])
y_value = torch.from_numpy(all_values[:loaded])

# Освобождаем память numpy
del all_boards, all_policies, all_values

dataset = TensorDataset(X_tensor, y_policy, y_value)

# Размер батча 1024 (кратен 64, оптимально для тензорных ядер)
BATCH_SIZE = 1024

train_loader = DataLoader(
    dataset,
    batch_size=BATCH_SIZE,
    shuffle=True,
    num_workers=2,
    pin_memory=True,
    drop_last=True
)

print(f"📦 Готово батчей на эпоху: {len(train_loader)} (размер батча: {BATCH_SIZE})")""")

add_code("""# 6. Архитектура нейросети ModularChessNet (Dual-Head ResNet)
import torch.nn as nn

class ResBlock(nn.Module):
    def __init__(self, channels=128):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, kernel_size=3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, kernel_size=3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x):
        return self.relu(x + self.bn2(self.conv2(self.relu(self.bn1(self.conv1(x))))))

class ModularChessNet(nn.Module):
    def __init__(self, num_res_blocks=6, channels=128):
        super().__init__()
        # Вход: 16 каналов 8x8
        self.in_conv = nn.Conv2d(16, channels, kernel_size=3, padding=1, bias=False)
        self.in_bn = nn.BatchNorm2d(channels)
        self.relu = nn.ReLU(inplace=True)
        
        # Резидуальный остов
        self.blocks = nn.ModuleList([ResBlock(channels) for _ in range(num_res_blocks)])
        
        # Policy Head (4096 возможных ходов: 64 поля откуда -> 64 поля куда)
        self.policy_conv = nn.Conv2d(channels, 2, kernel_size=1, bias=False)
        self.policy_bn = nn.BatchNorm2d(2)
        self.policy_fc = nn.Linear(2 * 8 * 8, 4096)
        
        # Value Head (оценка позиции от -1.0 до +1.0)
        self.value_conv = nn.Conv2d(channels, 1, kernel_size=1, bias=False)
        self.value_bn = nn.BatchNorm2d(1)
        self.value_fc1 = nn.Linear(1 * 8 * 8, 256)
        self.value_fc2 = nn.Linear(256, 1)

    def forward(self, x):
        out = self.relu(self.in_bn(self.in_conv(x)))
        for block in self.blocks:
            out = block(out)
            
        # Policy
        p = self.relu(self.policy_bn(self.policy_conv(out)))
        p = p.flatten(1)
        policy_logits = self.policy_fc(p)
        
        # Value
        v = self.relu(self.value_bn(self.value_conv(out)))
        v = v.flatten(1)
        v = self.relu(self.value_fc1(v))
        value = torch.tanh(self.value_fc2(v))
        
        return policy_logits, value

model = ModularChessNet(num_res_blocks=6, channels=128).to(device)
param_count = sum(p.numel() for p in model.parameters() if p.requires_grad)
print(f"🧠 Модель создана! Параметров: {param_count:,} (~{param_count/1e6:.2f}M)")""")

add_code("""# 7. Цикл обучения (15 эпох) с использованием Tensor Cores (FP16 AMP)
import time
import matplotlib.pyplot as plt

EPOCHS = 15
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)

policy_criterion = nn.CrossEntropyLoss()
value_criterion = nn.MSELoss()

# Активация автоматического масштабирования градиентов для тензорных ядер
scaler = torch.cuda.amp.GradScaler()

history = {'loss': [], 'policy_loss': [], 'value_loss': []}

print(f"🚀 Запуск обучения на {EPOCHS} эпох (1.5M позиций, GPU: {gpu_name})...")
start_time = time.time()

for epoch in range(1, EPOCHS + 1):
    model.train()
    total_loss_epoch = 0.0
    total_p_loss = 0.0
    total_v_loss = 0.0
    
    pbar = tqdm(train_loader, desc=f"Эпоха {epoch}/{EPOCHS}", leave=False)
    
    for boards, targets_p, targets_v in pbar:
        boards = boards.to(device, non_blocking=True)
        targets_p = targets_p.to(device, non_blocking=True)
        targets_v = targets_v.to(device, non_blocking=True)
        
        optimizer.zero_grad(set_to_none=True)
        
        # Включение тензорных ядер в режиме FP16 Autocast
        with torch.cuda.amp.autocast(dtype=torch.float16):
            pred_p, pred_v = model(boards)
            p_loss = policy_criterion(pred_p, targets_p)
            v_loss = value_criterion(pred_v, targets_v)
            loss = p_loss + 0.5 * v_loss
            
        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()
        
        total_loss_epoch += loss.item()
        total_p_loss += p_loss.item()
        total_v_loss += v_loss.item()
        pbar.set_postfix({'loss': f"{loss.item():.4f}", 'p_loss': f"{p_loss.item():.4f}", 'v_loss': f"{v_loss.item():.4f}"})
        
    scheduler.step()
    
    avg_loss = total_loss_epoch / len(train_loader)
    avg_p = total_p_loss / len(train_loader)
    avg_v = total_v_loss / len(train_loader)
    
    history['loss'].append(avg_loss)
    history['policy_loss'].append(avg_p)
    history['value_loss'].append(avg_v)
    
    print(f"📊 Эпоха {epoch:02d}/{EPOCHS} завершена | Loss: {avg_loss:.4f} (Policy: {avg_p:.4f}, Value: {avg_v:.4f}) | LR: {scheduler.get_last_lr()[0]:.6f}")

total_duration = time.time() - start_time
print(f"🎉 Обучение 15 эпох успешно завершено за {total_duration/60:.2f} минут!")

# Построение графика обучения
plt.figure(figsize=(10, 4))
plt.plot(range(1, EPOCHS+1), history['loss'], label='Total Loss', color='blue', lw=2)
plt.plot(range(1, EPOCHS+1), history['policy_loss'], label='Policy Loss', color='orange', linestyle='--')
plt.plot(range(1, EPOCHS+1), history['value_loss'], label='Value Loss', color='green', linestyle=':')
plt.xlabel('Эпоха')
plt.ylabel('Loss')
plt.title('Динамика обучения шахматной модели ModularChessNet-V1')
plt.grid(True, alpha=0.3)
plt.legend()
plt.show()""")

add_code("""# 8. Проверка игры модели прямо в блокноте!
import chess
from IPython.display import display

def select_best_move(board: chess.Board, model, device):
    \"\"\"Выбирает лучший легальный ход согласно обученной модели\"\"\"
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        return None, 0.0
        
    fen_tensor = fen_to_tensor_fast(board.fen())
    inp = torch.from_numpy(fen_tensor).unsqueeze(0).to(device)
    
    model.eval()
    with torch.no_grad():
        with torch.cuda.amp.autocast(dtype=torch.float16):
            policy_logits, value = model(inp)
            policy_probs = torch.softmax(policy_logits, dim=-1).squeeze(0).cpu().numpy()
            
    best_move = None
    best_score = -1e9
    
    for m in legal_moves:
        idx = uci_to_policy_idx(m.uci())
        score = policy_probs[idx] if idx is not None else 0.0
        if score > best_score:
            best_score = score
            best_move = m
            
    return best_move, float(value.squeeze().cpu().numpy())

test_board = chess.Board()
print("Начальная позиция:")
display(test_board)

move, pos_eval = select_best_move(test_board, model, device)
print(f"🤖 Оценка позиции моделью: {pos_eval:+.3f} (от -1.0 до +1.0)")
print(f"🤖 Рекомендованный ход: {move.uci()} ({test_board.san(move)})")
test_board.push(move)
display(test_board)""")

add_code("""# 9. Экспорт модели в PyTorch (.pt) и ONNX (.onnx)
model.eval()

# 1. Сохранение весов PyTorch
torch.save(model.state_dict(), "modular_chess_v1.pt")
print("✅ Веса сохранены: modular_chess_v1.pt")

# 2. Экспорт в формат ONNX для использования в JS/C++/Electron
dummy_input = torch.randn(1, 16, 8, 8, device=device)

torch.onnx.export(
    model,
    dummy_input,
    "modular_chess_v1.onnx",
    input_names=["board_state"],
    output_names=["policy_logits", "value"],
    dynamic_axes={
        "board_state": {0: "batch_size"},
        "policy_logits": {0: "batch_size"},
        "value": {0: "batch_size"}
    },
    opset_version=14
)
print("✅ Модель успешно экспортирована в ONNX: modular_chess_v1.onnx")

# Скачивание файла модели на ваш компьютер
try:
    from google.colab import files
    print("📥 Скачивание modular_chess_v1.onnx на компьютер...")
    files.download("modular_chess_v1.onnx")
    files.download("modular_chess_v1.pt")
except Exception as e:
    print("ℹ️ Файлы сохранены в проводнике файлов слева в Colab.")""")

output_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "colab_train_chess_engine.ipynb")
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(notebook, f, ensure_ascii=False, indent=2)

print(f"Successfully generated notebook at: {output_path}")
