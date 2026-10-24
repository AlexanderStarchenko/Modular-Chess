import os
import sys

# Force UTF-8 stdout to prevent Windows cp1251 UnicodeEncodeError
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

import torch
import torch.nn as nn
import onnx

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
        
        self.policy_conv = nn.Conv2d(channels, 2, kernel_size=1, bias=False)
        self.policy_bn = nn.BatchNorm2d(2)
        self.policy_fc = nn.Linear(2 * 8 * 8, 4096)
        
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

def main():
    pt_path = "modular_chess_v1.pt"
    onnx_path = "modular_chess_v1.onnx"
    
    if not os.path.exists(pt_path):
        print(f"Error: {pt_path} not found!")
        return

    print("Loading PyTorch state_dict from:", pt_path)
    state_dict = torch.load(pt_path, map_location="cpu")
    print(f"Loaded {len(state_dict)} weight tensors.")
    
    model = ModularChessNet(num_res_blocks=6, channels=128)
    model.load_state_dict(state_dict)
    model.eval()
    print("Model initialized and weights successfully loaded!")
    
    dummy_input = torch.randn(1, 16, 8, 8, dtype=torch.float32)
    with torch.no_grad():
        p, v = model(dummy_input)
        print(f"Forward pass sanity check: policy shape {p.shape}, value shape {v.shape}, value={v.item():.4f}")

    print("Exporting self-contained ONNX model (without external data)...")
    torch.onnx.export(
        model,
        dummy_input,
        onnx_path,
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
    
    # Verify ONNX
    m = onnx.load(onnx_path)
    onnx.checker.check_model(m)
    size_bytes = os.path.getsize(onnx_path)
    print(f"Self-contained ONNX model successfully saved to {onnx_path}!")
    print(f"File size: {size_bytes:,} bytes (~{size_bytes/1e6:.2f} MB)")

if __name__ == "__main__":
    main()
