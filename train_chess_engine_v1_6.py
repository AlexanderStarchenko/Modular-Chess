"""
Modular Chess Engine V1.6 - Neural Network Training Script
Hardware Target: NVIDIA GPU (L4 24GB / A100 / RTX 3090/4090) with Tensor Cores (FP16 AMP)
Architecture: ModularChessNet-V1.6 (10 SE-ResBlocks, 256 Channels, ~14.64M Parameters)
Action Space: 4672 Policy Head (AlphaZero/LC0: All Moves + Underpromotions + Queen Promotions)
Dataset: 5,000,000 Balanced Stockfish Evaluations (Early/Mid + Late/Endgame)
Features:
  - RAM optimization: uint8 storage in host RAM, fp16 on GPU
  - DataLoader: num_workers=0 (prevents memory duplication and leaks)
  - Extraction: df.iterrows()
  - Overfitting protection: 95/5 Train/Val Split, Early Stopping, Best Model Tracking
  - Auto-checkpointing & ONNX export
"""

import os
import sys
import time
import argparse
import urllib.request
import pyarrow.parquet as pq
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader, random_split
from tqdm.auto import tqdm

# 1. 4672 Action Space & Board Constants
DIRECTIONS = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
KNIGHT_MOVES = [(-2, -1), (-2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2), (2, -1), (2, 1)]
UNDERPROMOS = ['n', 'b', 'r']

PIECE_MAP = {
    'P': 0, 'N': 1, 'B': 2, 'R': 3, 'Q': 4, 'K': 5,
    'p': 6, 'n': 7, 'b': 8, 'r': 9, 'q': 10, 'k': 11
}
VAL_MAP = {'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9}

def uci_to_4672(uci: str):
    """
    Encodes a UCI move into a 0..4671 AlphaZero index:
    - 56 queen/rook/bishop ray moves (including queen promotions)
    - 8 knight moves
    - 9 underpromotions (n, b, r across left, straight, right)
    """
    if not uci or len(uci) < 4:
        return None
    from_c = ord(uci[0]) - ord('a')
    from_r = 8 - int(uci[1])
    to_c = ord(uci[2]) - ord('a')
    to_r = 8 - int(uci[3])
    promo = uci[4].lower() if len(uci) > 4 else None

    from_sq = from_r * 8 + from_c
    dr = to_r - from_r
    dc = to_c - from_c

    # Underpromotions (planes 64..72)
    if promo in UNDERPROMOS:
        p_idx = UNDERPROMOS.index(promo)
        p_dir = -1 if dc < 0 else (1 if dc > 0 else 0)
        dir_idx = p_dir + 1
        return from_sq * 73 + 64 + dir_idx * 3 + p_idx

    # Knight jumps (planes 56..63)
    for k_idx, (k_dr, k_dc) in enumerate(KNIGHT_MOVES):
        if dr == k_dr and dc == k_dc:
            return from_sq * 73 + 56 + k_idx

    # Queen-like ray moves (planes 0..55)
    for d_idx, (d_dr, d_dc) in enumerate(DIRECTIONS):
        for dist in range(1, 8):
            if dr == d_dr * dist and dc == d_dc * dist:
                return from_sq * 73 + d_idx * 7 + (dist - 1)

    return None

def fen_to_tensor_uint8(fen: str) -> np.ndarray:
    """Encodes FEN to 16x8x8 binary planes stored as uint8 to conserve host RAM."""
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

def is_late_game(fen: str) -> bool:
    """Detects whether a position is late middlegame or endgame."""
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

# 2. ModularChessNet-V1.6 Architecture
class SEBlock(nn.Module):
    def __init__(self, channels=256, reduction=4):
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
    def __init__(self, channels=256):
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

class ModularChessNetV16(nn.Module):
    def __init__(self, in_channels=16, num_res_blocks=10, channels=256):
        super().__init__()
        self.in_conv = nn.Conv2d(in_channels, channels, 3, padding=1, bias=False)
        self.in_bn = nn.BatchNorm2d(channels)
        self.relu = nn.ReLU(inplace=True)

        self.blocks = nn.ModuleList([ResBlockSE(channels) for _ in range(num_res_blocks)])

        # Policy Head (4672 AlphaZero action space)
        self.policy_conv = nn.Conv2d(channels, 8, 1, bias=False)
        self.policy_bn = nn.BatchNorm2d(8)
        self.policy_fc = nn.Linear(8 * 8 * 8, 4672)

        # Value Head (-1.0 to +1.0 with Dropout regularization)
        self.value_conv = nn.Conv2d(channels, 4, 1, bias=False)
        self.value_bn = nn.BatchNorm2d(4)
        self.value_fc1 = nn.Linear(4 * 8 * 8, 256)
        self.value_dropout = nn.Dropout(p=0.2)
        self.value_fc2 = nn.Linear(256, 1)

    def forward(self, x):
        out = self.relu(self.in_bn(self.in_conv(x)))
        for block in self.blocks:
            out = block(out)

        # Policy
        p = self.relu(self.policy_bn(self.policy_conv(out)))
        policy_logits = self.policy_fc(p.flatten(1))

        # Value
        v = self.relu(self.value_bn(self.value_conv(out)))
        v = self.relu(self.value_fc1(v.flatten(1)))
        v = self.value_dropout(v)
        value = torch.tanh(self.value_fc2(v))

        return policy_logits, value

# 3. Main Training Routine
def train_v1_6(args):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"==================================================")
    print(f"♟️ Modular Chess Engine V1.6 Training Pipeline")
    print(f"   Device: {device}")
    if torch.cuda.is_available():
        print(f"   GPU: {torch.cuda.get_device_name(0)}")
        print(f"   VRAM: {torch.cuda.get_device_properties(0).total_memory / (1024**3):.2f} GB")
    print(f"==================================================")

    os.makedirs(args.output_dir, exist_ok=True)

    # Dataset file URLs
    dataset_files = [
        (os.path.join(args.data_dir, "stockfish_evals_part0.parquet"), "https://huggingface.co/datasets/Lichess/chess-position-evaluations/resolve/refs%2Fconvert%2Fparquet/default/train/0000.parquet"),
        (os.path.join(args.data_dir, "stockfish_evals_part1.parquet"), "https://huggingface.co/datasets/Lichess/chess-position-evaluations/resolve/refs%2Fconvert%2Fparquet/default/train/0001.parquet"),
        (os.path.join(args.data_dir, "stockfish_evals_part2.parquet"), "https://huggingface.co/datasets/Lichess/chess-position-evaluations/resolve/refs%2Fconvert%2Fparquet/default/train/0002.parquet")
    ]
    os.makedirs(args.data_dir, exist_ok=True)

    if not args.no_download:
        for fname, url in dataset_files:
            if not os.path.exists(fname):
                print(f"📥 Downloading {os.path.basename(fname)} from HuggingFace...")
                urllib.request.urlretrieve(url, fname)
                print(f"✅ {os.path.basename(fname)} ready!")
            else:
                print(f"ℹ️ {os.path.basename(fname)} found on disk.")

    target_total = args.target_total
    target_late = int(target_total * args.late_ratio)
    target_early = target_total - target_late

    print(f"\n⚙️ Allocating memory for {target_total:,} positions in uint8 (~{target_total * 1024 / (1024**3):.2f} GB RAM)...")
    all_boards = np.zeros((target_total, 16, 8, 8), dtype=np.uint8)
    all_policies = np.zeros(target_total, dtype=np.int64)
    all_values = np.zeros((target_total, 1), dtype=np.float32)

    loaded_early = 0
    loaded_late = 0
    pbar = tqdm(total=target_total, desc="Extracting positions (df.iterrows)")

    for fname, _ in dataset_files:
        if (loaded_early + loaded_late) >= target_total:
            break
        if not os.path.exists(fname):
            continue
        parquet_file = pq.ParquetFile(fname)
        for batch in parquet_file.iter_batches(batch_size=32768, columns=['fen', 'line', 'cp', 'mate']):
            df = batch.to_pandas()
            for _, row in df.iterrows():
                line = row['line']
                if not line:
                    continue
                pol_idx = uci_to_4672(line.split()[0])
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

                fen = row['fen']
                late = is_late_game(fen)

                if late and loaded_late < target_late:
                    idx = loaded_early + loaded_late
                    all_boards[idx] = fen_to_tensor_uint8(fen)
                    all_policies[idx] = pol_idx
                    all_values[idx, 0] = val
                    loaded_late += 1
                    pbar.update(1)
                elif not late and loaded_early < target_early:
                    idx = loaded_early + loaded_late
                    all_boards[idx] = fen_to_tensor_uint8(fen)
                    all_policies[idx] = pol_idx
                    all_values[idx, 0] = val
                    loaded_early += 1
                    pbar.update(1)

                if (loaded_early + loaded_late) >= target_total:
                    break
            if (loaded_early + loaded_late) >= target_total:
                break

    total_loaded = loaded_early + loaded_late
    pbar.close()
    print(f"🎉 Collected {total_loaded:,} positions!")
    print(f"   • Early / Middlegame: {loaded_early:,} ({loaded_early/total_loaded*100:.1f}%)")
    print(f"   • Late-game / Endgame: {loaded_late:,} ({loaded_late/total_loaded*100:.1f}%)")

    # Train / Val Split
    X_tensor = torch.from_numpy(all_boards[:total_loaded])
    y_policy = torch.from_numpy(all_policies[:total_loaded])
    y_value = torch.from_numpy(all_values[:total_loaded])
    del all_boards, all_policies, all_values

    full_dataset = TensorDataset(X_tensor, y_policy, y_value)
    val_size = int(args.val_split * len(full_dataset))
    train_size = len(full_dataset) - val_size

    torch.manual_seed(42)
    train_dataset, val_dataset = random_split(full_dataset, [train_size, val_size])
    print(f"📊 Train set: {train_size:,} | Validation set: {val_size:,}")

    # DataLoader with num_workers=0 to prevent Linux fork memory leaks
    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=0,
        pin_memory=(device.type == 'cuda'),
        drop_last=True
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=0,
        pin_memory=(device.type == 'cuda')
    )

    # Initialize Model
    model = ModularChessNetV16(num_res_blocks=10, channels=256).to(device)
    total_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"\n🧠 ModularChessNet-V1.6 Model:")
    print(f"   • Parameters: {total_params:,} (~{total_params/1e6:.2f}M)")
    print(f"   • Action Space: 4672 Policy Logits")
    print(f"   • Architecture: 10 SE-ResBlocks, 256 channels")

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-5)
    policy_loss_fn = nn.CrossEntropyLoss()
    value_loss_fn = nn.MSELoss()
    scaler = torch.cuda.amp.GradScaler(enabled=(device.type == 'cuda'))

    best_val_loss = float('inf')
    patience_counter = 0

    best_pt_path = os.path.join(args.output_dir, "best_model_v1_6.pt")
    best_onnx_path = os.path.join(args.output_dir, "modular_chess_v1_6.onnx")

    print(f"\n🚀 Training started for {args.epochs} epochs (Early stopping patience: {args.patience})...")
    start_time = time.time()

    for epoch in range(1, args.epochs + 1):
        # 1. Training Phase
        model.train()
        t_loss, t_pol, t_val = 0.0, 0.0, 0.0
        t_batches = len(train_loader)

        ep_bar = tqdm(train_loader, desc=f"Epoch {epoch:02d}/{args.epochs} [Train]", leave=False)
        for b_uint8, tp, tv in ep_bar:
            b = b_uint8.to(device, non_blocking=True).to(torch.float32)
            tp = tp.to(device, non_blocking=True)
            tv = tv.to(device, non_blocking=True)

            optimizer.zero_grad(set_to_none=True)
            with torch.cuda.amp.autocast(enabled=(device.type == 'cuda'), dtype=torch.float16):
                pred_p, pred_v = model(b)
                loss_p = policy_loss_fn(pred_p, tp)
                loss_v = value_loss_fn(pred_v, tv)
                loss = loss_p + 0.6 * loss_v

            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()

            t_loss += loss.item()
            t_pol += loss_p.item()
            t_val += loss_v.item()
            ep_bar.set_postfix({'loss': f"{loss.item():.4f}", 'p': f"{loss_p.item():.4f}", 'v': f"{loss_v.item():.4f}"})

        scheduler.step()
        avg_train_loss = t_loss / t_batches
        avg_train_pol = t_pol / t_batches
        avg_train_val = t_val / t_batches

        # 2. Validation Phase (Overfitting Protection)
        model.eval()
        v_loss, v_pol, v_val = 0.0, 0.0, 0.0
        v_batches = len(val_loader)

        with torch.no_grad():
            for b_uint8, tp, tv in val_loader:
                b = b_uint8.to(device, non_blocking=True).to(torch.float32)
                tp = tp.to(device, non_blocking=True)
                tv = tv.to(device, non_blocking=True)

                with torch.cuda.amp.autocast(enabled=(device.type == 'cuda'), dtype=torch.float16):
                    pred_p, pred_v = model(b)
                    loss_p = policy_loss_fn(pred_p, tp)
                    loss_v = value_loss_fn(pred_v, tv)
                    loss = loss_p + 0.6 * loss_v

                v_loss += loss.item()
                v_pol += loss_p.item()
                v_val += loss_v.item()

        avg_val_loss = v_loss / v_batches
        avg_val_pol = v_pol / v_batches
        avg_val_val = v_val / v_batches
        curr_lr = scheduler.get_last_lr()[0]

        print(f"\nEpoch {epoch:02d}/{args.epochs} | LR: {curr_lr:.6f}")
        print(f"   • Train Loss: {avg_train_loss:.4f} (Policy: {avg_train_pol:.4f}, Value MSE: {avg_train_val:.4f})")
        print(f"   • Val Loss:   {avg_val_loss:.4f} (Policy: {avg_val_pol:.4f}, Value MSE: {avg_val_val:.4f})")

        # Save epoch checkpoint
        epoch_pt = os.path.join(args.output_dir, f"modular_chess_v1_6_epoch_{epoch}.pt")
        torch.save(model.state_dict(), epoch_pt)

        # 3. Best Model Checkpoint Tracking
        if avg_val_loss < best_val_loss:
            impr = best_val_loss - avg_val_loss
            best_val_loss = avg_val_loss
            patience_counter = 0

            # Save best checkpoint
            torch.save(model.state_dict(), best_pt_path)

            # Export best model to ONNX
            try:
                dummy_in = torch.randn(1, 16, 8, 8, device=device)
                torch.onnx.export(
                    model, dummy_in, best_onnx_path,
                    input_names=["board_state"], output_names=["policy_logits", "value"],
                    dynamic_axes={"board_state": {0: "batch_size"}, "policy_logits": {0: "batch_size"}, "value": {0: "batch_size"}},
                    opset_version=14
                )
            except Exception as e:
                print(f"   ⚠️ ONNX export warning: {e}")

            print(f"   ⭐ NEW BEST MODEL! Val loss improved by {impr:.4f} -> Saved to {best_pt_path}")
        else:
            patience_counter += 1
            print(f"   ⚠️ Val loss did not improve (Patience: {patience_counter}/{args.patience})")
            if patience_counter >= args.patience:
                print(f"\n🛑 Early stopping triggered! Optimal checkpoint is preserved at: {best_pt_path}")
                break

    total_time = (time.time() - start_time) / 60
    print(f"\n==================================================")
    print(f"✅ Training completed in {total_time:.1f} minutes!")
    print(f"   • Optimal Val Loss: {best_val_loss:.4f}")
    print(f"   • Best PyTorch Model: {best_pt_path}")
    print(f"   • Best ONNX Model:    {best_onnx_path}")
    print(f"==================================================")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Train Modular Chess Engine V1.6")
    parser.add_argument("--data-dir", type=str, default="./data", help="Directory for parquet files")
    parser.add_argument("--output-dir", type=str, default="./checkpoints_v1_6", help="Directory for saving checkpoints")
    parser.add_argument("--target-total", type=int, default=5000000, help="Total dataset size (default: 5,000,000)")
    parser.add_argument("--late-ratio", type=float, default=0.44, help="Ratio of late game / endgame positions (default: 0.44 -> 2.2M / 5M)")
    parser.add_argument("--batch-size", type=int, default=1024, help="Training batch size (default: 1024)")
    parser.add_argument("--epochs", type=int, default=10, help="Max epochs (default: 10)")
    parser.add_argument("--lr", type=float, default=1e-3, help="Initial learning rate (default: 1e-3)")
    parser.add_argument("--patience", type=int, default=3, help="Early stopping patience (default: 3)")
    parser.add_argument("--val-split", type=float, default=0.05, help="Validation split (default: 0.05)")
    parser.add_argument("--no-download", action="store_true", help="Skip dataset downloading")
    args = parser.parse_args()

    train_v1_6(args)
