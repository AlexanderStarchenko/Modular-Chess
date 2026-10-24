"""
Modular Chess Engine V1 - Neural Network Training Script
Teacher: Stockfish Evaluations Dataset (Lichess)
Hardware Target: NVIDIA GPU (Tesla T4 / RTX) with Tensor Cores (FP16 AMP)
"""

import os
import time
import argparse
import urllib.request
import pyarrow.parquet as pq
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader
from tqdm.auto import tqdm

# 1. Constants and Board Encoding
PIECE_MAP = {
    'P': 0, 'N': 1, 'B': 2, 'R': 3, 'Q': 4, 'K': 5,
    'p': 6, 'n': 7, 'b': 8, 'r': 9, 'q': 10, 'k': 11
}

def fen_to_tensor(fen: str) -> np.ndarray:
    """Encodes a FEN string into a 16x8x8 binary feature plane array (Tensor Core aligned)."""
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
            
    # Plane 12: Turn (1.0 for White, 0.0 for Black)
    if turn_str == 'w':
        planes[12, :, :] = 1.0
        
    # Planes 13-14: Castling rights
    if 'K' in castling_str: planes[13, 0:4, 0:4] = 1.0
    if 'Q' in castling_str: planes[13, 0:4, 4:8] = 1.0
    if 'k' in castling_str: planes[14, 4:8, 0:4] = 1.0
    if 'q' in castling_str: planes[14, 4:8, 4:8] = 1.0
    
    return planes

def uci_to_policy_idx(uci: str):
    """Encodes a UCI move (e.g. e2e4) into a policy index from 0 to 4095."""
    if not uci or len(uci) < 4:
        return None
    from_c = ord(uci[0]) - 97
    from_r = 8 - int(uci[1])
    to_c = ord(uci[2]) - 97
    to_r = 8 - int(uci[3])
    if 0 <= from_r < 8 and 0 <= from_c < 8 and 0 <= to_r < 8 and 0 <= to_c < 8:
        return (from_r * 8 + from_c) * 64 + (to_r * 8 + to_c)
    return None

# 2. ResNet Dual-Head Model Architecture
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
        self.in_conv = nn.Conv2d(16, channels, kernel_size=3, padding=1, bias=False)
        self.in_bn = nn.BatchNorm2d(channels)
        self.relu = nn.ReLU(inplace=True)
        
        self.blocks = nn.ModuleList([ResBlock(channels) for _ in range(num_res_blocks)])
        
        # Policy Head (4096 move classes)
        self.policy_conv = nn.Conv2d(channels, 2, kernel_size=1, bias=False)
        self.policy_bn = nn.BatchNorm2d(2)
        self.policy_fc = nn.Linear(2 * 8 * 8, 4096)
        
        # Value Head (Scalar evaluation in [-1.0, +1.0])
        self.value_conv = nn.Conv2d(channels, 1, kernel_size=1, bias=False)
        self.value_bn = nn.BatchNorm2d(1)
        self.value_fc1 = nn.Linear(1 * 8 * 8, 256)
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

# 3. Main Training Routine
def main():
    parser = argparse.ArgumentParser(description="Train Modular Chess Neural Network V1")
    parser.add_argument("--samples", type=int, default=1_500_000, help="Number of positions to train on")
    parser.add_argument("--epochs", type=int, default=15, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=1024, help="Batch size (multiple of 64 for Tensor Cores)")
    parser.add_argument("--lr", type=float, default=1e-3, help="Learning rate")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        torch.backends.cudnn.benchmark = True

    # Download dataset if not present
    data_url = "https://huggingface.co/datasets/Lichess/chess-position-evaluations/resolve/refs%2Fconvert%2Fparquet/default/train/0000.parquet"
    parquet_path = "stockfish_evals_part0.parquet"
    if not os.path.exists(parquet_path):
        print(f"Downloading training parquet from {data_url}...")
        urllib.request.urlretrieve(data_url, parquet_path)
        print("Download complete.")

    # Vectorize samples
    print(f"Extracting and vectorizing {args.samples:,} positions...")
    parquet_file = pq.ParquetFile(parquet_path)
    boards = np.zeros((args.samples, 16, 8, 8), dtype=np.float32)
    policies = np.zeros(args.samples, dtype=np.int64)
    values = np.zeros((args.samples, 1), dtype=np.float32)

    loaded = 0
    pbar = tqdm(total=args.samples, desc="Parsing FENs")
    for batch in parquet_file.iter_batches(batch_size=32768, columns=['fen', 'line', 'cp', 'mate']):
        df = batch.to_pandas()
        for _, row in df.iterrows():
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
                
            boards[loaded] = fen_to_tensor(row['fen'])
            policies[loaded] = pol_idx
            values[loaded, 0] = val
            loaded += 1
            pbar.update(1)
            if loaded >= args.samples:
                break
        if loaded >= args.samples:
            break
    pbar.close()

    dataset = TensorDataset(torch.from_numpy(boards[:loaded]), torch.from_numpy(policies[:loaded]), torch.from_numpy(values[:loaded]))
    del boards, policies, values

    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True, pin_memory=(device.type == 'cuda'), drop_last=True)
    model = ModularChessNet().to(device)
    print(f"Model parameters: {sum(p.numel() for p in model.parameters() if p.requires_grad):,}")

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    policy_loss_fn = nn.CrossEntropyLoss()
    value_loss_fn = nn.MSELoss()
    scaler = torch.cuda.amp.GradScaler(enabled=(device.type == 'cuda'))

    print(f"Starting {args.epochs} training epochs...")
    start_t = time.time()
    for ep in range(1, args.epochs + 1):
        model.train()
        total_loss, total_p, total_v = 0.0, 0.0, 0.0
        for b, tp, tv in loader:
            b, tp, tv = b.to(device, non_blocking=True), tp.to(device, non_blocking=True), tv.to(device, non_blocking=True)
            optimizer.zero_grad(set_to_none=True)
            with torch.cuda.amp.autocast(enabled=(device.type == 'cuda'), dtype=torch.float16):
                pp, pv = model(b)
                pl = policy_loss_fn(pp, tp)
                vl = value_loss_fn(pv, tv)
                loss = pl + 0.5 * vl
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            total_loss += loss.item()
            total_p += pl.item()
            total_v += vl.item()

        scheduler.step()
        n_b = len(loader)
        print(f"Epoch {ep:02d}/{args.epochs} - Loss: {total_loss/n_b:.4f} (Policy: {total_p/n_b:.4f}, Value: {total_v/n_b:.4f})")

    print(f"Training completed in {(time.time() - start_t)/60:.2f} minutes.")
    torch.save(model.state_dict(), "modular_chess_v1.pt")
    print("Saved modular_chess_v1.pt")

    dummy_input = torch.randn(1, 16, 8, 8, device=device)
    torch.onnx.export(
        model, dummy_input, "modular_chess_v1.onnx",
        input_names=["board_state"], output_names=["policy_logits", "value"],
        dynamic_axes={"board_state": {0: "batch_size"}, "policy_logits": {0: "batch_size"}, "value": {0: "batch_size"}},
        opset_version=14
    )
    print("Exported modular_chess_v1.onnx successfully!")

if __name__ == "__main__":
    main()
