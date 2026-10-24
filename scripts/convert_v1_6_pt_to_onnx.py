"""
Convert best_model_v1_6.pt to self-contained modular_chess_v1_6.onnx and modular_chess_v1_6.pt
"""
import os
import sys

# Force UTF-8 stdout
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

import torch
import torch.nn as nn
import onnx
import onnxruntime as ort
import numpy as np

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

        # Value Head (-1.0 to +1.0 with Dropout)
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

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pt_source = os.path.join(root_dir, 'best_model_v1_6.pt')
    pt_target = os.path.join(root_dir, 'modular_chess_v1_6.pt')
    onnx_target = os.path.join(root_dir, 'modular_chess_v1_6.onnx')

    if not os.path.exists(pt_source):
        print(f"Error: {pt_source} not found!")
        return

    print(f"Loading PyTorch weights from: {pt_source}...")
    state_dict = torch.load(pt_source, map_location='cpu')
    print(f"Successfully loaded {len(state_dict)} weight tensors.")

    # Save standardized modular_chess_v1_6.pt
    torch.save(state_dict, pt_target)
    print(f"Saved standardized weights to: {pt_target}")

    model = ModularChessNetV16(num_res_blocks=10, channels=256)
    load_res = model.load_state_dict(state_dict)
    print("State dict loaded successfully:", load_res)
    model.eval()

    dummy_input = torch.randn(1, 16, 8, 8, dtype=torch.float32)
    with torch.no_grad():
        p, v = model(dummy_input)
        print(f"Sanity test -> Policy shape: {p.shape}, Value shape: {v.shape}, Value: {v.item():+.4f}")

    print(f"Exporting self-contained ONNX model to {onnx_target}...")
    torch.onnx.export(
        model,
        dummy_input,
        onnx_target,
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
    onnx_model = onnx.load(onnx_target)
    onnx.checker.check_model(onnx_model)
    file_size = os.path.getsize(onnx_target)
    print(f"ONNX model verified and saved! File size: {file_size:,} bytes (~{file_size/1e6:.2f} MB)")

    # Test ONNX Runtime session by reading bytes to avoid Windows non-ascii path issues if needed
    with open(onnx_target, 'rb') as f:
        model_bytes = f.read()
    session = ort.InferenceSession(model_bytes)
    ort_out = session.run(None, {'board_state': np.zeros((1, 16, 8, 8), dtype=np.float32)})
    print(f"ONNX Runtime inference test passed!")
    print(f"Outputs: Policy shape {ort_out[0].shape} (4672 logits), Value shape {ort_out[1].shape}")

if __name__ == '__main__':
    main()
