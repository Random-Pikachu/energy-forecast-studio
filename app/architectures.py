"""Model architectures reconstructed from the BTP training notebooks and checkpoints."""


import math

import torch
from torch import nn


# ============================================================
# Positional Encoding
# ============================================================
class PositionalEncoding(nn.Module):
    """Sinusoidal positional encoding (Vaswani et al., 2017).

    Used for both token streams: the position index means
    *time step* for temporal tokens and *frequency bin* for
    spectral tokens.
    """

    def __init__(self, d_model: int, dropout: float = 0.1, max_len: int = 5000):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)

        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        pe = pe.unsqueeze(0)  # (1, max_len, d_model)
        self.register_buffer("pe", pe)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x : (batch, seq_len, d_model)
        x = x + self.pe[:, :x.size(1), :]
        return self.dropout(x)

# ============================================================
# Multi-Scale CNN Front-End
# ============================================================
class MultiScaleCNN(nn.Module):
    """Parallel Conv1d branches with different kernel sizes.

    Each branch keeps the sequence length ('same' padding) and
    produces `branch_channels` feature maps; branch outputs are
    concatenated and mixed by a point-wise (1x1) convolution so
    that the fused channel dimension equals d_model.
    """

    def __init__(
        self,
        input_size: int,
        branch_channels: int,
        kernel_sizes: list,
        dropout: float = 0.1
    ):
        super().__init__()
        self.kernel_sizes = list(kernel_sizes)
        self.branches = nn.ModuleList([
            nn.Conv1d(
                in_channels=input_size,
                out_channels=branch_channels,
                kernel_size=k,
                padding="same"
            )
            for k in self.kernel_sizes
        ])
        fused_channels = branch_channels * len(self.kernel_sizes)
        self.fusion = nn.Conv1d(fused_channels, fused_channels, kernel_size=1)
        self.activation = nn.GELU()
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor, return_branches: bool = False):
        # x : (batch, lookback, features) -> (batch, features, lookback)
        x = x.transpose(1, 2)

        branch_outputs = [self.activation(branch(x)) for branch in self.branches]

        fused = torch.cat(branch_outputs, dim=1)          # (batch, d_model, lookback)
        fused = self.activation(self.fusion(fused))
        fused = self.dropout(fused)
        fused = fused.transpose(1, 2)                     # (batch, lookback, d_model)

        if return_branches:
            return fused, branch_outputs
        return fused

# ============================================================
# Frequency-Domain Feature Extractor
# ============================================================
class FrequencyFeatureExtractor(nn.Module):
    """rFFT along the time axis -> log-amplitude + phase tokens.

    For a lookback of L, produces floor(L/2) + 1 spectral tokens
    of dimension d_model (bin k corresponds to period L/k hours).
    The FFT itself always runs in float32: FFT kernels are not
    reliable in half precision, so the transform is wrapped in a
    disabled-autocast region even when AMP is on.
    """

    def __init__(self, input_size: int, d_model: int, dropout: float = 0.1):
        super().__init__()
        self.projection = nn.Linear(2 * input_size, d_model)
        self.activation = nn.GELU()
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor, return_spectrum: bool = False):
        # x : (batch, lookback, features)
        with torch.autocast(device_type=x.device.type, enabled=False):
            spectrum = torch.fft.rfft(x.float(), dim=1)   # (batch, n_bins, features), complex
            amplitude = torch.log1p(spectrum.abs())
            phase = torch.angle(spectrum)

        features = torch.cat([amplitude, phase], dim=-1)  # (batch, n_bins, 2*features)
        tokens = self.dropout(self.activation(self.projection(features)))

        if return_spectrum:
            return tokens, amplitude
        return tokens

# ============================================================
# Cross-Attention Fusion Block
# ============================================================
class CrossAttentionFusion(nn.Module):
    """Temporal tokens (queries) attend over spectral tokens (keys/values).

        Q = T W_Q ,  K = S W_K ,  V = S W_V
        T'  = LayerNorm(T + Dropout(Attention(Q, K, V)))
        T'' = LayerNorm(T' + FFN(T'))
    """

    def __init__(self, d_model: int, nhead: int, dim_feedforward: int, dropout: float = 0.1):
        super().__init__()
        self.cross_attention = nn.MultiheadAttention(
            embed_dim=d_model,
            num_heads=nhead,
            dropout=dropout,
            batch_first=True
        )
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.feed_forward = nn.Sequential(
            nn.Linear(d_model, dim_feedforward),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(dim_feedforward, d_model)
        )
        self.dropout = nn.Dropout(dropout)

    def forward(
        self,
        temporal_tokens: torch.Tensor,     # (batch, lookback, d_model)
        frequency_tokens: torch.Tensor,    # (batch, n_bins,  d_model)
        return_attention: bool = False
    ):
        attn_output, attn_weights = self.cross_attention(
            query=temporal_tokens,
            key=frequency_tokens,
            value=frequency_tokens,
            need_weights=True,
            average_attn_weights=True
        )

        x = self.norm1(temporal_tokens + self.dropout(attn_output))
        x = self.norm2(x + self.feed_forward(x))

        if return_attention:
            return x, attn_weights                # attn_weights : (batch, lookback, n_bins)
        return x

# ============================================================
# CNN-Transformer Model
# ============================================================
class CNNTransformer(nn.Module):
    """Multi-scale CNN + rFFT branch + cross-attention fusion + Transformer encoder.

    Forecasts all `horizon` steps directly from the last encoded token
    (same output convention as Notebooks 04-05).
    """

    def __init__(
        self,
        input_size: int,
        horizon: int,
        kernel_sizes=(3, 5, 7, 11),
        branch_channels: int = 16,
        d_model: int = 64,
        nhead: int = 4,
        num_layers: int = 2,
        dim_feedforward: int = 128,
        dropout: float = 0.1
    ):
        super().__init__()
        assert branch_channels * len(kernel_sizes) == d_model, \
            "CNN branches must fuse exactly to d_model channels"

        self.temporal_encoder = MultiScaleCNN(input_size, branch_channels, kernel_sizes, dropout)
        self.frequency_encoder = FrequencyFeatureExtractor(input_size, d_model, dropout)

        self.temporal_pos = PositionalEncoding(d_model, dropout=dropout)
        self.frequency_pos = PositionalEncoding(d_model, dropout=dropout)

        self.fusion = CrossAttentionFusion(d_model, nhead, dim_feedforward, dropout)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=dim_feedforward,
            dropout=dropout,
            batch_first=True,
            activation="gelu"
        )
        self.transformer_encoder = nn.TransformerEncoder(
            encoder_layer, num_layers=num_layers
        )

        self.head = nn.Linear(d_model, horizon)

    def forward(self, x: torch.Tensor, return_internals: bool = False):
        # x : (batch, lookback, features)

        # ---------- Branch A : multi-scale temporal CNN ----------
        if return_internals:
            temporal_tokens, branch_maps = self.temporal_encoder(x, return_branches=True)
        else:
            temporal_tokens = self.temporal_encoder(x)

        # ---------- Branch B : frequency domain ----------
        if return_internals:
            frequency_tokens, amplitude_spectrum = self.frequency_encoder(x, return_spectrum=True)
        else:
            frequency_tokens = self.frequency_encoder(x)

        # ---------- Positional information ----------
        temporal_tokens = self.temporal_pos(temporal_tokens)     # index = time step
        frequency_tokens = self.frequency_pos(frequency_tokens)  # index = frequency bin

        # ---------- Cross-attention fusion ----------
        if return_internals:
            fused, attention_weights = self.fusion(
                temporal_tokens, frequency_tokens, return_attention=True
            )
        else:
            fused = self.fusion(temporal_tokens, frequency_tokens)

        # ---------- Transformer encoder & head ----------
        encoded = self.transformer_encoder(fused)
        prediction = self.head(encoded[:, -1, :])                # (batch, horizon)

        if return_internals:
            return prediction, {
                "branch_maps": branch_maps,                # list of (batch, channels, lookback)
                "amplitude_spectrum": amplitude_spectrum,  # (batch, n_bins, features)
                "cross_attention": attention_weights       # (batch, lookback, n_bins)
            }
        return prediction

# ============================================================
# CNN-LSTM Model
# ============================================================

class CNNLSTM(nn.Module):
    def __init__(
        self,
        input_size,
        horizon,
        hidden_size=100,
        cnn_channels=2,
        kernel_size=2
    ):
        super().__init__()
        self.conv1 = nn.Conv1d(
            in_channels=input_size,
            out_channels=cnn_channels,
            kernel_size=kernel_size,
        )
        self.relu = nn.ReLU()
        self.lstm = nn.LSTM(
            input_size=cnn_channels,
            hidden_size=hidden_size,
            num_layers=1,
            batch_first=True
        )
        self.fc = nn.Linear(hidden_size, horizon)

    def forward(self, x):
        x = x.permute(0,2,1)
        x = self.conv1(x)
        x = self.relu(x)
        x = x.permute(0,2,1)
        output,_ = self.lstm(x)
        output = output[:,-1,:]
        return self.fc(output)


class CNNGRU(nn.Module):
    """CNN-GRU reconstructed from the checkpoint's tensor names and dimensions."""

    def __init__(self, input_size: int, horizon: int, hidden_size: int = 100,
                 cnn_channels: int = 2, kernel_size: int = 2, num_layers: int = 2):
        super().__init__()
        self.conv1d = nn.Conv1d(input_size, cnn_channels, kernel_size)
        self.relu = nn.ReLU()
        self.gru = nn.GRU(cnn_channels, hidden_size, num_layers=num_layers,
                          batch_first=True)
        self.fc = nn.Linear(hidden_size, horizon)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.relu(self.conv1d(x.permute(0, 2, 1)))
        x = x.permute(0, 2, 1)
        output, _ = self.gru(x)
        return self.fc(output[:, -1, :])
