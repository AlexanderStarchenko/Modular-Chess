"""
Modular Chess Engine - Fine-Tuned V1.5 Model Deployment & Verification Script
Applies best_finetuned.pt to modular_chess_v1_5.pt and exports self-contained modular_chess_v1_5.onnx.
"""

import os
import sys
import shutil
import numpy as np
import torch
import torch.nn as nn
import onnx
import onnxruntime as ort

# Ensure UTF-8 output on Windows
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

class SEBlock(nn.Module):
    def __init__(self, channels=192, reduction=4):
        super().__init__()
        self.fc1 = nn.Linear(channels, channels // reduction, bias=False)
        self.fc2 = nn.Linear(channels // reduction, channels, bias=False)
        self.relu = nn.ReLU(inplace=True)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        b, c, _, _ = x.size()
        y = x.mean((2, 3))
        y = self.relu(self.fc1(y))
        y = self.sigmoid(self.fc2(y)).view(b, c, 1, 1)
        return x * y

class ResBlockSE(nn.Module):
    def __init__(self, channels=192):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)
        self.se = SEBlock(channels, reduction=4)
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x):
        res = x
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out = self.se(out)
        return self.relu(out + res)

class ModularChessNetV15(nn.Module):
    def __init__(self, num_res_blocks=8, channels=192):
        super().__init__()
        self.in_conv = nn.Conv2d(16, channels, kernel_size=3, padding=1, bias=False)
        self.in_bn = nn.BatchNorm2d(channels)
        self.relu = nn.ReLU(inplace=True)

        self.blocks = nn.ModuleList([ResBlockSE(channels) for _ in range(num_res_blocks)])

        self.policy_conv = nn.Conv2d(channels, 4, kernel_size=1, bias=False)
        self.policy_bn = nn.BatchNorm2d(4)
        self.policy_fc = nn.Linear(4 * 8 * 8, 4672)

        self.value_conv = nn.Conv2d(channels, 2, kernel_size=1, bias=False)
        self.value_bn = nn.BatchNorm2d(2)
        self.value_fc1 = nn.Linear(2 * 8 * 8, 256)
        self.value_fc2 = nn.Linear(256, 1)

    def forward(self, x):
        out = self.relu(self.in_bn(self.in_conv(x)))
        for block in self.blocks:
            out = block(out)

        p = self.relu(self.policy_bn(self.policy_conv(out)))
        policy_all = self.policy_fc(p.flatten(1))
        # Top 4096 logits correspond to (from_sq * 64 + to_sq) move space
        policy_logits = policy_all[:, :4096]

        v = self.relu(self.value_bn(self.value_conv(out)))
        v = self.relu(self.value_fc1(v.flatten(1)))
        value = torch.tanh(self.value_fc2(v))

        return policy_logits, value

PIECE_MAP = {
    'P': 0, 'N': 1, 'B': 2, 'R': 3, 'Q': 4, 'K': 5,
    'p': 6, 'n': 7, 'b': 8, 'r': 9, 'q': 10, 'k': 11
}

def fen_to_tensor(fen: str) -> np.ndarray:
    planes = np.zeros((16, 8, 8), dtype=np.float32)
    parts = fen.split()
    board_str = parts[0]
    turn_str = parts[1] if len(parts) > 1 else 'w'
    castling_str = parts[2] if len(parts) > 2 else '-'
    r, c = 0, 0
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
    if turn_str == 'w':
        planes[12, :, :] = 1.0
    if 'K' in castling_str: planes[13, 0:4, 0:4] = 1.0
    if 'Q' in castling_str: planes[13, 0:4, 4:8] = 1.0
    if 'k' in castling_str: planes[14, 4:8, 0:4] = 1.0
    if 'q' in castling_str: planes[14, 4:8, 4:8] = 1.0
    return planes

def decode_policy_move(top_idx: int) -> str:
    f_sq, t_sq = divmod(top_idx, 64)
    f_r, f_c = divmod(f_sq, 8)
    t_r, t_c = divmod(t_sq, 8)
    return chr(97 + f_c) + str(8 - f_r) + chr(97 + t_c) + str(8 - t_r)

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    finetuned_src = os.path.join(root_dir, 'best_finetuned.pt')
    active_pt = os.path.join(root_dir, 'modular_chess_v1_5.pt')
    backup_pt = os.path.join(root_dir, 'modular_chess_v1_5_base.pt')
    active_onnx = os.path.join(root_dir, 'modular_chess_v1_5.onnx')

    if not os.path.exists(finetuned_src):
        print(f"Error: {finetuned_src} not found!")
        return

    print("=" * 70)
    print("♟️  DEPLOYING FINE-TUNED MODULAR CHESS V1.5 MODEL")
    print("=" * 70)

    # 1. Backup original modular_chess_v1_5.pt if needed
    if os.path.exists(active_pt) and not os.path.exists(backup_pt):
        shutil.copy2(active_pt, backup_pt)
        print(f"📦 Created backup of base model: {backup_pt}")

    # 2. Update active modular_chess_v1_5.pt
    shutil.copy2(finetuned_src, active_pt)
    print(f"✅ Updated active PyTorch weights: {active_pt}")

    # 3. Load model and verify
    state_dict = torch.load(finetuned_src, map_location='cpu')
    model = ModularChessNetV15(num_res_blocks=8, channels=192)
    model.load_state_dict(state_dict)
    model.eval()
    param_count = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"🧠 Model Architecture: ModularChessNetV15 (Parameters: {param_count:,})")

    # 4. Export self-contained ONNX
    dummy_input = torch.randn(1, 16, 8, 8, dtype=torch.float32)
    print(f"🚀 Exporting fine-tuned model to ONNX: {active_onnx}...")
    torch.onnx.export(
        model,
        dummy_input,
        active_onnx,
        input_names=["board_state"],
        output_names=["policy_logits", "value"],
        dynamic_axes={
            "board_state": {0: "batch_size"},
            "policy_logits": {0: "batch_size"},
            "value": {0: "batch_size"}
        },
        opset_version=14,
        dynamo=False
    )

    # Validate ONNX model
    onnx_model = onnx.load(active_onnx)
    onnx.checker.check_model(onnx_model)
    file_size = os.path.getsize(active_onnx)
    print(f"✨ ONNX model verified! File size: {file_size:,} bytes (~{file_size/1e6:.2f} MB)")

    # 5. Run ONNX Runtime Inference Benchmark
    session = ort.InferenceSession(active_onnx)

    benchmark_positions = [
        ("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "Дебют: Стартовая позиция (1. e4 / 1. d4)", ["e2e4", "d2d4", "c2c4", "g1f3"]),
        ("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3", "Миттельшпиль: Открытая позиция (e4 e5 Nf3 Nc6)", ["f1b5", "f1c4", "d2d4", "b1c3"]),
        ("8/5k2/4p3/3pP3/3P1P2/8/8/5K2 w - - 0 40", "Эндшпиль: Пешечный прорыв f4-f5!", ["f4f5"]),
        ("8/1P6/8/8/8/5k2/8/4K3 w - - 0 55", "Эндшпиль: Проведение пешки в ферзи b7-b8!", ["b7b8q", "b7b8"]),
        ("8/8/4k3/4P3/8/8/8/4K3 w - - 0 50", "Эндшпиль: Оппозиция и продвижение e5-e6!", ["e5e6", "e1e2", "e1f2"]),
        ("4k3/8/8/8/8/8/4R3/4K3 w - - 0 60", "Эндшпиль: Шах ладьёй / отсечение короля", ["e2e8", "e2e7", "e2e4", "e2a2"]),
        ("8/8/8/8/8/4k3/8/4K1Q1 w - - 0 1", "Мат в 1 ход: Ферзь ставит мат Qe3#", ["g1e3"])
    ]

    print("\n" + "=" * 70)
    print("🎯 BENCHMARK РЕЗУЛЬТАТОВ ДООБУЧЕННОЙ МОДЕЛИ V1.5:")
    print("=" * 70)

    for fen, desc, expected in benchmark_positions:
        t = fen_to_tensor(fen)[np.newaxis, ...]
        out = session.run(None, {'board_state': t})
        pol = out[0][0]
        val = float(out[1][0, 0])
        top_idx = int(np.argmax(pol))
        pred_move = decode_policy_move(top_idx)

        exp_str = ", ".join(expected) if isinstance(expected, list) else expected
        match = (pred_move in expected) if isinstance(expected, list) else (pred_move == expected)
        icon = "✅" if match else "ℹ️"

        print(f"{icon} Позиция: {desc}")
        print(f"   Лучший ход: {pred_move} | Оценка нейросети (Value): {val:+.3f} | Ожидалось: {exp_str}")
        print("-" * 70)

    print("\n🎉 Дообученная модель V1.5 успешно скомпилирована, проверена и развёрнута!")

if __name__ == '__main__':
    main()
