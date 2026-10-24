import os
import sys

# Force UTF-8 stdout to prevent Windows cp1251 UnicodeEncodeError
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

import torch
import torch.nn as nn
import onnx
import onnxruntime as ort
import numpy as np

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

        # Policy Head (4 channels * 64 = 256 -> 4672 logits)
        self.policy_conv = nn.Conv2d(channels, 4, kernel_size=1, bias=False)
        self.policy_bn = nn.BatchNorm2d(4)
        self.policy_fc = nn.Linear(4 * 8 * 8, 4672)

        # Value Head (2 channels * 64 = 128 -> 256 -> 1)
        self.value_conv = nn.Conv2d(channels, 2, kernel_size=1, bias=False)
        self.value_bn = nn.BatchNorm2d(2)
        self.value_fc1 = nn.Linear(2 * 8 * 8, 256)
        self.value_fc2 = nn.Linear(256, 1)

    def forward(self, x):
        out = self.relu(self.in_bn(self.in_conv(x)))
        for block in self.blocks:
            out = block(out)

        # Policy Head
        p = self.relu(self.policy_bn(self.policy_conv(out)))
        policy_all = self.policy_fc(p.flatten(1))
        # Top 4096 logits correspond to all (from_sq * 64 + to_sq) moves
        policy_logits = policy_all[:, :4096]

        # Value Head
        v = self.relu(self.value_bn(self.value_conv(out)))
        v = self.relu(self.value_fc1(v.flatten(1)))
        value = torch.tanh(self.value_fc2(v))

        return policy_logits, value

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pt_source = os.path.join(root_dir, 'best_model V1.5.pt')
    pt_target = os.path.join(root_dir, 'modular_chess_v1_5.pt')
    onnx_target = os.path.join(root_dir, 'modular_chess_v1_5.onnx')

    if not os.path.exists(pt_source):
        print(f"Error: {pt_source} not found!")
        return

    print(f"Loading PyTorch weights from: {pt_source}...")
    state_dict = torch.load(pt_source, map_location='cpu')
    print(f"Successfully loaded {len(state_dict)} weight tensors.")

    # Save standardized modular_chess_v1_5.pt
    torch.save(state_dict, pt_target)
    print(f"Saved standardized weights to: {pt_target}")

    model = ModularChessNetV15(num_res_blocks=8, channels=192)
    load_res = model.load_state_dict(state_dict)
    print("State dict loaded:", load_res)
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

    # Test ONNX Runtime session
    session = ort.InferenceSession(onnx_target)
    ort_out = session.run(None, {'board_state': np.zeros((1, 16, 8, 8), dtype=np.float32)})
    print(f"ONNX Runtime inference test passed! Outputs: Policy shape {ort_out[0].shape}, Value shape {ort_out[1].shape}")

if __name__ == '__main__':
    main()
