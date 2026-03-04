#!/usr/bin/env python3
"""
Statistical tests for SpaceDice RNG quality.
Requires: pip install numpy scipy statsmodels

Run: python -m pytest tests/test_rng.py -v
"""

import sys
from pathlib import Path

# Only import heavy deps if running tests
try:
    import numpy as np
    from scipy import stats
    from statsmodels.stats.diagnostic import acorr_ljungbox
except ImportError:
    print("Install dev dependencies: pip install numpy scipy statsmodels")
    sys.exit(1)

sys.path.insert(0, str(Path(__file__).parent.parent))
from app.nasa import generate_seed


def generate_rolls(n_rolls: int, dice_type: int = 6) -> np.ndarray:
    """Generate n dice rolls for testing."""
    import secrets
    rolls = []
    for _ in range(n_rolls):
        # Simulate NEO seed generation
        seed = generate_seed(
            secrets.randbelow(1000) + 0.1,
            secrets.randbelow(1000) + 0.1
        )
        combined = seed ^ secrets.randbits(32)
        result = (combined % dice_type) + 1
        rolls.append(result)
    return np.array(rolls)


def test_chi_square_uniformity():
    """Test that rolls are uniformly distributed."""
    rolls = generate_rolls(10000, 6)
    observed = np.bincount(rolls, minlength=7)[1:]  # Skip 0
    expected = np.full(6, 10000 / 6)

    chi2, p_value = stats.chisquare(observed, expected)

    print(f"\nChi-Square Test:")
    print(f"  Chi2 statistic: {chi2:.4f}")
    print(f"  P-value: {p_value:.4f}")

    # Fail if p < 0.01 (strong evidence of non-uniformity)
    assert p_value > 0.01, f"Distribution not uniform (p={p_value})"


def test_kolmogorov_smirnov():
    """Test against theoretical uniform distribution."""
    rolls = generate_rolls(10000, 20)
    # Normalize to [0, 1]
    normalized = (rolls - 1) / 19

    statistic, p_value = stats.kstest(normalized, 'uniform')

    print(f"\nKolmogorov-Smirnov Test:")
    print(f"  Statistic: {statistic:.4f}")
    print(f"  P-value: {p_value:.4f}")

    assert p_value > 0.01, f"Failed KS test (p={p_value})"


def test_autocorrelation():
    """Test for patterns/autocorrelation in sequence."""
    rolls = generate_rolls(1000, 6)

    result = acorr_ljungbox(rolls, lags=10, return_df=True)
    min_p = result['lb_pvalue'].min()

    print(f"\nLjung-Box Autocorrelation Test:")
    print(f"  Min P-value across lags: {min_p:.4f}")

    assert min_p > 0.01, f"Significant autocorrelation detected (p={min_p})"


def test_mean_variance():
    """Test that mean and variance match theoretical values."""
    rolls = generate_rolls(100000, 6)

    # For d6: mean = 3.5, variance = 35/12 ≈ 2.917
    expected_mean = 3.5
    expected_var = 35 / 12

    actual_mean = rolls.mean()
    actual_var = rolls.var()

    print(f"\nMean/Variance Test (d6, n=100000):")
    print(f"  Expected mean: {expected_mean}, Actual: {actual_mean:.4f}")
    print(f"  Expected var:  {expected_var:.4f}, Actual: {actual_var:.4f}")

    # Allow 5% deviation
    assert abs(actual_mean - expected_mean) < 0.05
    assert abs(actual_var - expected_var) < 0.15


if __name__ == '__main__':
    print("=" * 50)
    print("SpaceDice RNG Statistical Tests")
    print("=" * 50)

    test_chi_square_uniformity()
    test_kolmogorov_smirnov()
    test_autocorrelation()
    test_mean_variance()

    print("\n" + "=" * 50)
    print("All tests passed!")
    print("=" * 50)
