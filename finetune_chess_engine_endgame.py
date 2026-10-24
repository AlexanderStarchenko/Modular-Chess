"""
Modular Chess Engine V1.5 - Late-Game & Endgame Fine-Tuning Script
Target: Fine-tuning on positions after the middlegame (move 25+, reduced pieces, endgames)
Hardware Target: NVIDIA GPU (Tesla T4 / RTX) with Tensor Cores (FP16 AMP)
"""

import os
import time
import argparse
import urllib.request
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader

# 1. Board & Move Encoding
PIECE_MAP = {
    'P': 0, 'N': 1, 'B': 2, 'R': 3, 'Q': 4, 'K': 5,
    'p': 6, 'n': 7, 'b': 8, 'r': 9, 'q': 10, 'k': 11
}

VAL_MAP = {'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9}

def is_late_game(fen: str) -> bool:
    """
    Filters for positions after the middlegame / endgames:
    1. Piece count <= 18 (including kings)
    2. Non-king material <= 40 points
    3. Fullmove >= 25 with reduced piece count (<= 24)
    """
    parts = fen.split()
    board_str = parts[0]
    pieces = [ch for ch in board_str if ch.lower() in 'pnbrqk']
    total_pieces = len(pieces)

    if total_pieces <= 18:
        return True

    mat_score = sum(VAL_MAP.get(ch.lower(), 0) for ch in board_str)
    if mat_score <= 40:
        return True

    fullmove = int(parts[5]) if len(parts) > 5 and parts[5].isdigit() else 1
    if fullmove >= 25 and total_pieces <= 24:
        return True

    return False

def fen_to_tensor_uint8(fen: str) -> np.ndarray:
    planes = np.zeros((16, 8, 8), dtype=np.uint8)
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
                planes[p_idx, r, c] = 1
            c += 1

    if turn_str == 'w':
        planes[12, :, :] = 1
    if 'K' in castling_str: planes[13, 0:4, 0:4] = 1
    if 'Q' in castling_str: planes[13, 0:4, 4:8] = 1
    if 'k' in castling_str: planes[14, 4:8, 0:4] = 1
    if 'q' in castling_str: planes[14, 4:8, 4:8] = 1

    return planes

def uci_to_policy_idx(uci: str):
    if not uci or len(uci) < 4:
        return None
    from_c = ord(uci[0]) - 97
    from_r = 8 - int(uci[1])
    to_c = ord(uci[2]) - 97
    to_r = 8 - int(uci[3])
    if 0 <= from_r < 8 and 0 <= from_c < 8 and 0 <= to_r < 8 and 0 <= to_c < 8:
        return (from_r * 8 + from_c) * 64 + (to_r * 8 + to_c)
    return None

# 2. ResNet V1.5 with Squeeze-and-Excitation (SE)
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
        self.policy_fc = nn.Linear(4 * 8 * 8, 4096)

        self.value_conv = nn.Conv2d(channels, 2, kernel_size=1, bias=False)
        self.value_bn = nn.BatchNorm2d(2)
        self.value_fc1 = nn.Linear(2 * 8 * 8, 256)
        self.value_fc2 = nn.Linear(256, 1)

    def forward(self, x):
        out = self.relu(self.in_bn(self.in_conv(x)))
        for block in self.blocks:
            out = block(out)

        p = self.relu(self.policy_bn(self.policy_conv(out)))
        policy_logits = self.policy_fc(p.flatten(1))

        v = self.relu(self.value_bn(self.value_conv(out)))
        v = self.relu(self.value_fc1(v.flatten(1)))
        value = torch.tanh(self.value_fc2(v))

        return policy_logits, value

# 3. Main Routine
def main():
    parser = argparse.ArgumentParser(description="Fine-tune Modular Chess Neural Network V1.5 on Late-Game/Endgame")
    parser.add_argument("--checkpoint", type=str, default="modular_chess_v1_5.pt", help="Base checkpoint file (default: modular_chess_v1_5.pt)")
    parser.add_argument("--samples", type=int, default=600_000, help="Number of late-game positions (default: 600,000)")
    parser.add_argument("--epochs", type=int, default=8, help="Fine-tuning epochs (default: 8)")
    parser.add_argument("--batch-size", type=int, default=1024, help="Batch size (default: 1024)")
    parser.add_argument("--lr", type=float, default=2e-4, help="Fine-tuning learning rate (default: 2e-4)")
    parser.add_argument("--output-pt", type=str, default="modular_chess_v1_5_finetuned.pt", help="Output PyTorch checkpoint")
    parser.add_argument("--output-onnx", type=str, default="modular_chess_v1_5.onnx", help="Output ONNX model")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        capability = torch.cuda.get_device_capability(0)
        print(f"GPU: {gpu_name} (Capability: {capability[0]}.{capability[1]})")
        if capability[0] >= 7:
            print("Tensor Cores detected and enabled via FP16 AMP!")
        torch.backends.cudnn.benchmark = True

    model = ModularChessNetV15(num_res_blocks=8, channels=192).to(device)
    param_count = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Model V1.5 initialized! Parameters: {param_count:,} (~{param_count/1e6:.2f}M)")

    # Load base checkpoint if available
    cp_path = args.checkpoint
    if not os.path.exists(cp_path) and os.path.exists("best_model V1.5.pt"):
        cp_path = "best_model V1.5.pt"

    if os.path.exists(cp_path):
        print(f"Loading base checkpoint: {cp_path}...")
        state_dict = torch.load(cp_path, map_location=device)
        model.load_state_dict(state_dict, strict=True)
        print("Base weights loaded successfully!")
    else:
        print(f"Warning: Checkpoint '{cp_path}' not found. Starting from scratch or random initialization.")

    # Dataset downloads if missing
    dataset_urls = [
        ("stockfish_evals_part0.parquet", "https://huggingface.co/datasets/Lichess/chess-position-evaluations/resolve/refs%2Fconvert%2Fparquet/default/train/0000.parquet"),
        ("stockfish_evals_part1.parquet", "https://huggingface.co/datasets/Lichess/chess-position-evaluations/resolve/refs%2Fconvert%2Fparquet/default/train/0001.parquet")
    ]

    for fname, url in dataset_urls:
        if not os.path.exists(fname):
            print(f"Downloading {fname} from HuggingFace...")
            urllib.request.urlretrieve(url, fname)
            print(f"Downloaded {fname} successfully.")
        else:
            print(f"Found {fname} on disk.")

    try:
        import pyarrow.parquet as pq
    except ImportError:
        print("Error: pyarrow is required to read dataset. Install with: pip install pyarrow")
        return

    try:
        from tqdm.auto import tqdm
    except ImportError:
        def tqdm(iterable=None, **kwargs):
            return iterable

    print(f"\nFiltering and extracting {args.samples:,} late-game positions into RAM...")
    boards = np.zeros((args.samples, 16, 8, 8), dtype=np.uint8)
    policies = np.zeros(args.samples, dtype=np.int64)
    values = np.zeros((args.samples, 1), dtype=np.float32)

    loaded = 0
    pbar = tqdm(total=args.samples, desc="Filtering Endgame FENs")

    for fname, _ in dataset_urls:
        if loaded >= args.samples:
            break
        parquet_file = pq.ParquetFile(fname)
        for batch in parquet_file.iter_batches(batch_size=32768, columns=['fen', 'line', 'cp', 'mate']):
            df = batch.to_pandas()
            for _, row in df.iterrows():
                fen = row['fen']
                if not is_late_game(fen):
                    continue

                line = row['line']
                if not line:
                    continue
                pol_idx = uci_to_policy_idx(line.split()[0])
                if pol_idx is None:
                    continue

                cp = row['cp']
                mate = row['mate']
                if mate is not None and not np.isnan(mate):
                    val = 1.0 if mate > 0 else -1.0
                elif cp is not None and not np.isnan(cp):
                    val = float(np.tanh(cp / 400.0))
                else:
                    continue

                boards[loaded] = fen_to_tensor_uint8(fen)
                policies[loaded] = pol_idx
                values[loaded, 0] = val
                loaded += 1
                pbar.update(1)
                if loaded >= args.samples:
                    break
            if loaded >= args.samples:
                break

    pbar.close()
    print(f"Successfully filtered and loaded {loaded:,} late-game positions into RAM.")

    dataset = TensorDataset(torch.from_numpy(boards[:loaded]), torch.from_numpy(policies[:loaded]), torch.from_numpy(values[:loaded]))
    del boards, policies, values

    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True, pin_memory=(device.type == 'cuda'), drop_last=True)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-6)
    policy_loss_fn = nn.CrossEntropyLoss()
    value_loss_fn = nn.MSELoss()
    scaler = torch.cuda.amp.GradScaler(enabled=(device.type == 'cuda'))

    print(f"\nStarting {args.epochs} fine-tuning epochs (LR: {args.lr}, Batch: {args.batch_size}, FP16 Tensor Cores)...")
    start_t = time.time()

    for ep in range(1, args.epochs + 1):
        model.train()
        total_loss, total_p, total_v = 0.0, 0.0, 0.0
        n_batches = len(loader)
        ep_bar = tqdm(loader, desc=f"Epoch {ep:02d}/{args.epochs}", leave=False)

        for b_uint8, tp, tv in ep_bar:
            b = b_uint8.to(device, non_blocking=True).to(torch.float32)
            tp = tp.to(device, non_blocking=True)
            tv = tv.to(device, non_blocking=True)

            optimizer.zero_grad(set_to_none=True)
            with torch.cuda.amp.autocast(enabled=(device.type == 'cuda'), dtype=torch.float16):
                pp, pv = model(b)
                pl = policy_loss_fn(pp, tp)
                vl = value_loss_fn(pv, tv)
                loss = pl + 0.8 * vl

            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()

            total_loss += loss.item()
            total_p += pl.item()
            total_v += vl.item()
            ep_bar.set_postfix({'loss': f"{loss.item():.4f}", 'pol': f"{pl.item():.4f}", 'val': f"{vl.item():.4f}"})

        scheduler.step()
        avg_loss = total_loss / n_batches
        avg_p = total_p / n_batches
        avg_v = total_v / n_batches
        lr_now = scheduler.get_last_lr()[0]
        print(f"Epoch {ep:02d}/{args.epochs} - Loss: {avg_loss:.4f} (Policy: {avg_p:.4f}, Value: {avg_v:.4f}) | LR: {lr_now:.7f}")

    total_min = (time.time() - start_t) / 60
    print(f"\nFine-tuning completed in {total_min:.2f} minutes!")

    # Save fine-tuned PyTorch checkpoint
    torch.save(model.state_dict(), args.output_pt)
    print(f"Saved PyTorch weights: {args.output_pt}")

    # Export to ONNX
    model.eval()
    dummy_input = torch.randn(1, 16, 8, 8, device=device)
    torch.onnx.export(
        model, dummy_input, args.output_onnx,
        input_names=["board_state"], output_names=["policy_logits", "value"],
        dynamic_axes={"board_state": {0: "batch_size"}, "policy_logits": {0: "batch_size"}, "value": {0: "batch_size"}},
        opset_version=14
    )
    print(f"Exported ONNX model: {args.output_onnx} successfully!")

if __name__ == "__main__":
    main()
